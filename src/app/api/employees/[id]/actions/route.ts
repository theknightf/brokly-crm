import { NextResponse } from 'next/server';
import {
  actionView,
  buildHistory,
  dbError,
  idParam,
  leadInfo,
  rangeQuerySchema,
  userNames,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/employees/[id]/actions?from=&to= — { upcoming, history } for the drawer Actions tab.
 * Upcoming = open actions assigned to the employee (any date). History = their finished actions in
 * the range plus the status changes they made (from the single action log, when present).
 */
export async function GET(request: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const employeeId = idParam.safeParse((await params).id);
  if (!employeeId.success) return NextResponse.json({ error: 'Invalid employee id' }, { status: 400 });
  if (!ctx.actor.isManager && ctx.actor.id !== employeeId.data) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const q = rangeQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return NextResponse.json({ error: zodMessage(q.error) }, { status: 400 });
  const { from, to } = q.data;
  const emp = employeeId.data;

  const cols = 'id, lead_id, call_id, type, status, note, due_at, done_at, assignee_id, created_by, created_at';
  let doneQ = ctx.db
    .from('lead_actions')
    .select(cols)
    .or(`assignee_id.eq.${emp},created_by.eq.${emp}`)
    .not('done_at', 'is', null)
    .order('done_at', { ascending: false })
    .limit(100);
  let statusQ = ctx.db
    .from('user_actions')
    .select('id, user_id, lead_id, created_at, payload')
    .eq('user_id', emp)
    .eq('action_type', 'STATUS_CHANGE')
    .order('created_at', { ascending: false })
    .limit(100);
  if (from) {
    doneQ = doneQ.gte('done_at', `${from}T00:00:00`);
    statusQ = statusQ.gte('created_at', `${from}T00:00:00`);
  }
  if (to) {
    doneQ = doneQ.lte('done_at', `${to}T23:59:59.999`);
    statusQ = statusQ.lte('created_at', `${to}T23:59:59.999`);
  }

  const [upRes, doneRes, statusRes] = await Promise.all([
    ctx.db
      .from('lead_actions')
      .select(cols)
      .eq('assignee_id', emp)
      .is('done_at', null)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200),
    doneQ,
    statusQ,
  ]);
  if (upRes.error) return dbError(upRes.error);
  if (doneRes.error) return dbError(doneRes.error);

  const up = (upRes.data || []) as any[];
  const done = (doneRes.data || []) as any[];
  const status = statusRes.error ? [] : ((statusRes.data || []) as any[]);

  const [names, leads] = await Promise.all([
    userNames(ctx.db, [
      ...up.flatMap((a) => [a.assignee_id, a.created_by]),
      ...done.flatMap((a) => [a.assignee_id, a.created_by]),
      ...status.map((s) => s.user_id),
    ]),
    leadInfo(ctx.db, [
      ...up.map((a) => a.lead_id),
      ...done.map((a) => a.lead_id),
      ...status.map((s) => s.lead_id),
    ]),
  ]);

  return NextResponse.json({
    upcoming: up.map((a) => actionView(a, names, leads)),
    history: buildHistory(done.map((a) => actionView(a, names, leads)), status, names, leads),
  });
}

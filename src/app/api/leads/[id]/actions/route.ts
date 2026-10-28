import { NextResponse } from 'next/server';
import {
  STATUS_TO_CRM,
  actionCreateSchema,
  actionView,
  buildHistory,
  dbError,
  idParam,
  leadInfo,
  userNames,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leads/[id]/actions — { upcoming, history } for one lead. */
export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const leadId = idParam.safeParse((await params).id);
  if (!leadId.success) return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });

  const cols = 'id, lead_id, call_id, type, status, note, due_at, done_at, assignee_id, created_by, created_at';
  const [upRes, doneRes, statusRes] = await Promise.all([
    ctx.db
      .from('lead_actions')
      .select(cols)
      .eq('lead_id', leadId.data)
      .is('done_at', null)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200),
    ctx.db
      .from('lead_actions')
      .select(cols)
      .eq('lead_id', leadId.data)
      .not('done_at', 'is', null)
      .order('done_at', { ascending: false })
      .limit(100),
    // Status changes come from the single action log; absent before that migration -> ignored.
    ctx.db
      .from('user_actions')
      .select('id, user_id, lead_id, created_at, payload')
      .eq('lead_id', leadId.data)
      .eq('action_type', 'STATUS_CHANGE')
      .order('created_at', { ascending: false })
      .limit(100),
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
    leadInfo(ctx.db, [leadId.data]),
  ]);

  return NextResponse.json({
    upcoming: up.map((a) => actionView(a, names, leads)),
    history: buildHistory(done.map((a) => actionView(a, names, leads)), status, names, leads),
  });
}

/** POST /api/leads/[id]/actions — a status update also moves the lead's current stage (atomic RPC). */
export async function POST(request: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const leadId = idParam.safeParse((await params).id);
  if (!leadId.success) return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });

  const parsed = actionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  const v = parsed.data;

  // Only managers/admins may hand work to someone else.
  if (v.assigneeId && v.assigneeId !== ctx.actor.id && !ctx.actor.isManager) {
    return NextResponse.json({ error: 'You can only assign actions to yourself.' }, { status: 403 });
  }

  const { data, error } = await ctx.db.rpc('create_lead_action', {
    p_lead_id: leadId.data,
    p_call_id: v.callId || null,
    p_type: v.type,
    p_status: v.status || null,
    p_note: v.note || null,
    p_due_at: v.dueAt || null,
    p_assignee_id: v.assigneeId || ctx.actor.id,
    p_new_crm_status: v.type === 'status_update' && v.status ? STATUS_TO_CRM[v.status] : null,
  });
  if (error) return dbError(error);

  const row = data as any;
  const [names, leads] = await Promise.all([
    userNames(ctx.db, [row.assignee_id, row.created_by]),
    leadInfo(ctx.db, [leadId.data]),
  ]);
  return NextResponse.json({ action: actionView(row, names, leads) }, { status: 201 });
}

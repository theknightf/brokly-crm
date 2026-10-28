import { NextResponse } from 'next/server';
import {
  dbError,
  idParam,
  leadInfo,
  noteView,
  rangeQuerySchema,
  userNames,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/employees/[id]/notes?from=&to= — notes written by that employee (drawer Notes tab). */
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

  let query = ctx.db
    .from('lead_notes')
    .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
    .eq('author_id', employeeId.data)
    .order('created_at', { ascending: false })
    .limit(200);
  if (q.data.from) query = query.gte('created_at', `${q.data.from}T00:00:00`);
  if (q.data.to) query = query.lte('created_at', `${q.data.to}T23:59:59.999`);
  const { data, error } = await query;
  if (error) return dbError(error);

  const rows = (data || []) as any[];
  const [names, leads] = await Promise.all([
    userNames(ctx.db, rows.map((r) => r.author_id)),
    leadInfo(ctx.db, rows.map((r) => r.lead_id)),
  ]);
  return NextResponse.json({ notes: rows.map((r) => noteView(r, names, leads)) });
}

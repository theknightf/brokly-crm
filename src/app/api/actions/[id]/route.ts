import { NextResponse } from 'next/server';
import {
  actionPatchSchema,
  actionView,
  dbError,
  idParam,
  leadInfo,
  userNames,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/actions/[id]  { done: boolean } — mark an action done / reopen it. */
export async function PATCH(request: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const id = idParam.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
  const parsed = actionPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });

  const { data: current, error: readErr } = await ctx.db
    .from('lead_actions')
    .select('id, assignee_id, created_by')
    .eq('id', id.data)
    .maybeSingle();
  if (readErr) return dbError(readErr);
  if (!current) return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  if (!ctx.actor.isManager && current.assignee_id !== ctx.actor.id && current.created_by !== ctx.actor.id) {
    return NextResponse.json({ error: 'This action is not assigned to you.' }, { status: 403 });
  }

  const { data, error } = await ctx.db
    .from('lead_actions')
    .update({ done_at: parsed.data.done ? new Date().toISOString() : null })
    .eq('id', id.data)
    .select('id, lead_id, call_id, type, status, note, due_at, done_at, assignee_id, created_by, created_at')
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return NextResponse.json({ error: 'You do not have permission to change this action.' }, { status: 403 });

  const [names, leads] = await Promise.all([
    userNames(ctx.db, [data.assignee_id, data.created_by]),
    leadInfo(ctx.db, [data.lead_id]),
  ]);
  return NextResponse.json({ action: actionView(data, names, leads) });
}

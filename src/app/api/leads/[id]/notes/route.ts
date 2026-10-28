import { NextResponse } from 'next/server';
import {
  dbError,
  idParam,
  leadInfo,
  noteCreateSchema,
  noteView,
  userNames,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leads/[id]/notes — notes the caller may see for this lead (RLS: own, or all for managers/admins). */
export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const leadId = idParam.safeParse((await params).id);
  if (!leadId.success) return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });

  const { data, error } = await ctx.db
    .from('lead_notes')
    .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
    .eq('lead_id', leadId.data)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return dbError(error);

  const rows = (data || []) as any[];
  const [names, leads] = await Promise.all([
    userNames(ctx.db, rows.map((r) => r.author_id)),
    leadInfo(ctx.db, [leadId.data]),
  ]);
  return NextResponse.json({ notes: rows.map((r) => noteView(r, names, leads)) });
}

/** POST /api/leads/[id]/notes  { body, callId? } */
export async function POST(request: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const leadId = idParam.safeParse((await params).id);
  if (!leadId.success) return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });

  const parsed = noteCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });

  if (parsed.data.callId) {
    const { data: call } = await ctx.db
      .from('call_logs')
      .select('id')
      .eq('id', parsed.data.callId)
      .or(`entity_id.eq.${leadId.data},lead_id.eq.${leadId.data}`)
      .maybeSingle();
    if (!call) return NextResponse.json({ error: 'That call does not belong to this lead.' }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from('lead_notes')
    .insert({
      lead_id: leadId.data,
      call_id: parsed.data.callId || null,
      author_id: ctx.actor.id,
      body: parsed.data.body,
    })
    .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
    .single();
  if (error) return dbError(error);

  const [names, leads] = await Promise.all([
    userNames(ctx.db, [data.author_id]),
    leadInfo(ctx.db, [leadId.data]),
  ]);
  return NextResponse.json({ note: noteView(data, names, leads) }, { status: 201 });
}

import { NextResponse } from 'next/server';
import {
  NOTE_EDIT_WINDOW_MS,
  dbError,
  idParam,
  leadInfo,
  noteUpdateSchema,
  noteView,
  userNames,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Who may change a note: its author within 15 minutes of creating it, or an admin/owner at any time.
 * The same rule is enforced again by RLS on lead_notes.
 */
async function loadEditable(ctx: Extract<Awaited<ReturnType<typeof workContext>>, { ok: true }>, id: string) {
  const { data: note, error } = await ctx.db
    .from('lead_notes')
    .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return { response: dbError(error) };
  if (!note) return { response: NextResponse.json({ error: 'Note not found' }, { status: 404 }) };
  if (!ctx.actor.isAdmin) {
    if (note.author_id !== ctx.actor.id) {
      return { response: NextResponse.json({ error: 'You can only change your own notes.' }, { status: 403 }) };
    }
    if (Date.now() - new Date(note.created_at).getTime() > NOTE_EDIT_WINDOW_MS) {
      return {
        response: NextResponse.json(
          { error: 'Notes can only be changed within 15 minutes.' },
          { status: 403 }
        ),
      };
    }
  }
  return { note };
}

/** PATCH /api/notes/[id]  { body } */
export async function PATCH(request: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const id = idParam.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });
  const parsed = noteUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });

  const found = await loadEditable(ctx, id.data);
  if ('response' in found && found.response) return found.response;

  const { data, error } = await ctx.db
    .from('lead_notes')
    .update({ body: parsed.data.body })
    .eq('id', id.data)
    .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return NextResponse.json({ error: 'You do not have permission to change this note.' }, { status: 403 });

  const [names, leads] = await Promise.all([
    userNames(ctx.db, [data.author_id]),
    leadInfo(ctx.db, [data.lead_id]),
  ]);
  return NextResponse.json({ note: noteView(data, names, leads) });
}

/** DELETE /api/notes/[id] */
export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const id = idParam.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });

  const found = await loadEditable(ctx, id.data);
  if ('response' in found && found.response) return found.response;

  const { data, error } = await ctx.db.from('lead_notes').delete().eq('id', id.data).select('id');
  if (error) return dbError(error);
  if (!data?.length) {
    return NextResponse.json({ error: 'You do not have permission to delete this note.' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

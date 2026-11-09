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
import { parseCommentBody } from '@/lib/leadNotes';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/employees/[id]/notes?from=&to= — everything that employee wrote, newest first (profile Notes tab):
 *  - comments written on leads (the Notes section and the text typed in the call dialog), with the customer and its stage;
 *  - call notes saved from the drawer (lead_notes).
 * Automatic entries (phone sync lines, the "Call outcome logged" placeholder) are not notes and are left out.
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

  let notesQ = ctx.db
    .from('lead_notes')
    .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
    .eq('author_id', employeeId.data)
    .order('created_at', { ascending: false })
    .limit(200);
  let commentsQ = ctx.db
    .from('lead_comments')
    .select('id, lead_id, user_id, body, created_at')
    .eq('user_id', employeeId.data)
    .order('created_at', { ascending: false })
    .limit(500);
  if (q.data.from) {
    notesQ = notesQ.gte('created_at', `${q.data.from}T00:00:00`);
    commentsQ = commentsQ.gte('created_at', `${q.data.from}T00:00:00`);
  }
  if (q.data.to) {
    notesQ = notesQ.lte('created_at', `${q.data.to}T23:59:59.999`);
    commentsQ = commentsQ.lte('created_at', `${q.data.to}T23:59:59.999`);
  }
  const [{ data: noteRows, error }, { data: commentRows, error: cErr }] = await Promise.all([notesQ, commentsQ]);
  if (error) return dbError(error);
  if (cErr) return dbError(cErr);

  const notes = (noteRows || []) as any[];
  const comments = ((commentRows || []) as any[])
    .map((c) => ({ c, p: parseCommentBody(c.body) }))
    .filter((x) => x.p.written);

  const leadIds = [...notes.map((r) => r.lead_id), ...comments.map((x) => x.c.lead_id)];
  const [names, leads] = await Promise.all([
    userNames(ctx.db, [employeeId.data, ...notes.map((r) => r.author_id)]),
    leadInfo(ctx.db, leadIds),
  ]);
  // Stage of each customer (leadInfo only carries name / phone).
  const stages = new Map<string, string>();
  const uniq = Array.from(new Set(leadIds.filter(Boolean))) as string[];
  for (let i = 0; i < uniq.length; i += 100) {
    const { data } = await ctx.db.from('leads').select('id, crm_status').in('id', uniq.slice(i, i + 100));
    for (const l of (data || []) as any[]) stages.set(l.id, l.crm_status || '');
  }

  const author = names.get(employeeId.data) || 'Unknown';
  const merged = [
    ...notes.map((r) => ({
      ...noteView(r, names, leads),
      kind: 'note' as const,
      leadStatus: stages.get(r.lead_id) || null,
    })),
    ...comments.map(({ c, p }) => ({
      id: c.id as string,
      leadId: c.lead_id as string,
      leadName: leads.get(c.lead_id)?.name || null,
      callId: null,
      authorId: c.user_id as string,
      authorName: author,
      body: p.text,
      createdAt: c.created_at as string,
      updatedAt: c.created_at as string,
      edited: false,
      kind: 'comment' as const,
      leadStatus: stages.get(c.lead_id) || null,
      callOutcome: p.outcome || null,
      callSeconds: p.outcome ? (p.seconds ?? 0) : null,
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 300);

  return NextResponse.json({ notes: merged });
}

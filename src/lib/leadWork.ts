import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

import { ACTION_STATUSES, ACTION_TYPES } from "@/lib/leadWorkShared";
export { NOTE_MAX, NOTE_EDIT_WINDOW_MS, ACTION_TYPES, ACTION_STATUSES, CALL_RESULTS } from "@/lib/leadWorkShared";
export type { CallResult } from "@/lib/leadWorkShared";
import { NOTE_MAX } from "@/lib/leadWorkShared";


/** Drawer status -> the lead's pipeline stage (leads.crm_status). */
export const STATUS_TO_CRM: Record<(typeof ACTION_STATUSES)[number], string> = {
  Interested: 'Interested',
  'Follow-up': 'Following Up',
  'Meeting scheduled': 'Meeting',
  'Not interested': 'Not Interested',
  'Wrong number': 'Wrong Number',
  Retry: 'No Answer',
  'Closed/Deal': 'Done Deal',
};


const uuid = z.string().uuid();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const noteCreateSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(NOTE_MAX, `Max ${NOTE_MAX} characters`),
  callId: uuid.nullish(),
});
export const noteUpdateSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(NOTE_MAX, `Max ${NOTE_MAX} characters`),
});

export const actionCreateSchema = z
  .object({
    type: z.enum(ACTION_TYPES.map((t) => t.value) as [string, ...string[]]),
    status: z.enum(ACTION_STATUSES).nullish(),
    note: z.string().trim().max(NOTE_MAX).nullish(),
    dueAt: z.string().datetime({ offset: true }).nullish(),
    assigneeId: uuid.nullish(),
    callId: uuid.nullish(),
  })
  .refine((v) => v.type !== 'status_update' || !!v.status, {
    message: 'Pick the new status',
    path: ['status'],
  });
export const actionPatchSchema = z.object({ done: z.boolean() });

export const employeeCallsQuerySchema = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  result: z.enum(['connected', 'no_answer', 'incoming', 'other']).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const rangeQuerySchema = z.object({ from: isoDay.optional(), to: isoDay.optional() });

export const idParam = uuid;

export function zodMessage(err: z.ZodError): string {
  return err.issues[0]?.message || 'Invalid input';
}

export interface WorkActor {
  id: string;
  role: string;
  isAdmin: boolean;
  isManager: boolean;
}

/** owner / admin / manager may read everything; only owner / admin may edit others' notes. */
export function isManagerRole(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return isAdminRole(role) || r === 'manager';
}

/** Auth + role for a route. Returns the RLS-scoped client so every query stays under RLS. */
export async function workContext(): Promise<
  | { ok: true; db: any; actor: WorkActor }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return {
    ok: true,
    db: supabase as any,
    actor: {
      id: user.id,
      role: String(profile.role || ''),
      isAdmin: isAdminRole(profile.role),
      isManager: isManagerRole(profile.role),
    },
  };
}

/** Map a database error to an HTTP status without leaking internals. */
export function dbError(error: any): NextResponse {
  const code = String(error?.code || '');
  if (code === '42501' || /row-level security|permission denied/i.test(String(error?.message))) {
    return NextResponse.json({ error: 'You do not have permission to do that.' }, { status: 403 });
  }
  if (code === 'P0002') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (code === '23503') return NextResponse.json({ error: 'Linked record not found' }, { status: 400 });
  if (/relation .* does not exist|PGRST205|42P01/i.test(`${code} ${error?.message}`)) {
    return NextResponse.json({ error: 'This feature is not set up yet.' }, { status: 503 });
  }
  return NextResponse.json({ error: error?.message || 'Request failed' }, { status: 400 });
}

/** Names for a set of user ids (RLS-scoped; unknown ids simply have no name). */
export async function userNames(db: any, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const clean = Array.from(new Set(ids.filter(Boolean))) as string[];
  const map = new Map<string, string>();
  if (!clean.length) return map;
  const { data } = await db.from('user_profiles').select('id, full_name, email').in('id', clean);
  for (const u of (data || []) as any[]) map.set(u.id, u.full_name || u.email || 'User');
  return map;
}

/** Lead name / phone for a set of ids (RLS-scoped: hidden leads simply have no entry). */
export async function leadInfo(
  db: any,
  ids: (string | null | undefined)[]
): Promise<Map<string, { name: string; phone: string }>> {
  const clean = Array.from(new Set(ids.filter(Boolean))) as string[];
  const map = new Map<string, { name: string; phone: string }>();
  if (!clean.length) return map;
  const { data } = await db.from('leads').select('id, name, phone').in('id', clean);
  for (const l of (data || []) as any[]) map.set(l.id, { name: l.name || '', phone: l.phone || '' });
  return map;
}

export const noteView = (
  n: any,
  names: Map<string, string>,
  leads: Map<string, { name: string; phone: string }>
) => ({
  id: n.id as string,
  leadId: n.lead_id as string,
  leadName: leads.get(n.lead_id)?.name || null,
  callId: (n.call_id as string | null) || null,
  authorId: (n.author_id as string | null) || null,
  authorName: (n.author_id && names.get(n.author_id)) || 'Unknown',
  body: n.body as string,
  createdAt: n.created_at as string,
  updatedAt: n.updated_at as string,
  edited: new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 2000,
});

export const actionView = (
  a: any,
  names: Map<string, string>,
  leads: Map<string, { name: string; phone: string }>
) => ({
  id: a.id as string,
  leadId: a.lead_id as string,
  leadName: leads.get(a.lead_id)?.name || null,
  callId: (a.call_id as string | null) || null,
  type: a.type as string,
  status: (a.status as string | null) || null,
  note: (a.note as string | null) || null,
  dueAt: (a.due_at as string | null) || null,
  doneAt: (a.done_at as string | null) || null,
  assigneeId: (a.assignee_id as string | null) || null,
  assigneeName: (a.assignee_id && names.get(a.assignee_id)) || null,
  createdBy: (a.created_by as string | null) || null,
  createdByName: (a.created_by && names.get(a.created_by)) || 'Unknown',
  createdAt: a.created_at as string,
});

/** Past actions + status changes as one read-only timeline (newest first). */
export function buildHistory(
  doneActions: ReturnType<typeof actionView>[],
  statusChanges: any[],
  names: Map<string, string>,
  leads: Map<string, { name: string; phone: string }>
) {
  const typeLabel = (t: string) => ACTION_TYPES.find((x) => x.value === t)?.label || t;
  const entries = [
    ...doneActions.map((a) => ({
      id: `a-${a.id}`,
      kind: 'action' as const,
      at: a.doneAt || a.createdAt,
      byName: a.createdByName,
      label: typeLabel(a.type) + (a.status ? ` · ${a.status}` : ''),
      note: a.note,
      leadName: a.leadName,
      from: null as string | null,
      to: null as string | null,
    })),
    ...statusChanges.map((s: any) => ({
      id: `s-${s.id}`,
      kind: 'status_change' as const,
      at: s.created_at as string,
      byName: (s.user_id && names.get(s.user_id)) || 'Unknown',
      label: 'Status change',
      note: null as string | null,
      leadName: (s.lead_id && leads.get(s.lead_id)?.name) || null,
      from: (s.payload?.old_status as string | null) || null,
      to: (s.payload?.new_status as string | null) || null,
    })),
  ];
  return entries.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

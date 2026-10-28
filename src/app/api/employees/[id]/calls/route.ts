import { NextResponse } from 'next/server';
import { verifyCall } from '@/lib/callVerification';
import {
  CALL_RESULTS,
  type CallResult,
  dbError,
  employeeCallsQuerySchema,
  idParam,
  leadInfo,
  workContext,
  zodMessage,
} from '@/lib/leadWork';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 100;
const MAX_ROUNDS = 6;

function classifyCall(row: {
  channel?: string;
  direction?: string;
  duration_seconds?: number;
  outcome?: string;
}): CallResult {
  const cat = verifyCall(row).category;
  if (cat === 'Incoming Call') return 'incoming';
  if (cat === 'Successful') return 'connected';
  if (cat === 'No Answer') return 'no_answer';
  return 'other';
}

/**
 * GET /api/employees/[id]/calls?from=&to=&result=&cursor=&limit=
 * Newest first, keyset-paginated ("created_at|id" cursor). The result filter is applied after
 * classification (same rules as the call-logs report) so it always matches the pill shown.
 * Managers/admins may read any employee; everyone else only themselves. RLS still applies.
 */
export async function GET(request: Request, { params }: Ctx) {
  const ctx = await workContext();
  if (!ctx.ok) return ctx.response;
  const employeeId = idParam.safeParse((await params).id);
  if (!employeeId.success) return NextResponse.json({ error: 'Invalid employee id' }, { status: 400 });
  if (!ctx.actor.isManager && ctx.actor.id !== employeeId.data) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = employeeCallsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return NextResponse.json({ error: zodMessage(q.error) }, { status: 400 });
  const { from, to, result, limit } = q.data;

  let cursor: { at: string; id: string } | null = null;
  if (q.data.cursor) {
    const [at, id] = q.data.cursor.split('|');
    if (!at || !id || Number.isNaN(new Date(at).getTime()) || !idParam.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
    cursor = { at, id };
  }

  const collected: any[] = [];
  let exhausted = false;

  for (let round = 0; round < MAX_ROUNDS && collected.length < limit && !exhausted; round++) {
    let query = ctx.db
      .from('call_logs')
      .select(
        'id, user_id, entity_id, lead_id, contact_name, contact_phone, direction, channel, duration_seconds, outcome, created_at'
      )
      .eq('user_id', employeeId.data)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(BATCH);
    if (from) query = query.gte('created_at', `${from}T00:00:00`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999`);
    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`
      );
    }
    const { data, error } = await query;
    if (error) return dbError(error);

    const rows = (data || []) as any[];
    if (rows.length < BATCH) exhausted = true;

    for (const r of rows) {
      cursor = { at: r.created_at, id: r.id };
      const res = classifyCall(r);
      if (result && res !== result) continue;
      collected.push({ ...r, result: res });
      if (collected.length >= limit) {
        // More rows may follow this one (rest of this batch, or further batches).
        exhausted = false;
        break;
      }
    }
  }
  const nextCursor = !exhausted && cursor ? `${cursor.at}|${cursor.id}` : null;

  const leadIdOf = (r: any): string | null =>
    (r.entity_id && UUID_RE.test(r.entity_id) ? r.entity_id : r.lead_id) || null;
  const leads = await leadInfo(ctx.db, collected.map(leadIdOf));

  return NextResponse.json({
    calls: collected.map((r) => {
      const leadId = leadIdOf(r);
      return {
        id: r.id as string,
        leadId,
        leadName: (leadId && leads.get(leadId)?.name) || r.contact_name || null,
        phone: (leadId && leads.get(leadId)?.phone) || r.contact_phone || null,
        createdAt: r.created_at as string,
        direction: r.direction === 'incoming' ? 'incoming' : 'outgoing',
        result: r.result as CallResult,
        durationSeconds: Math.max(0, Math.floor(Number(r.duration_seconds) || 0)),
      };
    }),
    nextCursor,
    results: CALL_RESULTS,
  });
}

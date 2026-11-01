import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/** Shared plumbing for /api/reports/analytics/* (typed filters -> RPC arguments, auth, errors). */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

const filterSchema = z.object({
  assignFrom: day.optional(),
  assignTo: day.optional(),
  actionFrom: day.optional(),
  actionTo: day.optional(),
  createdFrom: day.optional(),
  createdTo: day.optional(),
  source: z.string().trim().max(200).optional(),
  channel: z.string().trim().max(100).optional(),
  isCold: z.enum(['yes', 'no']).optional(),
  createdBy: uuid.optional(),
  userId: uuid.optional(),
});

export type AnalyticsFilterParams = z.infer<typeof filterSchema>;

/** Reads the filter query params; empty values are dropped, invalid ones are rejected. */
export function parseFilters(
  sp: URLSearchParams
): { ok: true; params: AnalyticsFilterParams } | { ok: false; response: NextResponse } {
  const raw: Record<string, string> = {};
  for (const k of Object.keys(filterSchema.shape)) {
    const v = sp.get(k);
    if (v !== null && v.trim() !== '' && v !== 'any') raw[k] = v.trim();
  }
  const parsed = filterSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid filter: ' + (parsed.error.issues[0]?.path.join('.') || '') }, { status: 400 }),
    };
  }
  return { ok: true, params: parsed.data };
}

/** Auth + the RLS-scoped client every report query runs through. */
export async function analyticsContext(): Promise<
  { ok: true; db: any } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, db: supabase as any };
}

/** Missing migration -> 503 with a clear message; anything else -> 400 without internals. */
export function rpcFailure(error: any): NextResponse {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  if (/PGRST202|42883|report_(calls|call|assigned|filter)/i.test(text) && /not exist|could not find|PGRST202|42883/i.test(text)) {
    return NextResponse.json(
      { error: 'Analytics is not set up yet: the reporting functions are missing in the database.' },
      { status: 503 }
    );
  }
  if (/permission denied|row-level security/i.test(text)) {
    return NextResponse.json({ error: 'You do not have access to this report.' }, { status: 403 });
  }
  return NextResponse.json({ error: error?.message || 'Report query failed' }, { status: 400 });
}

export const intParam = (sp: URLSearchParams, key: string, def: number, min: number, max: number) => {
  const n = Number(sp.get(key));
  return Number.isFinite(n) && sp.get(key) !== null ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};

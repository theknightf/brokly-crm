import { pushDuplicateReviewOwners, type DuplicateOwnerNotice } from '@/lib/duplicateNotify';

type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
};

/** Fields of a submitted lead that are kept in duplicate_leads.attempted_data. */
export interface AttemptInput {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  source?: unknown;
  notes?: unknown;
  project?: unknown;
  developer?: unknown;
  location?: unknown;
  propertyType?: unknown;
  property_type?: unknown;
  unit?: unknown;
  budgetMin?: unknown;
  budgetMax?: unknown;
  budget_min?: unknown;
  budget_max?: unknown;
  status?: unknown;
  stage?: unknown;
  agent?: unknown;
}

const str = (v: unknown, max = 4000): string => String(v ?? '').trim().slice(0, max);

/** Whitelist + snake_case a submitted lead before it is stored as attempted_data. */
export function toAttemptedData(r: AttemptInput): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const put = (k: string, v: unknown, max?: number) => {
    const s = str(v, max);
    if (s) out[k] = s;
  };
  put('name', r.name, 200);
  put('phone', r.phone, 50);
  put('email', r.email, 200);
  put('source', r.source, 200);
  put('notes', r.notes);
  put('project', r.project, 200);
  put('developer', r.developer, 200);
  put('location', r.location, 200);
  put('property_type', r.propertyType ?? r.property_type, 100);
  put('unit', r.unit, 100);
  put('stage', r.stage ?? r.status, 100);
  put('agent', r.agent, 200);
  const bmin = Number(r.budgetMin ?? r.budget_min ?? 0);
  const bmax = Number(r.budgetMax ?? r.budget_max ?? 0);
  if (Number.isFinite(bmin) && bmin > 0) out.budget_min = bmin;
  if (Number.isFinite(bmax) && bmax > 0) out.budget_max = bmax;
  return out;
}

export interface DuplicateCheckResult {
  /** duplicates[i] is true when rows[i] already exists and must NOT be created. */
  duplicates: boolean[];
  /** false when the database function is not installed yet (fail-open). */
  checked: boolean;
}

/**
 * Server-only. Runs the SECURITY DEFINER check, records every attempt in
 * duplicate_leads, and sends web push to the original owners. The result only
 * says which rows are duplicates, never who owns the original.
 */
export async function checkAndRecordDuplicates(
  supabase: Rpc,
  rows: AttemptInput[]
): Promise<DuplicateCheckResult> {
  const duplicates = rows.map(() => false);
  if (!rows.length) return { duplicates, checked: true };

  const { data, error } = await supabase.rpc('check_and_record_duplicates', {
    p_rows: rows.map(toAttemptedData),
  });
  if (error) {
    // Migration not applied yet: keep the app working (legacy flagging still runs).
    if (/check_and_record_duplicates|PGRST202|42883/i.test(`${error.code} ${error.message}`)) {
      return { duplicates, checked: false };
    }
    throw new Error(error.message || 'Duplicate check failed');
  }

  const payload = (data || {}) as {
    results?: { idx: number; duplicate: boolean }[];
    owners?: DuplicateOwnerNotice[];
  };
  for (const r of payload.results || []) {
    if (r.duplicate && r.idx >= 0 && r.idx < duplicates.length) duplicates[r.idx] = true;
  }
  void pushDuplicateReviewOwners(payload.owners || []);
  return { duplicates, checked: true };
}

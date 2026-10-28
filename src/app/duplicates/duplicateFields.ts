import { normalizePhone } from '@/lib/phone';

export type DuplicateFieldKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'source'
  | 'project'
  | 'developer'
  | 'location'
  | 'property_type'
  | 'unit'
  | 'budget_min'
  | 'budget_max';

export const DUPLICATE_FIELDS: { key: DuplicateFieldKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'source', label: 'Source' },
  { key: 'project', label: 'Project' },
  { key: 'developer', label: 'Developer' },
  { key: 'location', label: 'Location' },
  { key: 'property_type', label: 'Property type' },
  { key: 'unit', label: 'Unit' },
  { key: 'budget_min', label: 'Budget min' },
  { key: 'budget_max', label: 'Budget max' },
];

export interface DuplicatePerson {
  id: string;
  name: string;
  role: string;
}

export interface DuplicateItem {
  id: string;
  status: 'pending' | 'merged' | 'dismissed';
  createdAt: string;
  lastAttemptAt: string;
  attemptCount: number;
  matchType: 'phone' | 'email';
  resolvedAt: string | null;
  resolvedBy: DuplicatePerson | null;
  attemptedBy: DuplicatePerson | null;
  originalAddedBy: DuplicatePerson | null;
  firstOwner: DuplicatePerson | null;
  currentOwner: DuplicatePerson | null;
  existing: Record<string, any> | null;
  submitted: Record<string, any>;
}

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '' || v === 0 || v === '0';

export function displayValue(key: DuplicateFieldKey | 'notes', v: unknown): string {
  if (isBlank(v)) return '';
  if (key === 'budget_min' || key === 'budget_max') {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toLocaleString()} EGP` : String(v);
  }
  return String(v).trim();
}

/** True when the submission carries a value for the field that differs from the existing lead. */
export function fieldDiffers(
  key: DuplicateFieldKey,
  existing: Record<string, any> | null,
  submitted: Record<string, any>
): boolean {
  const next = submitted?.[key];
  if (isBlank(next)) return false;
  const cur = existing?.[key];
  if (isBlank(cur)) return true;
  if (key === 'phone') return normalizePhone(cur) !== normalizePhone(next);
  if (key === 'budget_min' || key === 'budget_max') return Number(cur) !== Number(next);
  return String(cur).trim().toLowerCase() !== String(next).trim().toLowerCase();
}

export function differingFields(
  existing: Record<string, any> | null,
  submitted: Record<string, any>
): DuplicateFieldKey[] {
  return DUPLICATE_FIELDS.filter((f) => fieldDiffers(f.key, existing, submitted)).map((f) => f.key);
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Tell the sidebar / bell badges to refetch the pending count. */
export const DUPLICATES_CHANGED_EVENT = 'brokly:duplicates-changed';

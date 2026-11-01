import type { FilterState } from './types';

/** "+201012345678" -> "+20 10******" (country code + operator prefix, rest hidden). Null-safe. */
export function maskPhone(phone: string | null | undefined): string {
  const raw = String(phone ?? '').trim();
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return raw;
  const national = digits.startsWith('0020')
    ? digits.slice(4)
    : digits.startsWith('20') && digits.length >= 12
      ? digits.slice(2)
      : digits.replace(/^0/, '');
  return `+20 ${national.slice(0, 2)}${'*'.repeat(Math.max(6, national.length - 2))}`;
}

/** 38 -> "00:38", 3725 -> "62:05" (mm:ss, minutes may exceed 59) */
export function formatMmSs(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "01-11-2026 12:39" in Cairo time (the reports use Africa/Cairo days). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
}

export const nf = (n: number | null | undefined, digits = 0) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const initials = (name: string | null | undefined) =>
  String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';

/** FilterState -> query string understood by /api/reports/analytics/* (empty values are omitted). */
export function filtersToQuery(f: FilterState, extra: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams();
  const put = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  };
  put('assignFrom', f.assignDate.from);
  put('assignTo', f.assignDate.to);
  put('actionFrom', f.actionDate.from);
  put('actionTo', f.actionDate.to);
  put('createdFrom', f.creationDate.from);
  put('createdTo', f.creationDate.to);
  put('source', f.source);
  put('channel', f.channel);
  put('isCold', f.isColdCall === 'any' ? '' : f.isColdCall);
  put('createdBy', f.createdBy);
  Object.entries(extra).forEach(([k, v]) => put(k, v));
  return q.toString();
}

export const activeFilterCount = (f: FilterState): number =>
  [
    f.assignDate.from || f.assignDate.to,
    f.actionDate.from || f.actionDate.to,
    f.creationDate.from || f.creationDate.to,
    f.source,
    f.channel,
    f.isColdCall !== 'any',
    f.createdBy,
  ].filter(Boolean).length;

/** fetch JSON; throws an Error carrying the server's message. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error || `Request failed (${res.status})`);
  return j as T;
}

/** Downloads rows as CSV (opens in Excel). Values are quoted; leading = + - @ are neutralised. */
export function exportCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

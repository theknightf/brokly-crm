'use client';
import React from 'react';
import { Inbox } from 'lucide-react';
import { formatDuration, type CallItem, type CallResult } from '@/lib/leadWorkShared';

/** fetch JSON and surface the server's error message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || 'Request failed');
  return j as T;
}

export const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const RESULT_LABEL: Record<CallResult, string> = {
  connected: 'Connected',
  no_answer: 'No answer',
  incoming: 'Incoming',
  other: 'Other',
};

const RESULT_CLS: Record<CallResult, string> = {
  connected: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  no_answer: 'bg-muted text-muted-foreground',
  incoming: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  other: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

export function ResultPill({ result }: { result: CallResult }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RESULT_CLS[result]}`}>
      {RESULT_LABEL[result]}
    </span>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-3">
          <div className="h-3.5 w-1/3 rounded bg-muted" />
          <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
      <Inbox size={22} aria-hidden="true" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
        Try again
      </button>
    </div>
  );
}

/** "Lead name · 14:05" label used by the link pickers. */
export const callLabel = (c: CallItem) =>
  `${c.leadName || c.phone || 'Unknown lead'} · ${fmtDateTime(c.createdAt)} · ${formatDuration(c.durationSeconds)}`;

/** Select listing the loaded calls so a note / action can be linked to one. */
export function CallLinkSelect({
  calls,
  value,
  onChange,
  id,
}: {
  calls: CallItem[];
  value: string;
  onChange: (callId: string) => void;
  id: string;
}) {
  const linkable = calls.filter((c) => c.leadId);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-base h-11 min-h-[44px] text-base sm:text-sm"
    >
      <option value="">{linkable.length ? 'Choose the call this is about' : 'No calls in this period'}</option>
      {linkable.map((c) => (
        <option key={c.id} value={c.id}>
          {callLabel(c)}
        </option>
      ))}
    </select>
  );
}

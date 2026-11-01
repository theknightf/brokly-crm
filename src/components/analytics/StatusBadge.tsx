import React from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { CallBucket } from './types';

const BASE = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

const BUCKET: Record<CallBucket, { label: string; cls: string }> = {
  answered: { label: 'Answer', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  no_answer: { label: 'No Answer', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  closed: { label: 'Closed', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

/** Call result badge: emerald = answered, amber = no answer / busy, rose = closed / wrong number. */
export function OutcomeBadge({ bucket, outcome }: { bucket: CallBucket; outcome?: string | null }) {
  const b = BUCKET[bucket] || BUCKET.answered;
  return (
    <span className={`${BASE} ${b.cls}`} title={outcome || undefined}>
      {b.label}
    </span>
  );
}

/** Call type badge with a direction arrow (cyan = incoming). */
export function DirectionBadge({ direction }: { direction: string | null | undefined }) {
  const incoming = direction === 'incoming';
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={`${BASE} ${
        incoming
          ? 'border-cyan-400/20 bg-cyan-400/10 text-[#00EBFF]'
          : 'border-slate-600/40 bg-slate-700/30 text-slate-300'
      }`}
    >
      <Icon size={12} aria-hidden="true" />
      {incoming ? 'Incoming' : 'Outgoing'}
    </span>
  );
}

/** Small numeric pill used by the funnel grid. */
export function CountBadge({ value, tone = 'slate', href }: { value: number; tone?: 'slate' | 'lime' | 'purple' | 'emerald'; href?: string }) {
  const tones = {
    slate: 'bg-slate-800/70 text-slate-200 border-slate-700/60',
    lime: 'bg-lime-400/10 text-lime-400 border-lime-400/20',
    purple: 'bg-violet-600/15 text-violet-300 border-violet-500/25',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  } as const;
  const cls = `inline-flex min-w-[2.5rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${tones[tone]}`;
  // Counts open the matching leads in Leads Management (nothing to open when the count is 0).
  if (href && value > 0) {
    return (
      <Link href={href} className={`${cls} hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400`} title="Open these leads">
        {value}
      </Link>
    );
  }
  return <span className={cls}>{value}</span>;
}

/** /leads-management deep link: owner by name and/or an exact stage. */
export function leadsLink(agentName?: string, stage?: string): string {
  const q = new URLSearchParams();
  if (agentName) q.set('agent', agentName);
  if (stage) q.set('status', stage);
  const s = q.toString();
  return s ? `/leads-management?${s}` : '/leads-management';
}

/** Skeleton + empty + error building blocks shared by the analytics views. */
export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-800/50" />
      ))}
    </div>
  );
}

export function PanelEmpty({ text }: { text: string }) {
  return <p className="px-4 py-12 text-center text-sm text-slate-500">{text}</p>;
}

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
        Try again
      </button>
    </div>
  );
}

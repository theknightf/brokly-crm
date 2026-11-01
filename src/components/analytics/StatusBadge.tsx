import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { CallDirection, CallOutcome } from './types';

const BASE = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

const OUTCOME: Record<CallOutcome, { label: string; cls: string }> = {
  answered: { label: 'Answer', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  no_answer: { label: 'No Answer', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  busy: { label: 'Busy', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  failed: { label: 'Failed', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  closed: { label: 'Closed', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

/** Call result badge: emerald = answered, amber = no answer / busy, rose = failed / closed. */
export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  const o = OUTCOME[outcome];
  return <span className={`${BASE} ${o.cls}`}>{o.label}</span>;
}

/** Call type badge with a direction arrow (cyan = incoming). */
export function DirectionBadge({ direction }: { direction: CallDirection }) {
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
export function CountBadge({ value, tone = 'slate' }: { value: number; tone?: 'slate' | 'lime' | 'purple' | 'emerald' }) {
  const tones = {
    slate: 'bg-slate-800/70 text-slate-200 border-slate-700/60',
    lime: 'bg-lime-400/10 text-lime-400 border-lime-400/20',
    purple: 'bg-violet-600/15 text-violet-300 border-violet-500/25',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  } as const;
  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${tones[tone]}`}
    >
      {value}
    </span>
  );
}

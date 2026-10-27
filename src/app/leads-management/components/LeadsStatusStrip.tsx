'use client';
import React from 'react';
import { FilterState } from './LeadsManagementScreen';
import { PIPELINE_STAGES } from './leadStages';
import { accentFor } from '@/app/components/KpiCardsGrid';
import { useLanguage } from '@/contexts/LanguageContext';

interface LeadsStatusStripProps {
  filters: FilterState;
  statusCounts: Record<string, number>;
  /** Total rows for the current filters, used when per-status counts are not loaded yet. */
  total: number;
  onSelect: (status: FilterState['status']) => void;
}

/**
 * Pipeline pills with live counts (All + every forward stage). Clicking a pill
 * applies that status to the list; clicking the active one (or "All") clears it.
 * Counts come from leadsService.getStatusCounts, already scoped by the other filters.
 */
export default function LeadsStatusStrip({ filters, statusCounts, total, onSelect }: LeadsStatusStripProps) {
  const { t, lang } = useLanguage();
  const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US');
  const counted = Object.values(statusCounts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const allCount = counted > 0 ? counted : total;

  const pill = (active: boolean) =>
    `inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 min-h-[32px] text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 [@media(pointer:coarse)]:min-h-[44px] ${
      active
        ? 'border-lime-500/60 bg-lime-400/15 text-lime-800 dark:text-lime-300 shadow-[0_0_0_1px_rgba(163,230,53,0.15)]'
        : 'border-black/10 dark:border-white/10 bg-white dark:bg-[#12121a] text-zinc-600 dark:text-zinc-300 hover:border-lime-500/40 hover:text-foreground'
    }`;

  const count = (n: number, active: boolean) => (
    <span
      className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
        active ? 'bg-lime-500/20 text-lime-800 dark:text-lime-200' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400'
      }`}
    >
      {nf.format(n)}
    </span>
  );

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label={t('leads.colStage')}
    >
      <button type="button" onClick={() => onSelect('')} aria-pressed={!filters.status} className={`${pill(!filters.status)} snap-start`}>
        {t('leads.allLeadsPill')}
        {count(allCount, !filters.status)}
      </button>
      {PIPELINE_STAGES.map((stage) => {
        const active = filters.status === stage;
        const accent = accentFor(stage);
        return (
          <button
            key={stage}
            type="button"
            onClick={() => onSelect(active ? '' : stage)}
            aria-pressed={active}
            className={`${pill(active)} snap-start`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} aria-hidden />
            {stage}
            {count(statusCounts?.[stage] ?? 0, active)}
          </button>
        );
      })}
    </div>
  );
}

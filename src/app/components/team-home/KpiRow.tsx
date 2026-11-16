'use client';
import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { CARD, ErrorState, Skeleton, useFmt } from './ui';
import type { TeamStats, TeamTotals } from './useHomeData';

type Key = 'calls' | 'answered' | 'leadsReached' | 'meetings' | 'deals';

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const { t } = useLanguage();
  if (cur === prev) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t('tl.kpi.vsPrev')}>
        <Minus size={12} aria-hidden /> 0%
      </span>
    );
  }
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 100;
  const up = cur > prev;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${up ? 'text-lime-600 dark:text-lime-400' : 'text-red-500 dark:text-red-400'}`}
      title={t('tl.kpi.vsPrev')}
    >
      {up ? <ArrowUpRight size={12} aria-hidden className="rtl:-scale-x-100" /> : <ArrowDownRight size={12} aria-hidden className="rtl:-scale-x-100" />}
      {up ? '+' : ''}
      {pct}%
    </span>
  );
}

/** Team totals for the selected range. Horizontally scrollable strip (~2.5 cards) on mobile, one row on desktop. */
export function KpiRow({ data, loading, error, onRetry }: { data: TeamStats | null; loading: boolean; error: boolean; onRetry: () => void }) {
  const { t } = useLanguage();
  const fmt = useFmt();

  const items: { key: Key; label: string; sub?: (x: TeamTotals) => string }[] = [
    { key: 'calls', label: t('tl.kpi.calls') },
    { key: 'answered', label: t('tl.kpi.answered'), sub: (x) => t('tl.kpi.rate', { n: x.answerRate }) },
    { key: 'leadsReached', label: t('tl.kpi.reached') },
    { key: 'meetings', label: t('tl.kpi.meetings') },
    { key: 'deals', label: t('tl.kpi.deals') },
  ];

  if (error && !data) {
    return (
      <div className={CARD}>
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div aria-label={t('tl.kpi.teamTotals')} className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
      {items.map((it) => (
        <div key={it.key} className={`${CARD} w-[40%] shrink-0 snap-start p-4 md:w-auto`}>
          <p className="truncate text-xs font-medium text-muted-foreground">{it.label}</p>
          {loading && !data ? (
            <>
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-12" />
            </>
          ) : data ? (
            <>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{fmt(data.totals[it.key])}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Delta cur={data.totals[it.key]} prev={data.prev[it.key]} />
                {it.sub && <span className="truncate text-[11px] text-muted-foreground">{it.sub(data.totals)}</span>}
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

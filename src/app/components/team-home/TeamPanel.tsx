'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Users } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, EmptyState, ErrorState, SectionHeader, SkeletonRows, initials, useAgo, useFmt } from './ui';
import { RANGE_DAYS, type MemberStats, type Range, type TeamStats } from './useHomeData';

/**
 * Merged team table + leaderboard (replaces the separate Daily Leaderboard). Reads the same useTeamStats() result as
 * the KPI row, so the numbers always match. Sorted by actions; members with no activity sink to the bottom, greyed.
 */
export function TeamPanel({
  data,
  loading,
  error,
  onRetry,
  range,
  dailyTarget,
  selected,
  onSelect,
}: {
  data: TeamStats | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  range: Range;
  dailyTarget: number | null;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useLanguage();
  const fmt = useFmt();
  const ago = useAgo();

  const ranked = useMemo(() => {
    const idle = (m: MemberStats) => m.calls === 0 && m.total_actions === 0;
    return [...(data?.members || [])].sort(
      (a, b) => Number(idle(a)) - Number(idle(b)) || b.total_actions - a.total_actions || b.calls - a.calls || a.full_name.localeCompare(b.full_name)
    );
  }, [data]);

  const active = ranked.filter((m) => m.calls > 0 || m.total_actions > 0).length;
  const target = dailyTarget ? dailyTarget * RANGE_DAYS[range] : null;

  return (
    <Card className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <SectionHeader
        title={t('tl.team.title')}
        subtitle={data ? t('tl.team.subtitle', { active, size: ranked.length }) : undefined}
        action={
          <Link href="/teams" className="inline-flex items-center gap-1 text-xs font-semibold text-lime-700 hover:underline dark:text-lime-400">
            {t('tl.fu.seeAll')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
          </Link>
        }
      />

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : error && !data ? (
        <ErrorState onRetry={onRetry} />
      ) : ranked.length === 0 ? (
        <EmptyState icon={Users} text={t('tl.team.empty')} />
      ) : (
        <ol className="-mx-2 flex flex-col">
          {ranked.map((m, i) => {
            const idle = m.calls === 0 && m.total_actions === 0;
            const rate = m.calls > 0 ? Math.round((m.answered_calls / m.calls) * 100) : null;
            const pct = target ? Math.min(100, Math.round((m.calls / target) * 100)) : null;
            const isSel = selected === m.user_id;
            return (
              <li key={m.user_id}>
                <button
                  type="button"
                  onClick={() => onSelect(isSel ? '' : m.user_id)}
                  aria-pressed={isSel}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition-colors hover:bg-black/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 dark:hover:bg-zinc-800/60 ${
                    isSel ? 'bg-lime-400/[0.08]' : ''
                  } ${idle ? 'opacity-50' : ''}`}
                >
                  <span className="w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {initials(m.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {m.full_name}
                        {m.is_self && <span className="ms-1 text-[10px] font-normal text-muted-foreground">({t('tl.team.you')})</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground" title={t('tl.team.lastCall')}>
                        {ago(m.last_call_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
                      <span title={t('tl.team.calls')}>
                        <span className="font-semibold text-foreground">{fmt(m.calls)}</span> {t('tl.team.calls')}
                      </span>
                      <span title={t('tl.team.answered')}>
                        {fmt(m.answered_calls)} {t('tl.team.answered')}
                        {rate !== null && <span> · {rate}%</span>}
                      </span>
                      <span className="ms-auto" title={`${t('tl.team.updates')}: ${fmt(m.status_updates)}`}>
                        <span className="font-semibold text-foreground">{fmt(m.total_actions)}</span> {t('tl.team.actions')}
                      </span>
                    </div>
                    {pct !== null && (
                      <div
                        className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-zinc-800"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        title={t('tl.team.target', { n: fmt(m.calls), t: fmt(target!) })}
                      >
                        <div className="h-full rounded-full bg-lime-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

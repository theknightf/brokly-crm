'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  Copy,
  Handshake,
  Hourglass,
  Inbox,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  RefreshCw,
  Repeat,
  Snowflake,
  Sparkles,
  Star,
  ThumbsDown,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, EmptyState, ErrorState, SectionHeader, Skeleton, useFmt } from './ui';
import type { StageCounts } from './useHomeData';

export type Bucket = 'active' | 'lost' | 'unreached';

const BUCKET_OF: Record<string, Bucket> = {
  'Not Interested': 'lost',
  Cancellation: 'lost',
  'Duplicate Leads': 'lost',
  'Wrong Number': 'lost',
  'Closed Number': 'lost',
  'Low Budget': 'lost',
  'No Answer': 'unreached',
  'No Answer At All': 'unreached',
};
// Every other stage (Fresh, Cold Calls, Following Up, Meeting, Interested, Reservation, Done Deal, Data Rotation…) is active.
export const bucketOf = (stage: string): Bucket => BUCKET_OF[stage] || 'active';

/** Order stages appear in within their bucket when counts tie, matching the leads screen. */
const STAGES = [
  'Fresh Leads', 'Cold Calls', 'Pending Leads', 'Following Up', 'Meeting', 'Follow Up After Meeting', 'Reschedule Meeting',
  'Interested', 'Reservation', 'Done Deal', 'Data Rotation',
  'Not Interested', 'Low Budget', 'Wrong Number', 'Closed Number', 'Cancellation', 'Duplicate Leads',
  'No Answer', 'No Answer At All',
];

const ICON: Record<string, LucideIcon> = {
  'Fresh Leads': Sparkles,
  'Cold Calls': Snowflake,
  'Pending Leads': Hourglass,
  'Following Up': PhoneCall,
  Meeting: CalendarCheck,
  'Follow Up After Meeting': Repeat,
  'Reschedule Meeting': CalendarClock,
  Interested: Star,
  Reservation: Wallet,
  'Done Deal': Handshake,
  'Data Rotation': RefreshCw,
  'Not Interested': ThumbsDown,
  'Low Budget': Wallet,
  'Wrong Number': XCircle,
  'Closed Number': PhoneOff,
  Cancellation: Ban,
  'Duplicate Leads': Copy,
  'No Answer': PhoneMissed,
  'No Answer At All': PhoneMissed,
};

export const TONE: Record<Bucket, { bar: string; text: string; dot: string }> = {
  active: { bar: 'bg-lime-500', text: 'text-lime-600 dark:text-lime-400', dot: 'bg-lime-500' },
  lost: { bar: 'bg-red-400', text: 'text-red-500 dark:text-red-400', dot: 'bg-red-400' },
  unreached: { bar: 'bg-zinc-400', text: 'text-zinc-500 dark:text-zinc-400', dot: 'bg-zinc-400' },
};

/** One component instead of 19 stage cards + 2 charts: bucket split bar, then a sorted, clickable bar list per bucket. */
export function PipelinePanel({ data, loading, error, onRetry }: { data: StageCounts | null; loading: boolean; error: boolean; onRetry: () => void }) {
  const { t } = useLanguage();
  const fmt = useFmt();
  const [showEmpty, setShowEmpty] = useState(false);

  const groups = useMemo(() => {
    const counts = data?.stages || {};
    const names = Array.from(new Set([...STAGES, ...Object.keys(counts)]));
    const out: Record<Bucket, { stage: string; n: number }[]> = { active: [], lost: [], unreached: [] };
    for (const s of names) out[bucketOf(s)].push({ stage: s, n: counts[s] || 0 });
    for (const b of Object.keys(out) as Bucket[]) {
      out[b].sort((x, y) => y.n - x.n || STAGES.indexOf(x.stage) - STAGES.indexOf(y.stage));
    }
    return out;
  }, [data]);

  const total = data?.total || 0;
  const bucketTotal = (b: Bucket) => groups[b].reduce((a, r) => a + r.n, 0);
  const max = Math.max(1, ...Object.values(data?.stages || {}));
  const hasEmpty = (Object.values(groups) as { n: number }[][]).some((g) => g.some((r) => r.n === 0));

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <SectionHeader
        title={t('tl.pipe.title')}
        subtitle={data ? t('tl.pipe.subtitle', { n: fmt(total) }) : undefined}
        action={
          hasEmpty ? (
            <button type="button" onClick={() => setShowEmpty((v) => !v)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              {showEmpty ? t('tl.pipe.hideEmpty') : t('tl.pipe.showEmpty')}
            </button>
          ) : undefined
        }
      />

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-2.5" />
          <Skeleton className="h-40" />
        </div>
      ) : error && !data ? (
        <ErrorState onRetry={onRetry} />
      ) : total === 0 ? (
        <EmptyState icon={Inbox} text={t('tl.pipe.empty')} />
      ) : (
        <>
          {/* Bucket split */}
          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-zinc-800" aria-hidden>
              {(['active', 'unreached', 'lost'] as const).map((b) => (
                <div key={b} className={TONE[b].bar} style={{ width: `${(bucketTotal(b) / total) * 100}%` }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {(['active', 'unreached', 'lost'] as const).map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${TONE[b].dot}`} />
                  {t(`tl.pipe.${b}`)}
                  <span className="font-semibold tabular-nums text-foreground">{fmt(bucketTotal(b))}</span>
                  <span className="tabular-nums">({Math.round((bucketTotal(b) / total) * 100)}%)</span>
                </span>
              ))}
            </div>
          </div>

          {/* Stage lists */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-3">
            {(['active', 'unreached', 'lost'] as const).map((b) => {
              const rows = groups[b].filter((r) => showEmpty || r.n > 0);
              if (rows.length === 0) return null;
              return (
                <div key={b} className="min-w-0">
                  <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${TONE[b].text}`}>{t(`tl.pipe.${b}`)}</p>
                  <ul className="flex flex-col">
                    {rows.map((r) => {
                      const Icon = ICON[r.stage] || BarChart3;
                      return (
                        <li key={r.stage}>
                          <Link
                            href={`/leads-management?status=${encodeURIComponent(r.stage)}`}
                            className={`group -mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-black/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 dark:hover:bg-zinc-800/60 ${
                              r.n === 0 ? 'opacity-50' : ''
                            }`}
                          >
                            <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-[13px] text-foreground">{r.stage}</span>
                                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{fmt(r.n)}</span>
                              </div>
                              <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/[0.05] dark:bg-zinc-800">
                                <div className={`h-full rounded-full ${TONE[b].bar} opacity-80`} style={{ width: `${(r.n / max) * 100}%` }} />
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

/** Small sorted bar list of lead sources. Collapsed by default on mobile. */
export function SourcePanel({ data, loading, error, onRetry }: { data: StageCounts | null; loading: boolean; error: boolean; onRetry: () => void }) {
  const { t } = useLanguage();
  const fmt = useFmt();
  const rows = useMemo(
    () => Object.entries(data?.sources || {}).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [data]
  );
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const total = Object.values(data?.sources || {}).reduce((a, n) => a + n, 0);

  const body =
    loading && !data ? (
      <Skeleton className="h-32" />
    ) : error && !data ? (
      <ErrorState onRetry={onRetry} />
    ) : rows.length === 0 ? (
      <EmptyState icon={BarChart3} text={t('tl.src.empty')} />
    ) : (
      <ul className="flex flex-col gap-2">
        {rows.map(([src, n]) => (
          <li key={src} className="flex items-center gap-3 text-[13px]">
            <span className="w-28 shrink-0 truncate text-foreground sm:w-36" title={src}>
              {src}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05] dark:bg-zinc-800">
              <div className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="w-16 shrink-0 text-end tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{fmt(n)}</span> · {total ? Math.round((n / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <Card className="p-4 sm:p-5">
      {/* Mobile: collapsible */}
      <details className="group md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">{t('tl.src.title')}</h2>
          <ChevronDown size={16} className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4">{body}</div>
      </details>
      {/* Desktop: always open */}
      <div className="hidden flex-col gap-4 md:flex">
        <SectionHeader title={t('tl.src.title')} />
        {body}
      </div>
    </Card>
  );
}

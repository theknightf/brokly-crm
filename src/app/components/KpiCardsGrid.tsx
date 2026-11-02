'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Card { stage: string; count: number; trend: string; trendValue: number }

const kpiClientCache = new Map<string, { at: number; data: any; promise?: Promise<any> }>();

export function fetchKpiCardsCached(teamId?: string, agentId?: string, force = false): Promise<any> {
  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);
  if (agentId) params.set('agentId', agentId);
  const key = params.toString();
  const existing = kpiClientCache.get(key);
  const now = Date.now();
  if (!force && existing && existing.data && now - existing.at < 15_000) {
    return Promise.resolve(existing.data);
  }
  if (existing?.promise) return existing.promise;
  const p = fetch(`/api/dashboard/kpi-cards?${key}`, { cache: 'no-store', credentials: 'same-origin' })
    .then((r) => r.json())
    .then((j) => {
      kpiClientCache.set(key, { at: Date.now(), data: j });
      return j;
    })
    .finally(() => {
      const cur = kpiClientCache.get(key);
      if (cur) delete cur.promise;
    });
  kpiClientCache.set(key, { at: existing?.at || 0, data: existing?.data, promise: p });
  return p;
}

/** Deep-link for a status card — All Leads opens unfiltered, every other
 * stage opens Leads Management with that exact status pre-applied. */
function hrefForStage(stage: string): string {
  if (!stage || stage === 'All Leads') return '/leads-management';
  return `/leads-management?status=${encodeURIComponent(stage)}`;
}

/** Accent per pipeline stage (visual only). Full class names so Tailwind keeps them. */
const ACCENTS: { match: RegExp; bar: string; dot: string }[] = [
  { match: /^all leads/i, bar: 'bg-primary', dot: 'bg-primary' },
  { match: /fresh|new lead|new fresh/i, bar: 'bg-sky-500', dot: 'bg-sky-500' },
  { match: /cold/i, bar: 'bg-cyan-500', dot: 'bg-cyan-500' },
  { match: /pending/i, bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { match: /follow up after|following|follow/i, bar: 'bg-violet-500', dot: 'bg-violet-500' },
  { match: /reschedule/i, bar: 'bg-blue-500', dot: 'bg-blue-500' },
  { match: /meeting/i, bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  { match: /reservation/i, bar: 'bg-green-500', dot: 'bg-green-500' },
  { match: /done deal|won/i, bar: 'bg-lime-500', dot: 'bg-lime-500' },
  { match: /interested/i, bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { match: /not interested|low budget/i, bar: 'bg-rose-500', dot: 'bg-rose-500' },
  { match: /cancel/i, bar: 'bg-red-500', dot: 'bg-red-500' },
  { match: /duplicate/i, bar: 'bg-fuchsia-500', dot: 'bg-fuchsia-500' },
  { match: /wrong|closed number/i, bar: 'bg-orange-500', dot: 'bg-orange-500' },
  { match: /rotation/i, bar: 'bg-teal-500', dot: 'bg-teal-500' },
  { match: /no answer/i, bar: 'bg-zinc-500', dot: 'bg-zinc-500' },
];
export function accentFor(stage: string) {
  return ACCENTS.find((a) => a.match.test(stage)) || { bar: 'bg-muted-foreground', dot: 'bg-muted-foreground' };
}

export default function KpiCardsGrid({ teamId, agentId }: { teamId?: string; agentId?: string }) {
  const { user, loading: authLoading } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    if (cards.length === 0) setLoading(true);
    fetchKpiCardsCached(teamId, agentId)
      .then((j) => setCards(j?.cards || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId, agentId, user?.id, authLoading]);

  // Also revalidate silently on window focus/visibility for stale-while-revalidate
  useEffect(() => {
    if (authLoading || !user) return;
    const revalidate = () => {
      fetchKpiCardsCached(teamId, agentId, true)
        .then((j) => {
          if (j?.cards) setCards(j.cards);
        })
        .catch(() => {});
    };
    const onFocus = () => revalidate();
    const onVisible = () => { if (document.visibilityState === 'visible') revalidate(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, [teamId, agentId, user?.id, authLoading]);

  if (loading && cards.length === 0) return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading pipeline">
      <div className="dash-card h-[108px]" />
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
        {Array.from({length: 4}).map((_,i)=>(<div key={i} className="dash-card h-[220px]" />))}
      </div>
    </div>
  );

  const total = cards.find((c) => /^all leads/i.test(c.stage));
  const rest = cards.filter((c) => c !== total);
  const grouped = PIPELINE_GROUPS.map((g) => ({ ...g, items: rest.filter((c) => groupOf(c.stage) === g.key) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <section aria-label="Pipeline breakdown" className="space-y-4">
      {total && (
        <Link
          href={hrefForStage(total.stage)}
          title={`Open ${total.stage} in Leads Management`}
          className="group dash-card dash-card-hover flex flex-wrap items-center justify-between gap-x-8 gap-y-3 p-5 bg-gradient-to-r from-lime-500/10 via-card to-card border-lime-500/30 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">{total.stage}</p>
            <p className="text-5xl font-extrabold tabular-nums tracking-tight text-foreground mt-1">{total.count.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-4">
            <TrendBadge card={total} />
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Open pipeline <ArrowUpRight size={16} aria-hidden className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
        {grouped.map((g) => {
          const sum = g.items.reduce((s, c) => s + c.count, 0);
          const share = total?.count ? Math.round((sum / total.count) * 100) : 0;
          return (
            <div key={g.key} className="dash-card p-4 flex flex-col">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground">{g.title}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{sum.toLocaleString()} \u00B7 {share}%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{g.hint}</p>
              <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                <div className={`h-full rounded-full ${g.bar} transition-[width] duration-700 ease-out`} style={{ width: `${Math.min(100, share)}%` }} />
              </div>
              <ul className="mt-3 -mx-2 flex-1">
                {g.items.map((c) => {
                  const accent = accentFor(c.stage);
                  return (
                    <li key={c.stage}>
                      <Link
                        href={hrefForStage(c.stage)}
                        title={`Open ${c.stage} in Leads Management`}
                        className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${accent.dot}`} aria-hidden />
                        <span className="flex-1 min-w-0 text-sm text-foreground leading-snug">{c.stage}</span>
                        <TrendBadge card={c} compact />
                        <span className="w-14 text-end text-base font-bold tabular-nums text-foreground">{c.count.toLocaleString()}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const PIPELINE_GROUPS = [
  { key: 'inflow', title: 'Inflow', hint: 'New and untouched leads', bar: 'bg-sky-500' },
  { key: 'engage', title: 'Active engagement', hint: 'Being worked right now', bar: 'bg-amber-500' },
  { key: 'outcome', title: 'Conversion & outcome', hint: 'Where leads ended up', bar: 'bg-emerald-500' },
  { key: 'hygiene', title: 'Data quality', hint: 'Cleanup and recycling', bar: 'bg-zinc-500' },
] as const;

function groupOf(stage: string): (typeof PIPELINE_GROUPS)[number]['key'] {
  if (/fresh|new|cold/i.test(stage)) return 'inflow';
  if (/duplicate|wrong|closed number|rotation/i.test(stage)) return 'hygiene';
  if (/done deal|won|reservation|not interested|low budget|cancel/i.test(stage)) return 'outcome';
  return 'engage';
}

function TrendBadge({ card, compact }: { card: Card; compact?: boolean }) {
  const up = card.trendValue >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap ${
        up ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
      }`}
    >
      {up ? <TrendingUp size={11} aria-hidden /> : <TrendingDown size={11} aria-hidden />}
      {String(card.trend).replace(/^[\u2191\u2193\u25B2\u25BC]\s*/, '')}
      {!compact && <span className="sr-only"> vs previous period</span>}
    </span>
  );
}

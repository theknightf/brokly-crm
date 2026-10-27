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
function accentFor(stage: string) {
  return ACCENTS.find((a) => a.match.test(stage)) || { bar: 'bg-muted-foreground/50', dot: 'bg-muted-foreground/50' };
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {Array.from({length: 14}).map((_,i)=>(
        <div key={i} className="dash-card p-4 h-[112px] animate-pulse overflow-hidden" aria-hidden>
          <div className="absolute inset-y-4 start-0 w-1 rounded-e-full bg-muted" />
          <div className="h-3 w-20 bg-muted rounded mb-4" />
          <div className="h-8 w-14 bg-muted rounded mb-3" />
          <div className="h-4 w-12 bg-muted/60 rounded-full" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map(c => {
        const accent = accentFor(c.stage);
        const up = c.trendValue >= 0;
        const featured = /^all leads/i.test(c.stage);
        return (
          <Link
            key={c.stage}
            href={hrefForStage(c.stage)}
            title={`Open ${c.stage} in Leads Management`}
            className={`group dash-card dash-card-hover overflow-hidden p-4 ps-5 cursor-pointer active:scale-[0.98] ${
              featured ? 'bg-gradient-to-br from-primary/15 via-card to-card border-primary/40' : ''
            }`}
          >
            <span className={`absolute inset-y-4 start-0 w-1 rounded-e-full ${accent.bar}`} aria-hidden />
            <span className="flex items-start justify-between gap-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} aria-hidden />
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase truncate">{c.stage}</p>
              </span>
              <ArrowUpRight size={14} className="text-muted-foreground/40 group-hover:text-primary rtl:-scale-x-100 transition-colors shrink-0" />
            </span>
            <p className="text-3xl font-extrabold text-foreground mt-2 tabular-nums tracking-tight">{c.count.toLocaleString()}</p>
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                up
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {up ? <TrendingUp size={11} aria-hidden /> : <TrendingDown size={11} aria-hidden />}
              {c.trend}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

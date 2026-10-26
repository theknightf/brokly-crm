'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Card { stage: string; count: number; trend: string; trendValue: number }

/** Deep-link for a status card — All Leads opens unfiltered, every other
 * stage opens Leads Management with that exact status pre-applied. */
function hrefForStage(stage: string): string {
  if (!stage || stage === 'All Leads') return '/leads-management';
  return `/leads-management?status=${encodeURIComponent(stage)}`;
}

export default function KpiCardsGrid({ teamId, agentId }: { teamId?: string; agentId?: string }) {
  const { user, loading: authLoading } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (teamId) params.set('teamId', teamId);
    if (agentId) params.set('agentId', agentId);
    // Force revalidation with credentials and no-store; relies on patched fetch injecting x-sb-token when cookies blocked
    fetch(`/api/dashboard/kpi-cards?${params}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(r => r.json())
      .then(j => setCards(j.cards || []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [teamId, agentId, user?.id, authLoading]);

  // Also revalidate on window focus/visibility for stale-while-revalidate
  useEffect(() => {
    if (authLoading || !user) return;
    const revalidate = () => {
      const params = new URLSearchParams();
      if (teamId) params.set('teamId', teamId);
      if (agentId) params.set('agentId', agentId);
      fetch(`/api/dashboard/kpi-cards?${params}`, { cache: 'no-store', credentials: 'same-origin' })
        .then(r => r.json())
        .then(j => setCards(j.cards || []))
        .catch(() => {});
    };
    const onFocus = () => revalidate();
    const onVisible = () => { if (document.visibilityState === 'visible') revalidate(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, [teamId, agentId, user?.id, authLoading]);

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {Array.from({length: 14}).map((_,i)=>(
        <div key={i} className="bg-card border border-border rounded-2xl p-4 h-[92px] animate-pulse">
          <div className="h-3 w-16 bg-muted rounded mb-3" />
          <div className="h-7 w-12 bg-muted rounded mb-2" />
          <div className="h-3 w-10 bg-muted/60 rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map(c => (
        <Link
          key={c.stage}
          href={hrefForStage(c.stage)}
          title={`Open ${c.stage} in Leads Management`}
          className="group bg-card border border-border rounded-2xl p-4 shadow-sm cursor-pointer transition-all hover:border-primary/40 hover:shadow-[0_0_18px_rgba(132,204,22,0.25)] hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <span className="flex items-start justify-between gap-1">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase truncate">{c.stage}</p>
            <ArrowUpRight size={13} className="text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
          </span>
          <p className="text-2xl font-black text-foreground mt-1 tabular-nums">{c.count}</p>
          <p className={`text-xs font-semibold mt-1 ${c.trendValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{c.trend}</p>
        </Link>
      ))}
    </div>
  );
}

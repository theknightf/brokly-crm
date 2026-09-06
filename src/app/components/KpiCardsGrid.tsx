'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2 } from 'lucide-react';

interface Card { stage: string; count: number; trend: string; trendValue: number }

/** Deep-link for a status card — All Leads opens unfiltered, every other
 * stage opens Leads Management with that exact status pre-applied. */
function hrefForStage(stage: string): string {
  if (!stage || stage === 'All Leads') return '/leads-management';
  return `/leads-management?status=${encodeURIComponent(stage)}`;
}

export default function KpiCardsGrid({ teamId, agentId }: { teamId?: string; agentId?: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (teamId) params.set('teamId', teamId);
    if (agentId) params.set('agentId', agentId);
    fetch(`/api/dashboard/kpi-cards?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setCards(j.cards || []))
      .finally(() => setLoading(false));
  }, [teamId, agentId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map(c => (
        <Link
          key={c.stage}
          href={hrefForStage(c.stage)}
          title={`Open ${c.stage} in Leads Management`}
          className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm cursor-pointer transition-all hover:border-lime-400/60 dark:hover:border-lime-500/50 hover:shadow-[0_0_18px_rgba(132,204,22,0.25)] hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <span className="flex items-start justify-between gap-1">
            <p className="text-[10px] font-bold tracking-widest text-zinc-500 dark:text-zinc-400 uppercase truncate">{c.stage}</p>
            <ArrowUpRight size={13} className="text-zinc-300 dark:text-zinc-600 group-hover:text-lime-500 transition-colors shrink-0" />
          </span>
          <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1 tabular-nums">{c.count}</p>
          <p className={`text-xs font-semibold mt-1 ${c.trendValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{c.trend}</p>
        </Link>
      ))}
    </div>
  );
}

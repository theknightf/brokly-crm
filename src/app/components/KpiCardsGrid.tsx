'use client';
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Card { stage: string; count: number; trend: string; trendValue: number }

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
        <div key={c.stage} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
          <p className="text-[10px] font-bold tracking-widest text-zinc-500 dark:text-zinc-400 uppercase truncate">{c.stage}</p>
          <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">{c.count}</p>
          <p className={`text-xs font-semibold mt-1 ${c.trendValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{c.trend}</p>
        </div>
      ))}
    </div>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import { Trophy, Loader2 } from 'lucide-react';

interface Row { user_id: string; full_name: string; role: string; totalActions: number; rank: number }

export default function DailyLeaderboard({ date }: { date?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().slice(0,10));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard/daily?date=${selectedDate}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setRows(j.users || []))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Trophy size={16} className="text-amber-500"/> Daily Leaderboard</h3>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs" />
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin"/></div> :
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.slice(0,10).map(r=>(
            <div key={r.user_id} className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${r.rank===1?'bg-amber-400 text-white': r.rank===2?'bg-zinc-300': r.rank===3?'bg-orange-400 text-white':'bg-zinc-100 dark:bg-zinc-800'}`}>{r.rank}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.full_name}</p>
                <p className="text-xs text-zinc-500">{r.role}</p>
              </div>
              <span className="text-sm font-bold text-lime-600">{r.totalActions} actions</span>
            </div>
          ))}
        </div>
      }
      <p className="text-[11px] text-center text-zinc-500 py-2">Resets daily at 00:00</p>
    </div>
  );
}

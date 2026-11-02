'use client';
import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';

interface Row {
  user_id: string;
  full_name: string;
  role: string;
  totalActions: number;
  rank: number;
  calls?: number;
  statusUpdates?: number;
  meetings?: number;
  deals?: number;
}

export default function DailyLeaderboard({ date }: { date?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().slice(0,10));
  const topActions = Math.max(1, ...rows.map((r) => r.totalActions || 0));

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/leaderboard/daily?date=${selectedDate}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setRows(j.users || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  return (
    <div className="dash-card overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="font-bold flex items-center gap-2 text-foreground">
          <span className="dash-icon-chip bg-amber-500/10 text-amber-500"><Trophy size={16} aria-hidden /></span>
          Daily Leaderboard
        </h2>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="input-base !w-auto h-9 text-xs px-3 [@media(pointer:coarse)]:h-11" aria-label="Leaderboard date" />
      </div>
      {loading ? (
        <div className="divide-y divide-border flex-1" aria-busy="true" aria-label="Loading leaderboard">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-muted" />
              <div className="flex-1 space-y-2"><div className="h-3.5 w-32 rounded bg-muted" /><div className="h-3 w-48 rounded bg-muted" /></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-10 px-4 text-center">Couldn’t load the leaderboard. Pick the date again to retry.</p>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 px-4 text-center text-muted-foreground">
          <span className="dash-icon-chip bg-muted"><Trophy size={16} aria-hidden /></span>
          <p className="text-sm">No activity recorded for this date</p>
        </div>
      ) : (
        <div className="divide-y divide-border flex-1">
          {rows.slice(0,10).map(r=>(
            <div key={r.user_id} className={`flex items-center gap-3 p-3 transition-colors hover:bg-muted ${r.rank<=3 ? 'bg-gradient-to-r from-lime-500/5 to-transparent' : ''}`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm tabular-nums ${r.rank===1?'bg-gradient-to-br from-amber-300 to-amber-500 text-white': r.rank===2?'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800': r.rank===3?'bg-gradient-to-br from-orange-300 to-orange-500 text-white':'bg-muted text-muted-foreground'}`}>{r.rank}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.role} · {r.calls ?? 0} calls · {r.statusUpdates ?? 0} updates · {r.meetings ?? 0} meetings · {r.deals ?? 0} deals
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-lime-500" style={{ width: `${Math.round(((r.totalActions || 0) / topActions) * 100)}%` }} />
                </div>
              </div>
              <span className="text-sm font-extrabold text-primary tabular-nums shrink-0">{r.totalActions.toLocaleString()} actions</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-center text-muted-foreground py-2.5 border-t border-border">Resets daily at 00:00</p>
    </div>
  );
}

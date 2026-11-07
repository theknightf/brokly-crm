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
  answered?: number;
}

// The user's own calendar day (YYYY-MM-DD). toISOString() would give the UTC day, which is "yesterday"
// for the first hours after midnight in Cairo.
const localToday = () => new Date().toLocaleDateString('en-CA');

export default function DailyLeaderboard({ date }: { date?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(date || localToday());
  // Only people with activity are ranked; an all-zero day falls through to the empty state.
  const active = rows.filter((r) => (r.totalActions || 0) > 0);
  const topActions = Math.max(1, ...active.map((r) => r.totalActions || 0));

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/leaderboard/daily?date=${selectedDate}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) throw new Error('leaderboard failed');
        return j;
      })
      .then(j => setRows(Array.isArray(j.users) ? j.users : []))
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
      ) : active.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 px-4 text-center text-muted-foreground">
          <span className="dash-icon-chip bg-muted"><Trophy size={16} aria-hidden /></span>
          <p className="text-sm">No activity recorded for this date</p>
        </div>
      ) : (
        <div className="divide-y divide-border flex-1">
          {active.slice(0,10).map((r, idx)=>{
            const rank = idx + 1;
            return (
            <div key={r.user_id} className={`flex items-center gap-3 p-3 transition-colors hover:bg-muted ${rank<=3 ? 'bg-gradient-to-r from-lime-500/5 to-transparent' : ''}`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm tabular-nums ${rank===1?'bg-gradient-to-br from-amber-300 to-amber-500 text-white': rank===2?'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800': rank===3?'bg-gradient-to-br from-orange-300 to-orange-500 text-white':'bg-muted text-muted-foreground'}`}>{rank}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.full_name || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-foreground">{r.calls ?? 0}</span> calls / مكالمات · <span className="font-semibold text-foreground">{r.statusUpdates ?? 0}</span> status updates / تحديثات · <span className="text-emerald-500 font-semibold">{r.answered ?? 0} answered / تم الرد</span>
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-lime-500" style={{ width: `${Math.round(((r.totalActions || 0) / topActions) * 100)}%` }} />
                </div>
              </div>
              <span title="Calls + stage updates" className="text-sm font-extrabold text-primary tabular-nums shrink-0">{(r.totalActions || 0).toLocaleString()} actions</span>
            </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-center text-muted-foreground py-2.5 border-t border-border">Resets daily at 00:00 (Cairo time)</p>
    </div>
  );
}

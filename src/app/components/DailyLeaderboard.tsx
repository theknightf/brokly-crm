'use client';
import React, { useEffect, useState } from 'react';
import { Trophy, Loader2 } from 'lucide-react';

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
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().slice(0,10));
  const topActions = Math.max(1, ...rows.map((r) => r.totalActions || 0));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard/daily?date=${selectedDate}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setRows(j.users || []))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  return (
    <div className="dash-card overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-border/70 flex items-center justify-between gap-2">
        <h3 className="font-bold flex items-center gap-2 text-foreground">
          <span className="dash-icon-chip bg-amber-500/10 text-amber-500"><Trophy size={16}/></span>
          Daily Leaderboard
        </h3>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="input-base !w-auto h-9 text-xs px-3" aria-label="Leaderboard date" />
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary"/></div> :
        <div className="divide-y divide-border/60 flex-1">
          {rows.slice(0,10).map(r=>(
            <div key={r.user_id} className={`flex items-center gap-3 p-3 transition-colors hover:bg-muted/50 ${r.rank<=3 ? 'bg-gradient-to-r from-primary/5 to-transparent' : ''}`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${r.rank===1?'bg-gradient-to-br from-amber-300 to-amber-500 text-white': r.rank===2?'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800': r.rank===3?'bg-gradient-to-br from-orange-300 to-orange-500 text-white':'bg-muted text-muted-foreground'}`}>{r.rank}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.role} · {r.calls ?? 0} calls · {r.statusUpdates ?? 0} updates · {r.meetings ?? 0} meetings · {r.deals ?? 0} deals
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round(((r.totalActions || 0) / topActions) * 100)}%` }} />
                </div>
              </div>
              <span className="text-sm font-extrabold text-primary tabular-nums shrink-0">{r.totalActions} actions</span>
            </div>
          ))}
        </div>
      }
      <p className="text-[11px] text-center text-muted-foreground py-2.5 border-t border-border/60">Resets daily at 00:00</p>
    </div>
  );
}

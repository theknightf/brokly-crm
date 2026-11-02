'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, Loader2, RefreshCw, Phone, Clock, Shirt, TrendingUp, Crown, Medal, Award } from 'lucide-react';

type Period = 'day' | 'week' | 'month';
interface RankedUser {
  user_id: string; full_name: string; email: string; role: string;
  rank: number; totalScore: number;
  scores: { callScore: number; attendanceScore: number; dressScore: number; totalScore: number };
  metrics: { totalCalls: number; presentDays: number; totalDays: number; avgDressRating: number | null };
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center ring-2 ring-amber-400/40 shadow-md"><Crown size={14} className="text-white"/></div>;
  if (rank === 2) return <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 flex items-center justify-center ring-2 ring-slate-300/40 shadow"><Medal size={14} className="text-slate-800"/></div>;
  if (rank === 3) return <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-300 to-orange-600 flex items-center justify-center ring-2 ring-orange-400/40 shadow"><Award size={14} className="text-white"/></div>;
  return <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{rank}</div>;
}

function ScoreBar({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground mb-1">
        <span className="flex items-center gap-1 min-w-0">{icon}<span className="truncate">{label}</span></span>
        <span className="text-[11px] font-bold text-foreground tabular-nums">{value}</span>
      </div>
      <div className="bg-muted rounded-full h-1.5 overflow-hidden"><div className={`h-1.5 rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export default function WeightedLeaderboard() {
  const [period, setPeriod] = useState<Period>('month');
  const [users, setUsers] = useState<RankedUser[]>([]);
  const [range, setRange] = useState<{start:string; end:string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setUsers(j.users || []);
      setRange(j.range || null);
    } catch { setError(true); } finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="dash-card overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="dash-icon-chip bg-amber-500/10 text-amber-500"><Trophy size={16} /></div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">Performance Leaderboard <span className="text-xs font-normal text-muted-foreground hidden sm:inline">· Weighted 40/30/30</span></h2>
            <p className="text-xs text-muted-foreground font-mono">{range ? `${range.start} → ${range.end}` : ''} · Total = Call×0.40 + Att×0.30 + Dress×0.30</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-full p-1">
            {(['day','week','month'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3.5 py-1 [@media(pointer:coarse)]:min-h-[44px] rounded-full text-xs font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${period===p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{p}</button>
            ))}
          </div>
          <button onClick={load} aria-label="Refresh" className="p-2 [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] rounded-lg hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-lime-600"/></div>
      : error ? <div className="text-center py-10"><p className="text-sm text-muted-foreground mb-3">Couldn’t load leaderboard.</p><button onClick={load} className="btn-secondary text-sm">Retry</button></div>
      : users.length===0 ? <p className="text-sm text-muted-foreground text-center py-12">No data for this period.</p>
      : <div className="divide-y divide-border">
          {users.map(u => (
            <a key={u.user_id} href={`/admin/employees/${u.user_id}/360`} className={`p-3.5 flex items-center gap-3 hover:bg-muted transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:bg-muted ${u.rank<=3 ? 'bg-gradient-to-r from-lime-500/10 via-lime-500/5 to-transparent' : ''}`}>
              <RankIcon rank={u.rank}/>
              <div className="w-9 h-9 rounded-full bg-lime-500/10 border border-lime-500/20 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold text-primary">{(u.full_name||u.email).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</span></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">{u.full_name || u.email} <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-md">{u.role}</span> <span className="text-[11px] text-primary hidden sm:inline">360 →</span></p>
                <div className="flex gap-4 mt-2">
                  <ScoreBar label="Call 40%" value={u.scores.callScore} icon={<Phone size={10} className="text-emerald-400"/>} color="bg-emerald-400"/>
                  <ScoreBar label="Attend 30%" value={u.scores.attendanceScore} icon={<Clock size={10} className="text-sky-400"/>} color="bg-sky-400"/>
                  <ScoreBar label="Dress 30%" value={u.scores.dressScore} icon={<Shirt size={10} className="text-lime-400"/>} color="bg-lime-400"/>
                </div>
              </div>
              <div className="text-end flex-shrink-0">
                <div className="flex items-center gap-1 justify-end"><TrendingUp size={12} className="text-primary"/><span className="text-xl font-extrabold text-primary tabular-nums">{u.totalScore}</span><span className="text-xs text-muted-foreground">/100</span></div>
                <p className="text-[11px] text-muted-foreground">{u.metrics.totalCalls} calls · {u.metrics.presentDays}/{u.metrics.totalDays} days · {u.metrics.avgDressRating!=null ? `${u.metrics.avgDressRating}/5` : 'no rating'}</p>
              </div>
            </a>
          ))}
        </div>
      }
    </div>
  );
}

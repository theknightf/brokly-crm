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
  if (rank === 1) return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow"><Crown size={14} className="text-white"/></div>;
  if (rank === 2) return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow"><Medal size={14} className="text-slate-800"/></div>;
  if (rank === 3) return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow"><Award size={14} className="text-white"/></div>;
  return <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{rank}</div>;
}

function ScoreBar({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">{icon}<span>{label}</span></div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full ${color} transition-all`} style={{ width: `${value}%` }} /></div>
      <div className="text-[11px] font-bold text-foreground mt-0.5">{value}</div>
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
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-lime-500 to-lime-600 flex items-center justify-center shadow"><Trophy size={16} className="text-white"/></div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">Performance Leaderboard <span className="text-xs font-normal text-muted-foreground hidden sm:inline">Â· Weighted 40/30/30</span></h2>
            <p className="text-xs text-muted-foreground font-mono">{range ? `${range.start} â†’ ${range.end}` : ''} Â· Total = CallÃ—0.40 + AttÃ—0.30 + DressÃ—0.30</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-1">
            {(['day','week','month'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${period===p ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>{p}</button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-muted"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-lime-600"/></div>
      : error ? <div className="text-center py-10"><p className="text-sm text-muted-foreground mb-3">Couldnâ€™t load leaderboard.</p><button onClick={load} className="btn-secondary text-sm">Retry</button></div>
      : users.length===0 ? <p className="text-sm text-muted-foreground text-center py-12">No data for this period.</p>
      : <div className="divide-y divide-border">
          {users.map(u => (
            <a key={u.user_id} href={`/admin/employees/${u.user_id}/360`} className={`p-3 flex items-center gap-3 hover:bg-lime-50/50 transition-colors cursor-pointer ${u.rank<=3 ? 'bg-gradient-to-r from-lime-50/50 to-transparent' : ''}`}>
              <RankIcon rank={u.rank}/>
              <div className="w-8 h-8 rounded-full bg-lime-50 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold text-lime-700">{(u.full_name||u.email).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</span></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1">{u.full_name || u.email} <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${u.rank===1 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>{u.role}</span> <span className="text-[11px] text-lime-600 hidden sm:inline">360 â†’</span></p>
                <div className="flex gap-3 mt-1">
                  <ScoreBar label="Call 40%" value={u.scores.callScore} icon={<Phone size={10} className="text-emerald-500"/>} color="bg-emerald-500"/>
                  <ScoreBar label="Attend 30%" value={u.scores.attendanceScore} icon={<Clock size={10} className="text-sky-500"/>} color="bg-sky-500"/>
                  <ScoreBar label="Dress 30%" value={u.scores.dressScore} icon={<Shirt size={10} className="text-lime-500"/>} color="bg-lime-500"/>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1 justify-end"><TrendingUp size={12} className="text-lime-600"/><span className="text-lg font-extrabold text-foreground">{u.totalScore}</span><span className="text-xs text-muted-foreground">/100</span></div>
                <p className="text-[11px] text-muted-foreground">{u.metrics.totalCalls} calls Â· {u.metrics.presentDays}/{u.metrics.totalDays} days Â· {u.metrics.avgDressRating!=null ? `${u.metrics.avgDressRating}/5` : 'no rating'}</p>
              </div>
            </a>
          ))}
        </div>
      }
    </div>
  );
}

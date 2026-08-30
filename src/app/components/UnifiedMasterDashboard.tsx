'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Trophy, Clock, Shirt, Phone, AlertTriangle, Banknote, TrendingUp, Calendar, Users, BarChart3, ExternalLink, Loader2, RefreshCw, Bell } from 'lucide-react';
import DressCodeEvaluationForm from '@/app/components/DressCodeEvaluationForm';
import WeightedLeaderboard from '@/app/components/WeightedLeaderboard';
import OwnerQuickActionsBar from '@/app/components/OwnerQuickActionsBar';

interface UnifiedData {
  summary: any; leaderboard: any[]; leadSummary: any; expenses: any; timeline: any[];
  deductions: { recent: any[]; pending: number }; notifications: { recent: any[]; unread: number };
  period: any; range: string;
}

export default function UnifiedMasterDashboard() {
  const [range, setRange] = useState<'week'|'month'>('week');
  const [data, setData] = useState<UnifiedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const leaderboardRef = useRef<HTMLDivElement | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/dashboard/unified-master?range=${range}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);
  const scrollToLeaderboard = () => leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary"/></div>;
  if (error) return <div className="text-center py-10"><p className="text-sm text-destructive mb-3">{error}</p><button onClick={load} className="btn-secondary text-sm flex items-center gap-1 mx-auto"><RefreshCw size={14}/> Retry</button></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* 1-Click Quick Actions Bar — top of Dashboard per spec */}
      <OwnerQuickActionsBar onLeaderboard={scrollToLeaderboard} />
      {/* Header - identical for Admin & Owner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow"><ShieldCheck size={18} className="text-white"/></div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Executive Master Dashboard</h1>
            <p className="text-xs text-muted-foreground">Identical for <span className="font-semibold text-violet-600">Admin</span> & <span className="font-semibold text-indigo-600">Owner</span> · {data.period?.from} → {data.period?.to} · {data.leadSummary?.total ?? 0} leads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-1">
            <button onClick={() => setRange('week')} className={`px-3 py-1 rounded-full text-xs font-medium ${range==='week'?'bg-card shadow':''}`}>Week</button>
            <button onClick={() => setRange('month')} className={`px-3 py-1 rounded-full text-xs font-medium ${range==='month'?'bg-card shadow':''}`}>Month</button>
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-muted"><RefreshCw size={14}/></button>
        </div>
      </div>

      {/* Executive Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Employees', value: data.summary.totalEmployees, icon: Users, color: 'text-slate-700 bg-slate-100' },
          { label: 'Present Today', value: data.summary.presentToday, sub: `${data.summary.absentToday} absent · ${data.summary.lateToday} late`, icon: Calendar, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Avg Hours', value: `${data.summary.avgHours}h`, sub: `${data.summary.totalHours}h total`, icon: Clock, color: 'text-sky-600 bg-sky-50' },
          { label: 'Attendance Rate', value: `${data.summary.attendanceRate}%`, icon: BarChart3, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Expenses', value: `${data.expenses.totalThis}`, sub: `${data.expenses.changePct>=0?'+':''}${data.expenses.changePct}%`, icon: Banknote, color: 'text-amber-600 bg-amber-50' },
          { label: 'Pending Deductions', value: data.deductions.pending, sub: `${data.notifications.unread} unread alerts`, icon: Bell, color: 'text-red-600 bg-red-50' },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${card.color}`}><card.icon size={14}/></div>
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-lg font-bold text-foreground">{card.value}</p>
            {card.sub && <p className="text-xs text-muted-foreground truncate">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* Two-col: Dress Code Form + Leaderboard */}
      <div ref={leaderboardRef} className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-24">
        <div className="lg:col-span-1"><DressCodeEvaluationForm/></div>
        <div className="lg:col-span-2"><WeightedLeaderboard/></div>
      </div>

      {/* Live Leaderboard from unified endpoint (weighted) - also show as table for drill-down */}
      <div id="leaderboard-table" className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Live Leaderboard (Unified) — 40% Valid Calls · 30% Attendance · 30% Dress</h3>
          <span className="text-xs text-muted-foreground">{data.leaderboard.length} ranked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr><th className="text-left px-4 py-2">#</th><th className="text-left px-2 py-2">Employee</th><th className="text-center px-2 py-2"><Phone size={12} className="inline"/> Calls</th><th className="text-center px-2 py-2"><Clock size={12} className="inline"/> Attend</th><th className="text-center px-2 py-2"><Shirt size={12} className="inline"/> Dress</th><th className="text-center px-2 py-2 font-bold">Total</th><th className="text-right px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.leaderboard.slice(0,10).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-bold">{r.rank}</td>
                  <td className="px-2 py-2"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">· {r.role}</span></td>
                  <td className="text-center">{r.scores.callScore}</td>
                  <td className="text-center">{r.scores.attendanceScore}</td>
                  <td className="text-center">{r.scores.dressScore}</td>
                  <td className="text-center font-extrabold text-violet-600">{r.totalScore}</td>
                  <td className="text-right px-4"><a href={`/admin/employees/${r.id}/360`} className="text-violet-600 hover:underline inline-flex items-center gap-1 text-xs">360 <ExternalLink size={12}/></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payroll & Deductions Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Banknote size={14} className="text-amber-600"/> Payroll & Deductions Hub</h3>
          {data.deductions.recent.length===0 ? <p className="text-xs text-muted-foreground text-center py-6">No deductions this period.</p>
          : <div className="space-y-2 max-h-[260px] overflow-auto">
              {data.deductions.recent.map((d:any)=>(
                <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-200 text-xs">
                  <div><p className="font-semibold text-red-800">{d.reason}</p><p className="text-muted-foreground">{d.source_ref} · {d.month_year}</p></div>
                  <div className="text-right"><p className="font-bold">-{d.amount}</p><p className={d.is_applied ? 'text-emerald-600' : 'text-amber-600'}>{d.is_applied ? 'Applied' : 'Pending'}</p></div>
                </div>
              ))}
            </div>
          }
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Bell size={14} className="text-violet-600"/> Instant Alerts (NotificationLog) — {data.notifications.unread} unread</h3>
          {data.notifications.recent.length===0 ? <p className="text-xs text-muted-foreground text-center py-6">No alerts.</p>
          : <div className="space-y-2 max-h-[260px] overflow-auto">
              {data.notifications.recent.map((n:any)=>(
                <div key={n.id} className={`p-2 rounded-lg border text-xs ${n.is_read ? 'bg-muted/30 border-border' : 'bg-violet-50 border-violet-200'}`}>
                  <p className="font-semibold">{n.title}</p><p className="text-muted-foreground line-clamp-2">{n.message}</p><p className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()} {n.is_read ? '· Read' : '· Unread'}</p>
                </div>
              ))}
            </div>
          }
          <a href="/admin?tab=payroll" className="text-xs text-violet-600 hover:underline mt-2 inline-block">View payroll →</a>
        </div>
      </div>

      {/* Lead Pipeline + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">Lead Pipeline (All Stages)</h3>
          <div className="space-y-2">
            {data.leadSummary.byStage.map((s:any)=>(
              <div key={s.stage} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{s.stage}</span><span className="font-bold">{s.count}</span></div>
            ))}
          </div>
          <a href="/leads-management" className="text-xs text-violet-600 hover:underline mt-3 inline-block">Open Kanban →</a>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">Recent Activity</h3>
          <div className="space-y-1 max-h-[200px] overflow-auto">
            {data.timeline.slice(0,12).map((t:any,i:number)=>(
              <div key={i} className="flex gap-2 text-xs py-1 border-b border-border/40 last:border-0"><span className="text-muted-foreground font-mono whitespace-nowrap">{String(t.createdAt).slice(0,16).replace('T',' ')}</span><span className="font-medium truncate">{t.employee}: {t.action}</span></div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">Single unified endpoint <code className="bg-muted px-1 py-0.5 rounded">GET /api/dashboard/unified-master</code> · roles <code>ADMIN_OWNER</code> · identically rendered for Admin & Owner</p>
    </div>
  );
}

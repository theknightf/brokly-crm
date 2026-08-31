'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Trophy, Clock, Shirt, Phone, AlertTriangle, Banknote, TrendingUp, Calendar, Users, BarChart3, ExternalLink, Loader2, RefreshCw, Bell, Zap, Filter, ArrowRight, Target, ShoppingBag, PhoneOff, XCircle, CheckCircle, Flame, Snowflake, Pause, LayoutGrid, List, Search, RotateCw } from 'lucide-react';
import DressCodeEvaluationForm from '@/app/components/DressCodeEvaluationForm';
import WeightedLeaderboard from '@/app/components/WeightedLeaderboard';
import OwnerQuickActionsBar from '@/app/components/OwnerQuickActionsBar';
import { toast } from 'sonner';

interface UnifiedData {
  summary: any; leaderboard: any[]; leadSummary: any; expenses: any; timeline: any[];
  deductions: { recent: any[]; pending: number }; notifications: { recent: any[]; unread: number };
  period: any; range: string;
  leadStageStats?: any; teamPerformance?: any; payrollDeductionsSummary?: any; conversionMetrics?: any;
}

type DashboardMode = 'sales' | 'leads';
type PipelineView = 'kanban' | 'table';

const STAGE_META: Record<string, { label: string; icon: any; color: string; bg: string; border: string; stageKeys: string[] }> = {
  newFresh: { label: 'New Fresh', icon: Flame, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', stageKeys: ['Fresh Leads','New Fresh'] },
  newCold: { label: 'New Cold', icon: Snowflake, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200', stageKeys: ['Cold Calls','New Cold'] },
  leadsPending: { label: 'Leads Pending', icon: Pause, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', stageKeys: ['Pending Leads','Leads Pending','Following Up'] },
  callsAnswer: { label: 'Calls Answer', icon: Phone, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', stageKeys: ['Calls Answer','Calls Answered','Meeting','Interested'] },
  noAnswer: { label: 'No Answer', icon: PhoneOff, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', stageKeys: ['No Answer','No Answer At All'] },
  cancel: { label: 'Cancel', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', stageKeys: ['Cancel','Cancellation'] },
  doneDeal: { label: 'D.Deal', icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300', stageKeys: ['Done Deal','D.Deal'] },
};

export default function UnifiedMasterDashboard() {
  const [range, setRange] = useState<'week'|'month'>('week');
  const [mode, setMode] = useState<DashboardMode>('sales');
  const [data, setData] = useState<UnifiedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [pipelineView, setPipelineView] = useState<PipelineView>('kanban');
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineLeads, setPipelineLeads] = useState<any[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [rotating, setRotating] = useState(false);

  const leaderboardRef = useRef<HTMLDivElement | null>(null);
  const pipelineRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/dashboard/unified-master?range=${range}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [range]);

  const loadPipelineLeads = useCallback(async () => {
    if (mode !== 'leads') return;
    setPipelineLoading(true);
    try {
      const params = new URLSearchParams();
      if (stageFilter) params.set('stage', stageFilter);
      if (pipelineSearch) params.set('search', pipelineSearch);
      params.set('pageSize', '50');
      const res = await fetch(`/api/leads?${params.toString()}`, { cache: 'no-store' });
      const j = await res.json();
      if (res.ok) setPipelineLeads(j.leads || []);
    } catch {} finally { setPipelineLoading(false); }
  }, [mode, stageFilter, pipelineSearch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPipelineLeads(); }, [loadPipelineLeads]);
  // debounce search
  useEffect(() => {
    if (mode !== 'leads') return;
    const t = setTimeout(loadPipelineLeads, 350);
    return () => clearTimeout(t);
  }, [pipelineSearch]);

  const scrollToLeaderboard = () => leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleStageClick = (key: string) => {
    const meta = STAGE_META[key];
    if (!meta) return;
    // toggle: if same stageKeys[0] already active, clear
    const target = meta.stageKeys[0];
    const isActive = stageFilter === target;
    const next = isActive ? null : target;
    setStageFilter(next);
    // scroll to pipeline table
    setTimeout(() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    if (next) toast.success(`Filtered: ${meta.label}`, { description: `${data?.leadStageStats?.[key]?.count ?? 0} leads` });
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await fetch('/api/leads/rotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'round_robin' }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success(`Rotated ${j.rotated} leads`, { description: j.message });
      load();
      loadPipelineLeads();
    } catch (e:any) { toast.error(e.message); } finally { setRotating(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary"/></div>;
  if (error) return <div className="text-center py-10"><p className="text-sm text-destructive mb-3">{error}</p><button onClick={load} className="btn-secondary text-sm flex items-center gap-1 mx-auto"><RefreshCw size={14}/> Retry</button></div>;
  if (!data) return null;

  const stageStats = data.leadStageStats || {
    newFresh: { count: 0, percentage: '0%' },
    newCold: { count: 0, percentage: '0%' },
    leadsPending: { count: 0, percentage: '0%' },
    callsAnswer: { count: 0, percentage: '0%' },
    noAnswer: { count: 0, percentage: '0%' },
    cancel: { count: 0, percentage: '0%' },
    doneDeal: { count: 0, percentage: '0%', revenue: 0 },
  };

  const filteredLeads = pipelineLeads;

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
            <p className="text-xs text-muted-foreground">Identical for <span className="font-semibold text-violet-600">Admin</span> & <span className="font-semibold text-indigo-600">Owner</span> · {data.period?.from} → {data.period?.to} · {data.leadSummary?.total ?? 0} leads · {data.summary?.conversionRate ?? 0}% conv</p>
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

      {/* Dual-Mode Toggle — sticky Segmented Control */}
      <div className="sticky top-2 z-20 bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-1.5 shadow-sm flex gap-1.5">
        <button
          onClick={() => setMode('sales')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode==='sales' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
        >
          <Users size={16}/> 👥 Sales & Team Performance
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${mode==='sales' ? 'bg-white/20' : 'bg-muted'}`}>{data.leaderboard.length}</span>
        </button>
        <button
          onClick={() => setMode('leads')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode==='leads' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
        >
          <Target size={16}/> 🎯 Leads Pipeline & Data Hub
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${mode==='leads' ? 'bg-white/20' : 'bg-muted'}`}>{data.summary?.totalLeads ?? 0}</span>
        </button>
      </div>

      {/* Interactive Lead Stage KPI Cards — globally accessible, highlight on Leads mode */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 size={14} className="text-violet-600"/> Lead Stage KPI Cards — 1-Click Filter</h3>
          {stageFilter && <button onClick={() => setStageFilter(null)} className="text-xs bg-muted hover:bg-muted/80 px-3 py-1 rounded-full flex items-center gap-1"><Filter size={12}/> Reset filter <span className="font-semibold">{stageFilter}</span></button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {Object.entries(STAGE_META).map(([key, meta]) => {
            const stat = (stageStats as any)[key] || { count: 0, percentage: '0%' };
            const isActive = stageFilter === meta.stageKeys[0];
            const isDoneDeal = key === 'doneDeal';
            return (
              <button
                key={key}
                onClick={() => handleStageClick(key)}
                className={`text-left rounded-2xl border-2 p-3 transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] ${isActive ? 'border-violet-500 bg-violet-600 text-white shadow-lg' : `${meta.bg} ${meta.border} hover:border-violet-300`}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${isActive ? 'bg-white/20 text-white' : 'bg-white shadow-sm '+meta.color}`}><meta.icon size={14}/></div>
                <p className={`text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-foreground'}`}>{meta.label}</p>
                <p className={`text-xl font-extrabold ${isActive ? 'text-white' : 'text-foreground'}`}>{stat.count}</p>
                <p className={`text-xs ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>{stat.percentage} {isDoneDeal && stat.revenue ? `· ${Number(stat.revenue).toLocaleString()} EGP` : ''}</p>
                <p className={`text-[11px] mt-1 flex items-center gap-1 ${isActive ? 'text-white/90' : 'text-violet-600'}`}>Filter <ArrowRight size={10}/></p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Click any card to instantly filter the pipeline table/Kanban below. <span className="font-mono bg-muted px-1 py-0.5 rounded">GET /api/dashboard/unified-master.leadStageStats</span></p>
      </div>

      {mode === 'sales' ? (
        <>
          {/* Executive Overview — Sales */}
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

          {/* Sales KPIs + Conversion */}
          {data.conversionMetrics && (
            <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><ShoppingBag size={16} className="text-emerald-600"/><h3 className="text-sm font-bold">Sales Performance KPIs ↔ Lead Analytics</h3></div>
              <div className="flex gap-2 text-xs">
                <span className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">Conversion <b>{data.conversionMetrics.conversionRate}%</b></span>
                <span className="bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full">Revenue <b>{Number(data.conversionMetrics.revenue||0).toLocaleString()} EGP</b></span>
                <span className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">Avg Score <b>{data.teamPerformance?.avgScore ?? '-'}/100</b></span>
              </div>
            </div>
          )}

          {/* Two-col: Dress Code Form + Leaderboard */}
          <div ref={leaderboardRef} className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-24">
            <div className="lg:col-span-1"><DressCodeEvaluationForm/></div>
            <div className="lg:col-span-2"><WeightedLeaderboard/></div>
          </div>

          {/* Live Leaderboard table for 360 drill-down */}
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
        </>
      ) : (
        <>
          {/* Leads Pipeline & Data Hub */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Sources</p><p className="text-sm font-bold">{data.leadSummary?.bySource?.length ?? 0} channels</p></div>
              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                {(data.leadSummary?.bySource||[]).slice(0,4).map((s:any)=>(<span key={s.source} className="text-xs bg-muted px-2 py-1 rounded-full">{s.source} {s.count}</span>))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Conversion</p><p className="text-sm font-bold">{data.conversionMetrics?.conversionRate ?? 0}% · {data.conversionMetrics?.doneDeal ?? 0} won</p></div>
              <span className="text-xs bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">{Number(data.conversionMetrics?.revenue||0).toLocaleString()} EGP</span>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Data Rotation</p><p className="text-sm font-bold">Round-robin</p></div>
              <button onClick={handleRotate} disabled={rotating} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">{rotating ? <Loader2 size={12} className="animate-spin"/> : <RotateCw size={12}/>} Rotate Data</button>
            </div>
          </div>

          {/* Pipeline toolbar */}
          <div ref={pipelineRef} className="bg-card border border-border rounded-2xl p-3 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={pipelineSearch} onChange={e=>setPipelineSearch(e.target.value)} placeholder="Search leads..." className="input-base pl-8 h-9 text-sm w-full"/>
              </div>
              {stageFilter && <span className="text-xs bg-violet-600 text-white px-2 py-1 rounded-full flex items-center gap-1">Stage: {stageFilter} <button onClick={()=>setStageFilter(null)} className="hover:bg-white/20 rounded-full p-0.5"><XCircle size={10}/></button></span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-muted rounded-lg p-1">
                <button onClick={()=>setPipelineView('kanban')} className={`px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${pipelineView==='kanban'?'bg-card shadow':''}`}><LayoutGrid size={12}/> Kanban</button>
                <button onClick={()=>setPipelineView('table')} className={`px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${pipelineView==='table'?'bg-card shadow':''}`}><List size={12}/> Table</button>
              </div>
              <a href="/leads-management" className="text-xs text-violet-600 hover:underline flex items-center gap-1">Full Leads <ExternalLink size={12}/></a>
            </div>
          </div>

          {/* Pipeline content */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {pipelineLoading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-violet-600"/></div>
            : filteredLeads.length===0 ? <div className="text-center py-12 text-sm text-muted-foreground">No leads {stageFilter ? `for stage "${stageFilter}"` : ''} {pipelineSearch ? `matching "${pipelineSearch}"` : ''}. <button onClick={()=>{setStageFilter(null); setPipelineSearch('');}} className="text-violet-600 underline">Clear filters</button></div>
            : pipelineView==='table' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Lead</th><th className="text-left px-2 py-2">Phone</th><th className="text-center px-2 py-2">Stage</th><th className="text-center px-2 py-2">Assigned</th><th className="text-right px-4 py-2"></th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {filteredLeads.slice(0,50).map((l:any)=>(
                      <tr key={l.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2"><a href={`/leads/${l.id}`} className="font-medium text-violet-600 hover:underline">{l.name || 'Lead'}</a><span className="ml-2 text-xs text-muted-foreground">{l.source||''}</span></td>
                        <td className="px-2 py-2 font-mono text-xs">{l.phone||'—'}</td>
                        <td className="text-center"><span className="text-xs bg-muted px-2 py-0.5 rounded-full">{l.crm_status || l.lead_status||'—'}</span></td>
                        <td className="text-center text-xs">{l.assigned_to_profile?.full_name || l.assigned_to || 'Unassigned'}</td>
                        <td className="text-right px-4"><a href={`/leads/${l.id}`} className="text-xs text-violet-600 hover:underline">Profile →</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                {filteredLeads.slice(0,24).map((l:any)=>(
                  <a key={l.id} href={`/leads/${l.id}`} className="block bg-card border border-border rounded-xl p-3 hover:border-violet-300 hover:shadow-sm transition-all">
                    <p className="font-semibold text-sm truncate">{l.name || 'Lead'}</p>
                    <p className="text-xs text-muted-foreground">{l.phone} · {l.source||'—'}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">{l.crm_status || l.lead_status}</span>
                      <span className="text-xs text-muted-foreground">{l.assigned_to ? 'Assigned' : 'Unassigned'}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Mini timeline for leads */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">Recent Activity</h3>
            <div className="space-y-1 max-h-[200px] overflow-auto">
              {data.timeline.slice(0,12).map((t:any,i:number)=>(
                <div key={i} className="flex gap-2 text-xs py-1 border-b border-border/40 last:border-0"><span className="text-muted-foreground font-mono whitespace-nowrap">{String(t.createdAt).slice(0,16).replace('T',' ')}</span><span className="font-medium truncate">{t.employee}: {t.action}</span></div>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-center text-muted-foreground">Single unified endpoint <code className="bg-muted px-1 py-0.5 rounded">GET /api/dashboard/unified-master</code> · modes <code>sales|leads</code> · interactive stage cards → Kanban/Table filter · `leadStageStats` + `teamPerformance` + `payrollDeductionsSummary`</p>
    </div>
  );
}

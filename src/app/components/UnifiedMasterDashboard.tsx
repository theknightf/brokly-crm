'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Trophy, Clock, Shirt, Phone, AlertTriangle, Banknote, Calendar, Users, BarChart3, ExternalLink, Loader2, RefreshCw, Bell, Zap, Target, ShoppingBag, LayoutGrid, List, Search, RotateCw, XCircle } from 'lucide-react';
import DressCodeEvaluationForm from '@/app/components/DressCodeEvaluationForm';
import WeightedLeaderboard from '@/app/components/WeightedLeaderboard';
import LeadStageCardsBar from '@/app/components/LeadStageCardsBar';
import { toast } from 'sonner';

interface UnifiedData {
  summary: any; leaderboard: any[]; leadSummary: any; expenses: any; timeline: any[];
  deductions: { recent: any[]; pending: number }; notifications: { recent: any[]; unread: number };
  period: any; range: string;
  leadStageStats?: any; teamPerformance?: any; payrollDeductionsSummary?: any; conversionMetrics?: any;
}

type DashboardMode = 'sales' | 'leads';
type PipelineView = 'kanban' | 'table';

const STAGE_META: Record<string, { label: string; stageKeys: string[] }> = {
  newFresh: { label: 'New Fresh', stageKeys: ['Fresh Leads','New Fresh'] },
  newCold: { label: 'New Cold', stageKeys: ['Cold Calls','New Cold'] },
  leadsPending: { label: 'Leads Pending', stageKeys: ['Pending Leads','Leads Pending','Following Up'] },
  callsAnswer: { label: 'Calls Answer', stageKeys: ['Calls Answer','Calls Answered','Meeting','Interested'] },
  noAnswer: { label: 'No Answer', stageKeys: ['No Answer','No Answer At All'] },
  cancel: { label: 'Cancel', stageKeys: ['Cancel','Cancellation'] },
  doneDeal: { label: 'D.Deal', stageKeys: ['Done Deal','D.Deal'] },
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
  useEffect(() => {
    if (mode !== 'leads') return;
    const t = setTimeout(loadPipelineLeads, 350);
    return () => clearTimeout(t);
  }, [pipelineSearch]);

  const handleStageClick = (key: string) => {
    const meta = (STAGE_META as any)[key];
    if (!meta) return;
    const target = meta.stageKeys[0];
    const isActive = stageFilter === target;
    const next = isActive ? null : target;
    setStageFilter(next);
    setTimeout(() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    if (next) toast.success(`Filtered: ${meta.label}`, { description: `${data?.leadStageStats?.[key]?.count ?? 0} leads` });
  };

  const activeStageKeyForBar = (() => {
    if (!stageFilter) return null;
    for (const [k, v] of Object.entries(STAGE_META)) if ((v as any).stageKeys.includes(stageFilter)) return k;
    return null;
  })();

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

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-lime-500"/></div>;
  if (error) return <div className="text-center py-10"><p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p><button onClick={load} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-xl text-sm flex items-center gap-1 mx-auto hover:bg-zinc-50 dark:hover:bg-zinc-800"> <RefreshCw size={14}/> Retry</button></div>;
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
    <div className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 min-h-screen transition-colors duration-200 -m-3 sm:-m-5 p-3 sm:p-5 rounded-[2rem] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow"><ShieldCheck size={18} className="text-white"/></div>
          <div>
            <h1 className="text-zinc-900 dark:text-white font-bold text-xl tracking-tight">Executive Master Dashboard</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Identical for <span className="font-semibold text-violet-600 dark:text-violet-400">Admin</span> & <span className="font-semibold text-indigo-600 dark:text-indigo-400">Owner</span> · {data.period?.from} → {data.period?.to} · {data.leadSummary?.total ?? 0} leads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1">
            <button onClick={() => setRange('week')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${range==='week'?'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow': 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>Week</button>
            <button onClick={() => setRange('month')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${range==='month'?'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow': 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>Month</button>
          </div>
          <button onClick={load} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 w-9 h-9 rounded-xl flex items-center justify-center transition-colors"><RefreshCw size={14}/></button>
        </div>
      </div>

      {/* View Switcher — sleek minimalist */}
      <div className="bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-300/80 dark:border-zinc-800 rounded-2xl p-1.5 flex gap-1.5">
        <button
          onClick={() => setMode('sales')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode==='sales' ? 'bg-lime-500 text-zinc-950 font-bold shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50'}`}
        >
          <Users size={16}/> Sales & Team Performance
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${mode==='sales' ? 'bg-zinc-900/10 text-zinc-950' : 'bg-lime-500/15 text-lime-700 dark:text-lime-400'}`}>{data.leaderboard.length}</span>
        </button>
        <button
          onClick={() => setMode('leads')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode==='leads' ? 'bg-lime-500 text-zinc-950 font-bold shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50'}`}
        >
          <Target size={16}/> Leads Pipeline & Data Hub
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${mode==='leads' ? 'bg-zinc-900/10 text-zinc-950' : 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400'}`}>{data.summary?.totalLeads ?? 0}</span>
        </button>
      </div>

      {/* Interactive Lead Stage KPI Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2"><BarChart3 size={14} className="text-violet-600 dark:text-violet-400"/> Lead Stages</h3>
          {stageFilter && <button onClick={() => setStageFilter(null)} className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">Clear filter <span className="font-semibold">{stageFilter}</span> <XCircle size={12}/></button>}
        </div>
        <LeadStageCardsBar stats={stageStats} activeStageKey={activeStageKeyForBar} onStageClick={handleStageClick} />
      </div>

      {mode === 'sales' ? (
        <>
          {/* Executive Overview — theme stable */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Employees', value: data.summary.totalEmployees, icon: Users, light: 'bg-white border-zinc-200', dark: 'dark:bg-zinc-900 dark:border-zinc-800', iconBg: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' },
              { label: 'Present Today', value: data.summary.presentToday, sub: `${data.summary.absentToday} absent · ${data.summary.lateToday} late`, icon: Calendar, light: 'bg-white border-zinc-200', dark: 'dark:bg-zinc-900 dark:border-zinc-800', iconBg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
              { label: 'Avg Hours', value: `${data.summary.avgHours}h`, sub: `${data.summary.totalHours}h total`, icon: Clock, light: 'bg-white border-zinc-200', dark: 'dark:bg-zinc-900 dark:border-zinc-800', iconBg: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400' },
              { label: 'Attendance Rate', value: `${data.summary.attendanceRate}%`, icon: BarChart3, light: 'bg-white border-zinc-200', dark: 'dark:bg-zinc-900 dark:border-zinc-800', iconBg: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
              { label: 'Expenses', value: `${Number(data.expenses.totalThis).toLocaleString()}`, sub: `${data.expenses.changePct>=0?'+':''}${data.expenses.changePct}%`, icon: Banknote, light: 'bg-white border-zinc-200', dark: 'dark:bg-zinc-900 dark:border-zinc-800', iconBg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' },
              { label: 'Pending Deductions', value: data.deductions.pending, sub: `${data.notifications.unread} unread`, icon: Bell, light: 'bg-white border-zinc-200', dark: 'dark:bg-zinc-900 dark:border-zinc-800', iconBg: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400' },
            ].map(card => (
              <div key={card.label} className={`rounded-2xl p-4 border shadow-sm transition-colors ${card.light} ${card.dark}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${card.iconBg}`}><card.icon size={14}/></div>
                <p className="text-zinc-500 dark:text-zinc-400 text-xs">{card.label}</p>
                <p className="text-xl font-black text-zinc-900 dark:text-white">{card.value}</p>
                {card.sub && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{card.sub}</p>}
              </div>
            ))}
          </div>

          {/* Sales KPIs + Conversion — hidden api words */}
          {data.conversionMetrics && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><ShoppingBag size={16} className="text-emerald-600 dark:text-emerald-400"/><h3 className="text-sm font-bold text-zinc-900 dark:text-white">Sales Performance ↔ Lead Analytics</h3></div>
              <div className="flex gap-2 text-xs">
                <span className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full">Conversion <b className="text-zinc-900 dark:text-white">{data.conversionMetrics.conversionRate}%</b></span>
                <span className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded-full">Revenue <b className="text-zinc-900 dark:text-white">{Number(data.conversionMetrics.revenue||0).toLocaleString()} EGP</b></span>
                <span className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-800/50 text-violet-700 dark:text-violet-300 px-3 py-1.5 rounded-full">Avg Score <b className="text-zinc-900 dark:text-white">{data.teamPerformance?.avgScore ?? '-'}</b></span>
              </div>
            </div>
          )}

          {/* Two-col: Dress Code Form + Leaderboard */}
          <div ref={leaderboardRef} className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-24">
            <div className="lg:col-span-1"><DressCodeEvaluationForm/></div>
            <div className="lg:col-span-2"><WeightedLeaderboard/></div>
          </div>

          {/* Live Leaderboard — enterprise table with View 360 */}
          <div id="leaderboard-table" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Live Leaderboard — 40% Calls · 30% Attendance · 30% Dress</h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{data.leaderboard.length} ranked</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500 dark:text-zinc-400">
                  <tr><th className="text-left px-4 py-2.5 font-semibold">#</th><th className="text-left px-2 py-2.5 font-semibold">Employee</th><th className="text-center px-2 py-2.5 font-semibold">Calls 40%</th><th className="text-center px-2 py-2.5 font-semibold">Attend 30%</th><th className="text-center px-2 py-2.5 font-semibold">Dress 30%</th><th className="text-center px-2 py-2.5 font-bold">Total</th><th className="text-right px-4 py-2.5 font-semibold">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.leaderboard.slice(0,10).map((r: any) => (
                    <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3 font-bold text-zinc-900 dark:text-white">{r.rank}</td>
                      <td className="px-2 py-3"><span className="font-medium text-zinc-900 dark:text-white">{r.name}</span> <span className="text-xs text-zinc-500 dark:text-zinc-400">· {r.role}</span></td>
                      <td className="text-center text-zinc-700 dark:text-zinc-300">{r.scores.callScore}</td>
                      <td className="text-center text-zinc-700 dark:text-zinc-300">{r.scores.attendanceScore}</td>
                      <td className="text-center text-zinc-700 dark:text-zinc-300">{r.scores.dressScore}</td>
                      <td className="text-center font-extrabold text-violet-600 dark:text-violet-400">{r.totalScore}</td>
                      <td className="text-right px-4"><a href={`/admin/employees/${r.id}/360`} className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-3 py-1 rounded-full text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1">View 360 <ExternalLink size={10}/></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payroll & Deduction Activity Feed — compact */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-3"><Banknote size={14} className="text-amber-600 dark:text-amber-400"/> Payroll & Deductions</h3>
              {data.deductions.recent.length===0 ? <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center py-6">No deductions this period.</p>
              : <div className="space-y-2 max-h-[260px] overflow-auto">
                  {data.deductions.recent.map((d:any)=>(
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-900/50 text-xs">
                      <div><p className="font-semibold text-zinc-900 dark:text-white">{d.reason}</p><p className="text-zinc-500 dark:text-zinc-400">{d.source_ref} · {d.month_year}</p></div>
                      <div className="text-right"><p className="font-bold text-zinc-900 dark:text-white">-{d.amount} EGP</p><p className={d.is_applied ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{d.is_applied ? 'Applied' : 'Pending'}</p></div>
                    </div>
                  ))}
                </div>
              }
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-3"><Bell size={14} className="text-violet-600 dark:text-violet-400"/> Recent Alerts</h3>
              {data.notifications.recent.length===0 ? <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center py-6">No alerts.</p>
              : <div className="space-y-2 max-h-[260px] overflow-auto">
                  {data.notifications.recent.map((n:any)=>(
                    <div key={n.id} className={`p-3 rounded-xl border text-xs ${n.is_read ? 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700' : 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-900/50'}`}>
                      <p className="font-semibold text-zinc-900 dark:text-white">{n.title}</p><p className="text-zinc-600 dark:text-zinc-400 line-clamp-2">{n.message}</p><p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Leads Pipeline & Data Hub */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div><p className="text-xs text-zinc-500 dark:text-zinc-400">Sources</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{data.leadSummary?.bySource?.length ?? 0} channels</p></div>
              <div className="flex flex-wrap gap-1.5 justify-end max-w-[60%]">
                {(data.leadSummary?.bySource||[]).slice(0,4).map((s:any)=>(<span key={s.source} className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 rounded-full">{s.source} {s.count}</span>))}
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div><p className="text-xs text-zinc-500 dark:text-zinc-400">Conversion</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{data.conversionMetrics?.conversionRate ?? 0}% · {data.conversionMetrics?.doneDeal ?? 0} won</p></div>
              <span className="text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full font-semibold">{Number(data.conversionMetrics?.revenue||0).toLocaleString()} EGP</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div><p className="text-xs text-zinc-500 dark:text-zinc-400">Data Rotation</p><p className="text-sm font-bold text-zinc-900 dark:text-white">Round-robin</p></div>
              <button onClick={handleRotate} disabled={rotating} className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs px-4 py-2 rounded-full font-semibold flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 shadow-sm">{rotating ? <Loader2 size={12} className="animate-spin"/> : <RotateCw size={12}/>} Rotate Data</button>
            </div>
          </div>

          {/* Pipeline toolbar — theme stable */}
          <div ref={pipelineRef} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 flex flex-wrap gap-3 items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/>
                <input value={pipelineSearch} onChange={e=>setPipelineSearch(e.target.value)} placeholder="Search leads..." className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-400 pl-9 h-9 text-sm w-full rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"/>
              </div>
              {stageFilter && <span className="text-xs bg-lime-500 text-zinc-900 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-bold">Stage: {stageFilter} <button onClick={()=>setStageFilter(null)} className="hover:bg-black/10 rounded-full p-0.5"><XCircle size={12}/></button></span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
                <button onClick={()=>setPipelineView('kanban')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${pipelineView==='kanban'?'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow': 'text-zinc-500 dark:text-zinc-400'}`}><LayoutGrid size={12}/> Kanban</button>
                <button onClick={()=>setPipelineView('table')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${pipelineView==='table'?'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow': 'text-zinc-500 dark:text-zinc-400'}`}><List size={12}/> Table</button>
              </div>
              <a href="/leads-management" className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:underline flex items-center gap-1 font-medium">Full Leads <ExternalLink size={12}/></a>
            </div>
          </div>

          {/* Pipeline content — theme stable */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            {pipelineLoading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-zinc-400"/></div>
            : filteredLeads.length===0 ? <div className="text-center py-12 text-sm text-zinc-500 dark:text-zinc-400">No leads {stageFilter ? `for "${stageFilter}"` : ''} {pipelineSearch ? `matching "${pipelineSearch}"` : ''}. <button onClick={()=>{setStageFilter(null); setPipelineSearch('');}} className="text-violet-600 dark:text-violet-400 underline font-medium">Clear filters</button></div>
            : pipelineView==='table' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500 dark:text-zinc-400"><tr><th className="text-left px-4 py-3 font-semibold">Lead</th><th className="text-left px-2 py-3 font-semibold">Phone</th><th className="text-center px-2 py-3 font-semibold">Stage</th><th className="text-center px-2 py-3 font-semibold">Assigned</th><th className="text-right px-4 py-3 font-semibold"></th></tr></thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredLeads.slice(0,50).map((l:any)=>(
                      <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3"><a href={`/leads/${l.id}`} className="font-medium text-zinc-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 hover:underline">{l.name || 'Lead'}</a><span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{l.source||''}</span></td>
                        <td className="px-2 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{l.phone||'—'}</td>
                        <td className="text-center"><span className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 rounded-full">{l.crm_status || l.lead_status||'—'}</span></td>
                        <td className="text-center text-xs text-zinc-600 dark:text-zinc-400">{l.assigned_to_profile?.full_name || l.assigned_to || 'Unassigned'}</td>
                        <td className="text-right px-4"><a href={`/leads/${l.id}`} className="text-xs bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-3 py-1 rounded-full font-semibold hover:opacity-90">Open →</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-zinc-50 dark:bg-zinc-950">
                {filteredLeads.slice(0,24).map((l:any)=>(
                  <a key={l.id} href={`/leads/${l.id}`} className="block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <p className="font-semibold text-sm truncate text-zinc-900 dark:text-white">{l.name || 'Lead'}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{l.phone} · {l.source||'—'}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 rounded-full">{l.crm_status || l.lead_status}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{l.assigned_to ? 'Assigned' : 'Unassigned'}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Trophy, Clock, Shirt, Phone, AlertTriangle, Banknote, TrendingUp, Calendar, Users, BarChart3, ExternalLink, Loader2, RefreshCw, Bell, Zap, Filter, ArrowRight, Target, ShoppingBag, LayoutGrid, List, Search, RotateCw } from 'lucide-react';
import DressCodeEvaluationForm from '@/app/components/DressCodeEvaluationForm';
import WeightedLeaderboard from '@/app/components/WeightedLeaderboard';
import KpiCardsGrid from '@/app/components/KpiCardsGrid';
import DailyLeaderboard from '@/app/components/DailyLeaderboard';
import DelayList from '@/app/components/DelayList';
import DashboardTeamFilter from '@/app/components/DashboardTeamFilter';
import ActivityPerHourChart from '@/app/components/ActivityPerHourChart';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

interface UnifiedData {
  summary: any; leaderboard: any[]; leadSummary: any; expenses: any; timeline: any[];
  deductions: { recent: any[]; pending: number }; notifications: { recent: any[]; unread: number };
  period: any; range: string;
  leadStageStats?: any; teamPerformance?: any; payrollDeductionsSummary?: any; conversionMetrics?: any;
}

type DashboardMode = 'sales' | 'leads';
type PipelineView = 'kanban' | 'table';

/** One titled block of the page (module level so its children keep their state between renders). */
function Section({ id, title, hint, icon: Icon, right, children }: { id: string; title: string; hint?: string; icon: any; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Icon size={16} /></span>
          <div className="min-w-0">
            <h2 id={`${id}-h`} className="text-base font-bold text-foreground leading-tight">{title}</h2>
            {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function UnifiedMasterDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const [range, setRange] = useState<'week'|'month'>('week');
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const mode: DashboardMode = pipelineOpen ? 'leads' : 'sales';
  const [data, setData] = useState<UnifiedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pipelineView, setPipelineView] = useState<PipelineView>('kanban');
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineLeads, setPipelineLeads] = useState<any[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);

  const leaderboardRef = useRef<HTMLDivElement | null>(null);

  const dataRef = useRef<UnifiedData | null>(null);
  dataRef.current = data;

  const load = useCallback(async (silent = false) => {
    // Guard: wait for auth hydration and ensure Owner/Admin role
    if (authLoading) return;
    if (!user || !profile || !isAdminRole(profile.role)) {
      setLoading(false);
      if (!user) setError('');
      return;
    }
    if (!silent && !dataRef.current) setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/unified-master?range=${range}`, { cache: 'no-store', credentials: 'same-origin' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
    } catch (e: any) {
      if (!dataRef.current) setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range, authLoading, user?.id, profile?.role]);

  const loadPipelineLeads = useCallback(async () => {
    if (mode !== 'leads') return;
    setPipelineLoading(true);
    try {
      const params = new URLSearchParams();
      if (pipelineSearch) params.set('search', pipelineSearch);
      params.set('pageSize', '50');
      const res = await fetch(`/api/leads?${params.toString()}`, { cache: 'no-store' });
      const j = await res.json();
      if (res.ok) setPipelineLeads(j.leads || []);
    } catch {} finally { setPipelineLoading(false); }
  }, [mode, pipelineSearch]);

  // Re-fetch immediately when session/profile hydrates or range changes; silently revalidate on focus/visibility
  useEffect(() => { if (!authLoading) load(false); }, [load, authLoading]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && !authLoading && isAdminRole(profile?.role)) load(true); };
    const onFocus = () => { if (!authLoading && isAdminRole(profile?.role)) load(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, authLoading, profile?.role]);
  useEffect(() => { loadPipelineLeads(); }, [loadPipelineLeads]);
  // debounce search
  useEffect(() => {
    if (mode !== 'leads') return;
    const t = setTimeout(loadPipelineLeads, 350);
    return () => clearTimeout(t);
  }, [pipelineSearch]);

  const scrollToLeaderboard = () => leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

  if (error && !data) return <div className="text-center py-10"><p className="text-sm text-destructive mb-3">{error}</p><button onClick={() => load(false)} className="btn-secondary text-sm flex items-center gap-1 mx-auto"><RefreshCw size={14}/> Retry</button></div>;
  // Not an owner/admin (nothing to load): render nothing, as before.
  if (!loading && !data) return null;

  // The big executive payload (data) loads in parallel with the cards, hourly chart, leaderboard and delay list below:
  // those sections fetch their own data, so they are mounted immediately instead of waiting for it (it used to be a
  // waterfall: skeleton -> unified-master -> THEN the other 8 requests started).
  const executiveSkeleton = (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="dash-card h-[104px]" />)}
      </div>
      <div className="dash-card h-64" />
    </div>
  );

  const filteredLeads = pipelineLeads;

  const fmt = (n: any) => Number(n || 0).toLocaleString();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const SECTIONS = [
    { id: 'sec-overview', label: 'Overview', icon: LayoutGrid },
    { id: 'sec-leads', label: 'Leads', icon: Target },
    { id: 'sec-team', label: 'Team performance', icon: Trophy },
    { id: 'sec-people', label: 'People & payroll', icon: Banknote },
    { id: 'sec-pipeline', label: 'Pipeline', icon: List },
  ];

  const rangeBtn = (r: 'week' | 'month', label: string) => (
    <button
      onClick={() => setRange(r)}
      aria-pressed={range === r}
      className={`px-3.5 py-1.5 [@media(pointer:coarse)]:min-h-[44px] rounded-full text-xs font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${range === r ? 'bg-primary text-primary-foreground border-transparent shadow-sm' : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-background text-foreground min-h-dvh transition-colors duration-200 space-y-7 p-4 md:p-6 -m-4 md:-m-6">
      {/* ── Header: title, period, range, refresh ── */}
      {!data ? (
        <div className="space-y-3 animate-pulse" aria-hidden>
          <div className="h-8 w-72 max-w-full rounded-lg bg-muted" />
          <div className="h-10 w-full sm:w-96 rounded-full bg-muted" />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-foreground font-extrabold text-2xl tracking-tight flex flex-wrap items-center gap-2.5">
              Executive Dashboard
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-lime-500/10 border border-lime-500/30 text-[11px] font-semibold text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Live
              </span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {data.period?.from} — {data.period?.to} <span className="mx-1">•</span> {fmt(data.leadSummary?.total)} leads <span className="mx-1">•</span> {fmt(data.summary.totalEmployees)} team
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {rangeBtn('week', 'Week')}
            {rangeBtn('month', 'Month')}
            <button onClick={() => load(false)} aria-label="Refresh" className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-full bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RefreshCw size={14} /></button>
          </div>
        </div>
      )}

      {/* ── Section jump bar (sticks to the top while scrolling) ── */}
      <nav aria-label="Dashboard sections" className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/90 backdrop-blur border-b border-border">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => { if (s.id === 'sec-pipeline') setPipelineOpen(true); go(s.id); }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 [@media(pointer:coarse)]:min-h-[44px] text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <s.icon size={13} /> {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── 1. Overview: the numbers that matter, one row ── */}
      <Section id="sec-overview" title="Overview" hint="Today's team, money and results at a glance" icon={LayoutGrid}>
        {!data ? executiveSkeleton : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Conversion', value: `${data.conversionMetrics?.conversionRate ?? 0}%`, sub: `${fmt(data.conversionMetrics?.doneDeal)} won`, icon: ShoppingBag, color: 'text-lime-500 bg-lime-500/10' },
              { label: 'Revenue', value: fmt(data.conversionMetrics?.revenue), sub: 'EGP', icon: TrendingUp, color: 'text-emerald-500 bg-emerald-500/10' },
              { label: 'Present Today', value: data.summary.presentToday, sub: `${data.summary.absentToday} absent · ${data.summary.lateToday} late`, icon: Calendar, color: 'text-emerald-400 bg-emerald-500/10' },
              { label: 'Attendance Rate', value: `${data.summary.attendanceRate}%`, sub: `${data.summary.avgHours}h avg`, icon: BarChart3, color: 'text-indigo-400 bg-indigo-500/10' },
              { label: 'Expenses', value: fmt(data.expenses.totalThis), sub: `${data.expenses.changePct >= 0 ? '+' : ''}${data.expenses.changePct}% vs last`, icon: Banknote, color: 'text-amber-400 bg-amber-500/10' },
              { label: 'Pending Deductions', value: data.deductions.pending, sub: `${data.notifications.unread} unread alerts`, icon: Bell, color: 'text-red-400 bg-red-500/10' },
            ].map((card) => (
              <div key={card.label} className="dash-card dash-card-hover p-4 overflow-hidden">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase truncate pt-1">{card.label}</p>
                  <div className={`dash-icon-chip ${card.color}`}><card.icon size={15} /></div>
                </div>
                <p className="text-3xl font-extrabold text-foreground mt-2 tabular-nums tracking-tight">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</p>
                {card.sub && <p className="text-muted-foreground text-xs mt-1.5 truncate">{card.sub}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 2. Leads: filter by team / agent, stage cards, sources ── */}
      <Section
        id="sec-leads"
        title="Leads by stage"
        hint="Tap a card to open those leads. The filter applies to this section and the activity chart."
        icon={Target}
        right={<a href="/leads-management" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">All leads <ExternalLink size={12} /></a>}
      >
        <DashboardTeamFilter onChange={(t, a) => { setFilterTeamId(t); setFilterAgentId(a); }} />
        <KpiCardsGrid teamId={filterTeamId || undefined} agentId={filterAgentId || undefined} />
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="dash-card p-4 flex items-center justify-between gap-3">
              <div><p className="text-xs text-muted-foreground">Sources</p><p className="text-sm font-bold">{data.leadSummary?.bySource?.length ?? 0} channels</p></div>
              <div className="flex flex-wrap gap-1 justify-end max-w-[65%]">
                {(data.leadSummary?.bySource || []).slice(0, 5).map((s: any) => (<span key={s.source} className="text-xs bg-muted text-foreground px-2.5 py-1 rounded-full">{s.source} {s.count}</span>))}
              </div>
            </div>
            <div className="dash-card p-4 flex items-center justify-between gap-3">
              <div><p className="text-xs text-muted-foreground">Data rotation</p><p className="text-sm font-bold">Re-share inactive leads (round-robin)</p></div>
              <button onClick={handleRotate} disabled={rotating} className="bg-lime-500 hover:bg-lime-400 text-zinc-950 font-bold rounded-xl transition-all shadow-sm text-xs px-3 py-1.5 [@media(pointer:coarse)]:min-h-[44px] flex items-center gap-1 disabled:opacity-50">{rotating ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />} Rotate</button>
            </div>
          </div>
        )}
      </Section>

      {/* ── 3. Team performance ── */}
      <Section id="sec-team" title="Team performance" hint="Activity by hour, today's ranking, delays and the weighted score" icon={Trophy}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><ActivityPerHourChart teamId={filterTeamId || undefined} agentId={filterAgentId || undefined} /></div>
          <div><DailyLeaderboard /></div>
        </div>
        <DelayList />
        <div ref={leaderboardRef} className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-24">
          <div className="lg:col-span-1"><DressCodeEvaluationForm /></div>
          <div className="lg:col-span-2"><WeightedLeaderboard /></div>
        </div>
        {data && (
          <div id="leaderboard-table" className="dash-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold flex items-center gap-2"><Trophy size={14} className="text-amber-500" /> Ranking — 40% valid calls · 30% attendance · 30% dress code</h3>
              <span className="text-xs text-muted-foreground">{data.leaderboard.length} ranked</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="text-start px-4 py-2">#</th><th className="text-start px-2 py-2">Employee</th><th className="text-center px-2 py-2"><Phone size={12} className="inline" /> Calls</th><th className="text-center px-2 py-2"><Clock size={12} className="inline" /> Attend</th><th className="text-center px-2 py-2"><Shirt size={12} className="inline" /> Dress</th><th className="text-center px-2 py-2 font-bold">Total</th><th className="text-end px-4 py-2"></th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.leaderboard.slice(0, 10).map((r: any) => (
                    <tr key={r.id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-2.5"><span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold ${r.rank === 1 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white' : r.rank === 2 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800' : r.rank === 3 ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white' : 'bg-muted text-muted-foreground'}`}>{r.rank}</span></td>
                      <td className="px-2 py-2"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">· {r.role}</span></td>
                      <td className="text-center tabular-nums">{r.scores.callScore}</td>
                      <td className="text-center tabular-nums">{r.scores.attendanceScore}</td>
                      <td className="text-center tabular-nums">{r.scores.dressScore}</td>
                      <td className="text-center font-extrabold text-primary tabular-nums">{r.totalScore}</td>
                      <td className="text-end px-4"><a href={`/admin/employees/${r.id}/360`} className="text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-1 text-xs">360 <ExternalLink size={12} /></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── 4. People & payroll ── */}
      <Section
        id="sec-people"
        title="People & payroll"
        hint="Deductions and alerts that need a decision"
        icon={Banknote}
        right={<a href="/admin?tab=payroll" className="text-xs font-semibold text-primary hover:underline">Open payroll →</a>}
      >
        {!data ? executiveSkeleton : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="dash-card p-4">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Banknote size={14} className="text-amber-600" /> Deductions ({data.deductions.pending} pending)</h3>
              {data.deductions.recent.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">No deductions this period.</p>
                : <div className="space-y-2 max-h-[260px] overflow-auto">
                  {data.deductions.recent.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs">
                      <div><p className="font-semibold text-red-700 dark:text-red-300">{d.reason}</p><p className="text-muted-foreground">{d.source_ref} · {d.month_year}</p></div>
                      <div className="text-end"><p className="font-bold">-{d.amount}</p><p className={d.is_applied ? 'text-emerald-600' : 'text-amber-600'}>{d.is_applied ? 'Applied' : 'Pending'}</p></div>
                    </div>
                  ))}
                </div>}
            </div>
            <div className="dash-card p-4">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Bell size={14} className="text-lime-700 dark:text-lime-400" /> Alerts ({data.notifications.unread} unread)</h3>
              {data.notifications.recent.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">No alerts.</p>
                : <div className="space-y-2 max-h-[260px] overflow-auto">
                  {data.notifications.recent.map((n: any) => (
                    <div key={n.id} className={`p-2.5 rounded-xl border text-xs ${n.is_read ? 'bg-muted border-border' : 'bg-lime-500/10 border-lime-500/30'}`}>
                      <p className="font-semibold">{n.title}</p><p className="text-muted-foreground line-clamp-2">{n.message}</p><p className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()} {n.is_read ? '· Read' : '· Unread'}</p>
                    </div>
                  ))}
                </div>}
            </div>
          </div>
        )}
      </Section>

      {/* ── 5. Pipeline: loaded only when opened ── */}
      <Section
        id="sec-pipeline"
        title="Leads pipeline"
        hint="Search any lead, switch between cards and a table, and see recent team activity"
        icon={List}
        right={
          <button onClick={() => setPipelineOpen((o) => !o)} aria-expanded={pipelineOpen} className="btn-secondary text-xs px-3 py-1.5 [@media(pointer:coarse)]:min-h-[44px]">
            {pipelineOpen ? 'Hide' : 'Show leads'}
          </button>
        }
      >
        {pipelineOpen && (
          <>
            <div className="dash-card p-3 flex flex-wrap gap-2 items-center justify-between">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={pipelineSearch} onChange={(e) => setPipelineSearch(e.target.value)} placeholder="Search leads..." className="input-base ps-8 h-9 text-sm w-full" />
              </div>
              <div className="flex bg-muted rounded-lg p-1">
                <button onClick={() => setPipelineView('kanban')} aria-pressed={pipelineView === 'kanban'} className={`px-3 py-1 [@media(pointer:coarse)]:min-h-[44px] rounded-full text-xs font-medium inline-flex items-center gap-1 transition-colors ${pipelineView === 'kanban' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid size={12} /> Cards</button>
                <button onClick={() => setPipelineView('table')} aria-pressed={pipelineView === 'table'} className={`px-3 py-1 [@media(pointer:coarse)]:min-h-[44px] rounded-full text-xs font-medium inline-flex items-center gap-1 transition-colors ${pipelineView === 'table' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><List size={12} /> Table</button>
              </div>
            </div>
            <div className="dash-card overflow-hidden">
              {pipelineLoading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-lime-700 dark:text-lime-400" /></div>
                : filteredLeads.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No leads {pipelineSearch ? `matching "${pipelineSearch}"` : ''}. <button onClick={() => setPipelineSearch('')} className="text-lime-700 dark:text-lime-400 underline">Clear search</button></div>
                  : pipelineView === 'table' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-500/10 text-xs text-muted-foreground"><tr><th className="text-start px-4 py-2">Lead</th><th className="text-start px-2 py-2">Phone</th><th className="text-center px-2 py-2">Stage</th><th className="text-center px-2 py-2">Assigned</th><th className="text-end px-4 py-2"></th></tr></thead>
                        <tbody className="divide-y divide-border">
                          {filteredLeads.slice(0, 50).map((l: any) => (
                            <tr key={l.id} className="hover:bg-zinc-500/10">
                              <td className="px-4 py-2"><a href={`/leads/${l.id}`} className="font-medium text-lime-700 dark:text-lime-400 hover:underline">{l.name || 'Lead'}</a><span className="ms-2 text-xs text-muted-foreground">{l.source || ''}</span></td>
                              <td className="px-2 py-2 font-mono text-xs">{l.phone || '—'}</td>
                              <td className="text-center"><span className="text-xs bg-muted px-2 py-0.5 rounded-full">{l.crm_status || l.lead_status || '—'}</span></td>
                              <td className="text-center text-xs">{l.assigned_to_profile?.full_name || l.assigned_to || 'Unassigned'}</td>
                              <td className="text-end px-4"><a href={`/leads/${l.id}`} className="text-xs text-lime-700 dark:text-lime-400 hover:underline">Profile →</a></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                      {filteredLeads.slice(0, 24).map((l: any) => (
                        <a key={l.id} href={`/leads/${l.id}`} className="block bg-card border border-border rounded-xl p-3 hover:border-lime-400 dark:hover:border-lime-500/40 transition-all">
                          <p className="font-semibold text-sm truncate">{l.name || 'Lead'}</p>
                          <p className="text-xs text-muted-foreground">{l.phone} · {l.source || '—'}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs bg-lime-50 dark:bg-lime-500/10 border border-lime-200 dark:border-lime-500/20 text-lime-700 dark:text-lime-400 px-2 py-0.5 rounded-full">{l.crm_status || l.lead_status}</span>
                            <span className="text-xs text-muted-foreground">{l.assigned_to ? 'Assigned' : 'Unassigned'}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
            </div>
            {data && (
              <div className="dash-card p-4">
                <h3 className="text-sm font-bold mb-3">Recent activity</h3>
                <div className="space-y-1 max-h-[200px] overflow-auto">
                  {data.timeline.slice(0, 12).map((t: any, i: number) => (
                    <div key={i} className="flex gap-2 text-xs py-1 border-b border-zinc-500/20 last:border-0"><span className="text-muted-foreground font-mono whitespace-nowrap">{String(t.createdAt).slice(0, 16).replace('T', ' ')}</span><span className="font-medium truncate">{t.employee}: {t.action}</span></div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

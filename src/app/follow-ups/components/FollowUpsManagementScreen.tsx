'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  AlertCircle,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock,
  LayoutList,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { isAdminRole } from '@/lib/roles';
import { useAuth } from '@/contexts/AuthContext';
import { useFollowUpSync } from '@/hooks/useFollowUpSync';
import { followUpsService } from '@/lib/services/crmService';
import FollowUpForm from './FollowUpForm';
import FollowUpCockpit from './FollowUpCockpit';
import { ALL_FOLLOW_UP_TYPES, type FollowUp, type FollowUpPriority, type FollowUpType } from './mockFollowUps';
import {
  addDays,
  cairoToday,
  completeFollowUp,
  deleteFollowUp,
  isOpen,
  reopenFollowUp,
  rescheduleFollowUp,
  runMany,
  saveFollowUp,
} from './followUpOps';

/* ───────────────────────────────────────────────────────────────────────────
   Follow-ups page.
   - One data source (GET /api/follow-ups: only live follow-ups + history), refreshed silently in the background.
   - Tabs split by time (Overdue / Today / Upcoming / All open / Done); filters apply first so every count matches.
   - Two views of the same list: Queue (action cockpit, ordered by momentum) and Table (dense, bulk triage).
   - All writes go through followUpOps, which keeps the lead's follow-up date and the follow-up row in sync.
   ─────────────────────────────────────────────────────────────────────────── */

type Tab = 'overdue' | 'today' | 'upcoming' | 'open' | 'done';
type View = 'queue' | 'table';
type Sort = 'due-asc' | 'due-desc' | 'priority';

interface Filters {
  q: string;
  agent: string;
  stage: string;
  priority: FollowUpPriority | '';
  type: FollowUpType | '';
  from: string;
  to: string;
  sort: Sort;
}

const EMPTY: Filters = { q: '', agent: '', stage: '', priority: '', type: '', from: '', to: '', sort: 'due-asc' };
const TABS: Tab[] = ['overdue', 'today', 'upcoming', 'open', 'done'];
const TAB_LABEL: Record<Tab, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  open: 'All open',
  done: 'Done',
};
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const PAGE = 100;

const day = (s?: string | null) => (s || '').slice(0, 10);

function fmtDate(d: string) {
  if (!d) return '—';
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(t?: string | null) {
  if (!t || !t.includes(':')) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function readUrl(): { tab: Tab; view: View; filters: Filters; openNew: boolean } {
  const out = { tab: 'overdue' as Tab, view: 'queue' as View, filters: { ...EMPTY }, openNew: false };
  if (typeof window === 'undefined') return out;
  const p = new URLSearchParams(window.location.search);
  const tab = p.get('tab');
  // Older links used ?tab=all / ?tab=completed.
  if (tab === 'all') out.tab = 'open';
  else if (tab === 'completed') out.tab = 'done';
  else if (TABS.includes(tab as Tab)) out.tab = tab as Tab;
  if (p.get('view') === 'table') out.view = 'table';
  out.filters.q = p.get('q') || '';
  out.filters.agent = p.get('agent') || '';
  out.filters.stage = p.get('stage') || '';
  out.openNew = p.get('new') === '1';
  return out;
}

export default function FollowUpsManagementScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const isAdmin = isAdminRole((profile as any)?.role);

  const initial = useRef(readUrl());
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initial.current.tab);
  const [view, setView] = useState<View>(initial.current.view);
  const [filters, setFilters] = useState<Filters>(initial.current.filters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [addOpen, setAddOpen] = useState(initial.current.openNew);
  const [editTarget, setEditTarget] = useState<FollowUp | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<FollowUp[] | null>(null);
  const loadedOnce = useRef(false);

  // First load shows a loader; later refreshes (focus, other tabs' changes, after an action) keep the page in place.
  const load = useCallback(async () => {
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    try {
      const data = (await followUpsService.getAll()) as FollowUp[];
      setItems(data || []);
      setError(null);
      loadedOnce.current = true;
    } catch (e: any) {
      const msg = e?.message || 'Could not load follow-ups. Check your connection and retry.';
      if (!loadedOnce.current) setError(msg);
      else toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useFollowUpSync(load);

  // Keep tab / view / main filters in the address bar (shareable, survives reload). Drop the one-shot ?new=1.
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (k: string, v: string, def = '') => (v && v !== def ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set('tab', tab, 'overdue');
    set('view', view, 'queue');
    set('q', filters.q);
    set('agent', filters.agent);
    set('stage', filters.stage);
    url.searchParams.delete('new');
    window.history.replaceState({}, '', url.toString());
  }, [tab, view, filters.q, filters.agent, filters.stage]);

  useEffect(() => {
    setSelected(new Set());
    setLimit(PAGE);
  }, [tab, view, filters]);

  const today = cairoToday();

  // 1) filters (counts are computed after this, so they always match what you see)
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return items.filter((f) => {
      if (
        q &&
        ![f.contactName, f.contactPhone, f.leadPhone, f.title, f.propertyInterest, f.agent, f.leadStatus, f.notes]
          .some((v) => (v || '').toLowerCase().includes(q))
      )
        return false;
      if (filters.agent && (f.agent || '') !== filters.agent) return false;
      if (filters.stage && (f.leadStatus || '') !== filters.stage) return false;
      if (filters.priority && f.priority !== filters.priority) return false;
      if (filters.type && f.type !== filters.type) return false;
      const d = day(f.dueDate);
      if (filters.from && (!d || d < filters.from)) return false;
      if (filters.to && (!d || d > filters.to)) return false;
      return true;
    });
  }, [items, filters]);

  const inTab = useCallback(
    (f: FollowUp, t: Tab) => {
      const d = day(f.dueDate);
      if (t === 'done') return f.status === 'Completed';
      if (!isOpen(f)) return false;
      if (t === 'overdue') return !!d && d < today;
      if (t === 'today') return d === today;
      if (t === 'upcoming') return !!d && d > today;
      return true; // open
    },
    [today]
  );

  // 2) tab counts
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { overdue: 0, today: 0, upcoming: 0, open: 0, done: 0 };
    for (const f of filtered) for (const t of TABS) if (inTab(f, t)) c[t]++;
    return c;
  }, [filtered, inTab]);

  // 3) the tab's rows, sorted
  const rows = useMemo(() => {
    const r = filtered.filter((f) => inTab(f, tab));
    const byDue = (a: FollowUp, b: FollowUp) =>
      `${day(a.dueDate)} ${a.dueTime || ''}`.localeCompare(`${day(b.dueDate)} ${b.dueTime || ''}`);
    if (tab === 'done') return r.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '') || byDue(b, a));
    if (filters.sort === 'due-desc') return r.sort((a, b) => byDue(b, a));
    if (filters.sort === 'priority') return r.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || byDue(a, b));
    return r.sort(byDue);
  }, [filtered, inTab, tab, filters.sort]);

  const agentOptions = useMemo(() => Array.from(new Set(items.map((f) => f.agent).filter(Boolean) as string[])).sort(), [items]);
  const stageOptions = useMemo(() => Array.from(new Set(items.map((f) => f.leadStatus).filter(Boolean) as string[])).sort(), [items]);
  const activeFilters = [filters.agent, filters.stage, filters.priority, filters.type, filters.from, filters.to].filter(Boolean).length;

  const openLead = (leadId: string) => router.push(`/leads-management?lead=${leadId}`);

  /* ── actions ─────────────────────────────────────────────────────────── */
  const act = async (label: string, list: FollowUp[], op: (fu: FollowUp) => Promise<void>) => {
    if (!list.length || busy) return;
    setBusy(true);
    try {
      const { ok, failed } = await runMany(list, op);
      if (ok) toast.success(list.length === 1 ? label : `${label}: ${ok}${failed ? ` (${failed} failed)` : ''}`);
      if (!ok && failed) toast.error('Nothing was changed. Check your permission or connection.');
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (fu: FollowUp) => {
    try {
      await saveFollowUp(fu, { existingId: editTarget?.id, userId: user?.id || '' });
      toast.success(editTarget ? 'Follow-up updated' : 'Follow-up scheduled');
      setAddOpen(false);
      setEditTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the follow-up');
    }
  };

  const handleRepair = async () => {
    if (repairing) return;
    setRepairing(true);
    try {
      const res = await fetch('/api/follow-ups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allMissing: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Repair failed');
      toast.success(`Repaired: ${j.created || 0} created, ${j.updated || 0} updated, ${j.cancelled || 0} cancelled`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Repair failed');
    } finally {
      setRepairing(false);
    }
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ── render ──────────────────────────────────────────────────────────── */
  const kpis: { tab: Tab; label: string; icon: React.ReactNode; tone: string }[] = [
    { tab: 'overdue', label: 'Overdue', icon: <AlertCircle size={17} />, tone: 'text-red-500 bg-red-500/10' },
    { tab: 'today', label: 'Due today', icon: <Clock size={17} />, tone: 'text-amber-600 bg-amber-500/10' },
    { tab: 'upcoming', label: 'Upcoming', icon: <CalendarDays size={17} />, tone: 'text-sky-600 bg-sky-500/10' },
    { tab: 'done', label: 'Done', icon: <CheckCircle2 size={17} />, tone: 'text-emerald-600 bg-emerald-500/10' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {counts.overdue + counts.today} need action today · {fmtDate(today)}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing || loading}
            title="Refresh"
            aria-label="Refresh"
            className="btn-secondary flex h-9 w-9 items-center justify-center !p-0 disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={handleRepair}
              disabled={repairing}
              title="Rebuild missing reminders for leads that have a follow-up date"
              className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {repairing ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />}
              <span className="hidden sm:inline">Repair</span>
            </button>
          )}
          <button type="button" onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} /> Schedule
          </button>
        </div>
      </div>

      {/* KPI cards = shortcuts to the tabs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.tab}
            type="button"
            onClick={() => setTab(k.tab)}
            aria-pressed={tab === k.tab}
            className={`card-base !p-4 flex items-center gap-3 text-start transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === k.tab ? 'border-primary ring-1 ring-primary/30' : ''
            }`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.tone}`}>{k.icon}</span>
            <span>
              <span className="block text-xl font-bold tabular-nums text-foreground">{loading ? '—' : counts[k.tab]}</span>
              <span className="block text-xs text-muted-foreground">{k.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Tabs + view switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div className="-mb-px flex overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {TAB_LABEL[t]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  tab === t ? 'bg-primary text-primary-foreground' : t === 'overdue' && counts.overdue ? 'bg-red-500/15 text-red-600' : 'bg-muted text-muted-foreground'
                }`}
              >
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
        {tab !== 'done' && (
          <div className="mb-2 inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="View">
            {(
              [
                ['queue', 'Queue', <Sparkles key="q" size={13} />],
                ['table', 'Table', <LayoutList key="t" size={13} />],
              ] as [View, string, React.ReactNode][]
            ).map(([v, label, icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card-base !p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <div className="relative col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input-base pl-8"
              placeholder="Name, phone, project, note…"
              value={filters.q}
              onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
              aria-label="Search follow-ups"
            />
          </div>
          <select className="input-base" value={filters.agent} onChange={(e) => setFilters((p) => ({ ...p, agent: e.target.value }))} aria-label="Agent">
            <option value="">All agents</option>
            {agentOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className="input-base" value={filters.stage} onChange={(e) => setFilters((p) => ({ ...p, stage: e.target.value }))} aria-label="Lead stage">
            <option value="">All stages</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="input-base"
            value={filters.priority}
            onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value as Filters['priority'] }))}
            aria-label="Priority"
          >
            <option value="">All priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            className="input-base"
            value={filters.type}
            onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value as Filters['type'] }))}
            aria-label="Type"
          >
            <option value="">All types</option>
            {ALL_FOLLOW_UP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input-base"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
            aria-label="Due from"
            title="Due from"
          />
          <input
            type="date"
            className="input-base"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
            aria-label="Due to"
            title="Due to"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {rows.length} {TAB_LABEL[tab].toLowerCase()}
            {refreshing && ' · updating…'}
          </span>
          {tab !== 'done' && view === 'table' && (
            <select
              className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
              value={filters.sort}
              onChange={(e) => setFilters((p) => ({ ...p, sort: e.target.value as Sort }))}
              aria-label="Sort"
            >
              <option value="due-asc">Due soonest</option>
              <option value="due-desc">Due latest</option>
              <option value="priority">Priority</option>
            </select>
          )}
          {(activeFilters > 0 || filters.q) && (
            <button
              type="button"
              onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}
              className="ms-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <X size={12} /> Clear filters{activeFilters ? ` (${activeFilters})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base h-24 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="card-base flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={40} className="mb-3 text-red-400" />
          <p className="text-base font-semibold text-foreground">Could not load follow-ups</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p>
          <button type="button" onClick={() => void load()} className="btn-secondary mt-4 flex items-center gap-1.5 text-sm">
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : view === 'queue' && tab !== 'done' ? (
        <FollowUpCockpit items={rows} onChanged={load} onOpenLead={openLead} onEdit={(fu) => setEditTarget(fu)} />
      ) : (
        <>
          {/* Bulk bar */}
          {selectedRows.length > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
              <span className="text-sm font-semibold tabular-nums">{selectedRows.length} selected</span>
              <span className="mx-1 h-4 w-px bg-border" />
              {tab === 'done' ? (
                <button disabled={busy} onClick={() => act('Reopened', selectedRows, reopenFollowUp)} className="btn-secondary !py-1.5 text-xs">
                  Reopen
                </button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => act('Done', selectedRows, completeFollowUp)} className="btn-primary !py-1.5 text-xs">
                    Mark done
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act('Moved to tomorrow', selectedRows, (fu) => rescheduleFollowUp(fu, addDays(today, 1), fu.dueTime || '10:00'))}
                    className="btn-secondary !py-1.5 text-xs"
                  >
                    Tomorrow
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act('Moved +3 days', selectedRows, (fu) => rescheduleFollowUp(fu, addDays(today, 3), fu.dueTime || '10:00'))}
                    className="btn-secondary !py-1.5 text-xs"
                  >
                    +3 days
                  </button>
                </>
              )}
              <button disabled={busy} onClick={() => setDeleteTargets(selectedRows)} className="btn-secondary !py-1.5 text-xs text-red-600">
                Delete
              </button>
              <button onClick={() => setSelected(new Set())} className="ms-auto text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="card-base flex flex-col items-center justify-center py-16 text-center">
              <CheckCheck size={40} className="mb-3 text-emerald-500 opacity-70" />
              <p className="text-base font-semibold text-foreground">Nothing here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeFilters || filters.q ? 'No follow-up matches these filters.' : `No ${TAB_LABEL[tab].toLowerCase()} follow-ups.`}
              </p>
            </div>
          ) : (
            <div className="card-base overflow-hidden !p-0">
              {/* header (desktop) */}
              <div className="hidden grid-cols-[28px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,2fr)_150px] items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={selectedRows.length > 0 && selectedRows.length === Math.min(rows.length, limit)}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.slice(0, limit).map((r) => r.id)) : new Set())}
                />
                <span>Customer</span>
                <span>Stage</span>
                <span>Agent</span>
                <span>Due</span>
                <span>Notes</span>
                <span className="text-end">Actions</span>
              </div>
              <ul className="divide-y divide-border">
                {rows.slice(0, limit).map((fu) => (
                  <Row
                    key={fu.id}
                    fu={fu}
                    today={today}
                    checked={selected.has(fu.id)}
                    busy={busy}
                    onCheck={() => toggle(fu.id)}
                    onOpenLead={openLead}
                    onDone={() => act('Done', [fu], completeFollowUp)}
                    onReopen={() => act('Reopened', [fu], reopenFollowUp)}
                    onTomorrow={() => act('Moved to tomorrow', [fu], (x) => rescheduleFollowUp(x, addDays(today, 1), x.dueTime || '10:00'))}
                    onEdit={() => setEditTarget(fu)}
                    onDelete={() => setDeleteTargets([fu])}
                  />
                ))}
              </ul>
              {rows.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="w-full border-t border-border py-2.5 text-sm font-semibold text-primary hover:bg-muted/50"
                >
                  Show more ({rows.length - limit} left)
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Add / edit */}
      <Modal
        open={addOpen || !!editTarget}
        onClose={() => {
          setAddOpen(false);
          setEditTarget(null);
        }}
        title={editTarget ? 'Edit follow-up' : 'Schedule follow-up'}
        size="lg"
      >
        {(addOpen || editTarget) && (
          <FollowUpForm
            key={editTarget?.id || 'new'}
            initial={editTarget || undefined}
            onSubmit={handleSave}
            onCancel={() => {
              setAddOpen(false);
              setEditTarget(null);
            }}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleteTargets} onClose={() => setDeleteTargets(null)} title="Delete follow-up" size="sm">
        <div className="space-y-4 p-6">
          <p className="text-sm text-foreground">
            {deleteTargets?.length === 1 ? (
              <>
                Delete the follow-up for <b>{deleteTargets[0].contactName}</b>? The lead itself is kept; only its follow-up date is removed.
              </>
            ) : (
              <>
                Delete <b>{deleteTargets?.length}</b> follow-ups? The leads are kept; only their follow-up dates are removed.
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTargets(null)} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const list = deleteTargets || [];
                setDeleteTargets(null);
                await act('Deleted', list, deleteFollowUp);
              }}
              className="btn-danger text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Table row (a card on small screens) ───────────────────────────────── */
function Row({
  fu,
  today,
  checked,
  busy,
  onCheck,
  onOpenLead,
  onDone,
  onReopen,
  onTomorrow,
  onEdit,
  onDelete,
}: {
  fu: FollowUp;
  today: string;
  checked: boolean;
  busy: boolean;
  onCheck: () => void;
  onOpenLead: (id: string) => void;
  onDone: () => void;
  onReopen: () => void;
  onTomorrow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const d = day(fu.dueDate);
  const open = isOpen(fu);
  const late = open && !!d && d < today;
  const lateDays = late ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : 0;
  const phone = fu.leadPhone || fu.contactPhone || '';
  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40';

  return (
    <li
      className={`grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-3 py-3 lg:grid-cols-[28px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,2fr)_150px] lg:items-center ${
        checked ? 'bg-primary/5' : 'hover:bg-muted/40'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${fu.contactName}`} className="mt-1 lg:mt-0" />

      <div className="min-w-0">
        {fu.leadId ? (
          <button type="button" onClick={() => onOpenLead(fu.leadId!)} className="block max-w-full truncate text-sm font-semibold text-foreground hover:text-primary hover:underline">
            {fu.contactName || 'Lead'}
          </button>
        ) : (
          <span className="block truncate text-sm font-semibold text-foreground">{fu.contactName || '—'}</span>
        )}
        <span className="block truncate text-xs text-muted-foreground">
          {phone ? (
            <a href={`tel:${phone}`} className="hover:text-primary">
              {phone}
            </a>
          ) : (
            '—'
          )}
          {fu.propertyInterest ? ` · ${fu.propertyInterest}` : ''}
        </span>
      </div>

      {/* on mobile the remaining cells flow under the name */}
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 lg:col-start-auto">
        {fu.leadStatus ? (
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">{fu.leadStatus}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {fu.priority === 'High' && <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">High</span>}
      </div>

      <div className="col-start-2 truncate text-xs text-muted-foreground lg:col-start-auto lg:text-sm lg:text-foreground">{fu.agent || '—'}</div>

      <div className={`col-start-2 text-xs lg:col-start-auto ${late ? 'font-semibold text-red-500' : 'text-foreground'}`}>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} />
          {fmtDate(d)} {fmtTime(fu.dueTime)}
        </span>
        {late && <span className="ms-1 rounded bg-red-500/10 px-1 text-[10px]">{lateDays}d late</span>}
        {fu.status === 'Completed' && <span className="ms-1 rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-600">done</span>}
      </div>

      <p className="col-start-2 line-clamp-2 text-xs text-muted-foreground lg:col-start-auto" title={fu.notes || ''}>
        {fu.notes || '—'}
      </p>

      <div className="col-start-2 flex items-center gap-0.5 lg:col-start-auto lg:justify-end">
        {open ? (
          <>
            <button type="button" disabled={busy} onClick={onDone} title="Mark done" aria-label="Mark done" className={`${iconBtn} text-emerald-600 hover:bg-emerald-500/10`}>
              <CheckCheck size={15} />
            </button>
            <button type="button" disabled={busy} onClick={onTomorrow} title="Move to tomorrow" aria-label="Move to tomorrow" className={`${iconBtn} text-muted-foreground hover:bg-muted hover:text-foreground`}>
              <AlarmClock size={15} />
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={onReopen} title="Reopen" aria-label="Reopen" className={`${iconBtn} text-muted-foreground hover:bg-muted hover:text-foreground`}>
            <RotateCcw size={15} />
          </button>
        )}
        <button type="button" onClick={onEdit} title="Edit" aria-label="Edit" className={`${iconBtn} text-muted-foreground hover:bg-muted hover:text-foreground`}>
          <Pencil size={14} />
        </button>
        <button type="button" disabled={busy} onClick={onDelete} title="Delete" aria-label="Delete" className={`${iconBtn} text-muted-foreground hover:bg-red-500/10 hover:text-red-500`}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

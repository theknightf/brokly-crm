'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Circle, Filter, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { followUpsService } from '@/lib/services/crmService';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { followUpStatusClass } from '@/lib/ui';

type DateFilter = 'any' | 'late' | 'today' | 'tomorrow' | 'custom';
type StatusFilter = 'any' | 'notCompleted' | 'completed';
type PriorityFilter = 'any' | 'High' | 'Medium' | 'Low';

interface Filters {
  agent: string;
  status: StatusFilter;
  priority: PriorityFilter;
  date: DateFilter;
  from: string;
  to: string;
}

interface FollowUp {
  id: string;
  contactName: string;
  title: string;
  contactPhone?: string;
  propertyInterest?: string;
  status: string;
  priority: string;
  dueDate: string;
  dueTime?: string;
}

const DEFAULT_FILTERS: Filters = {
  agent: '',
  status: 'any',
  priority: 'any',
  date: 'any',
  from: '',
  to: '',
};

const TABS: { key: string; labelKey: string; preset: Filters }[] = [
  { key: 'all', labelKey: 'workspace.all', preset: { ...DEFAULT_FILTERS } },
  {
    key: 'today',
    labelKey: 'workspace.today',
    preset: { agent: '', status: 'notCompleted', priority: 'any', date: 'today', from: '', to: '' },
  },
  {
    key: 'late',
    labelKey: 'workspace.late',
    preset: { agent: '', status: 'notCompleted', priority: 'any', date: 'late', from: '', to: '' },
  },
  {
    key: 'tomorrow',
    labelKey: 'workspace.tomorrow',
    preset: {
      agent: '',
      status: 'notCompleted',
      priority: 'any',
      date: 'tomorrow',
      from: '',
      to: '',
    },
  },
  {
    key: 'uncompleted',
    labelKey: 'workspace.uncompleted',
    preset: { agent: '', status: 'notCompleted', priority: 'any', date: 'any', from: '', to: '' },
  },
];

const todayStr = () => new Date().toISOString().split('T')[0];

function dueMeta(due: string): { label: string; cls: string } {
  const today = todayStr();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (due < today) return { label: `Overdue · ${due}`, cls: 'bg-red-100 text-red-600' };
  if (due === today) return { label: 'Due today', cls: 'bg-amber-100 text-amber-700' };
  if (due === tomorrow) return { label: 'Due tomorrow', cls: 'bg-blue-100 text-blue-700' };
  return { label: due, cls: 'bg-muted text-muted-foreground' };
}

export default function WorkspaceScreen() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const isSales =
    profile?.role === 'agent' || profile?.role === 'senior_agent' || profile?.role === 'telecaller';
  // Sales users jump straight to "Today" — their daily work list.
  const defaultTab = isSales ? 'today' : 'all';
  const [filters, setFilters] = useState<Filters>(isSales ? TABS[1].preset : DEFAULT_FILTERS);
  const [draft, setDraft] = useState<Filters>(filters);
  const [tab, setTab] = useState(defaultTab);
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState<FollowUp[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchList = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const all = await followUpsService.getAll();
      const today = todayStr();
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const done = new Set(['Completed', 'Cancelled']);
      let list = all;

      if (f.status === 'notCompleted') list = list.filter((x) => !done.has(x.status));
      else if (f.status === 'completed') list = list.filter((x) => x.status === 'Completed');

      if (f.priority !== 'any') list = list.filter((x) => x.priority === f.priority);

      if (f.agent) list = list.filter((x) => (x.agent || '') === f.agent);

      if (f.date === 'late') list = list.filter((x) => x.dueDate < today);
      else if (f.date === 'today') list = list.filter((x) => x.dueDate === today);
      else if (f.date === 'tomorrow') list = list.filter((x) => x.dueDate === tomorrow);
      else if (f.date === 'custom') {
        if (f.from) list = list.filter((x) => x.dueDate >= f.from);
        if (f.to) list = list.filter((x) => x.dueDate <= f.to);
      }

      setAgents(
        Array.from(new Set(all.map((x) => (x.agent || '').trim()).filter(Boolean))).sort((a, b) =>
          a.localeCompare(b)
        )
      );

      list = [...list].sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
      setItems(
        list.map((x) => ({
          id: x.id,
          contactName: x.contactName,
          title: x.title,
          contactPhone: x.contactPhone,
          propertyInterest: x.propertyInterest,
          status: x.status,
          priority: x.priority,
          dueDate: x.dueDate,
          dueTime: x.dueTime,
        }))
      );
    } catch {
      setItems([]);
      toast.error('Could not load follow-ups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList(filters);
  }, [fetchList, filters]);

  // Keep the workspace live: refresh instantly on follow-up changes via
  // Supabase Realtime, with a 30s polling fallback when the publication is off.
  useEffect(() => {
    const client = createClient();
    let channel: ReturnType<typeof client.channel> | null = null;
    try {
      channel = client
        .channel('workspace-followups')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'follow_ups' }, () =>
          fetchList(filters)
        )
        .subscribe();
    } catch {
      // realtime unavailable — polling covers updates
    }
    const poll = setInterval(() => fetchList(filters), 30000);
    return () => {
      clearInterval(poll);
      if (channel) client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchList]);

  const applyTab = (key: string, preset: Filters) => {
    setTab(key);
    setFilters(preset);
    setDraft(preset);
  };

  const applyPanel = () => {
    setPanelOpen(false);
    setTab('custom');
    setFilters({ ...draft });
  };

  const resetAll = () => {
    setPanelOpen(false);
    applyTab('all', DEFAULT_FILTERS);
  };

  const toggleDone = async (item: FollowUp) => {
    if (toggling) return;
    setToggling(item.id);
    try {
      const done = item.status === 'Completed';
      await followUpsService.updateStatus(
        item.id,
        done ? 'Pending' : 'Completed',
        done ? undefined : new Date().toISOString()
      );
      toast.success(done ? 'Marked as pending' : 'Marked as completed');
      await fetchList(filters);
    } catch {
      toast.error('Could not update follow-up');
    } finally {
      setToggling(null);
    }
  };

  const CompletionIndicator = ({ item }: { item: FollowUp }) => {
    const done = item.status === 'Completed';
    const cancelled = item.status === 'Cancelled';
    return (
      <button
        onClick={() => toggleDone(item)}
        disabled={cancelled || toggling === item.id}
        className={`flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-90 disabled:opacity-50 ${
          done
            ? 'text-emerald-600'
            : cancelled
              ? 'text-muted-foreground/50'
              : 'text-muted-foreground'
        }`}
        title={done ? 'Mark as not done' : 'Mark as completed'}
      >
        {toggling === item.id ? (
          <Loader2 size={16} className="animate-spin" />
        ) : done ? (
          <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
            <Check size={14} />
          </span>
        ) : cancelled ? (
          <XCircle size={20} />
        ) : (
          <Circle size={20} />
        )}
        <span>
          {done ? t('common.done') : cancelled ? t('common.cancelled') : t('common.toDo')}
        </span>
      </button>
    );
  };

  const statusColor = (status: string) => followUpStatusClass(status);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto py-1 -my-1">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => applyTab(tabItem.key, tabItem.preset)}
              className={`shrink-0 px-3.5 h-10 rounded-xl text-xs font-semibold transition-colors active:scale-95 ${
                tab === tabItem.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground'
              }`}
            >
              {t(tabItem.labelKey)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center transition-colors active:scale-95 ${
            tab === 'custom'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground border-border'
          }`}
          aria-label={t('common.filter')}
          title={t('common.filter')}
        >
          <Filter size={18} />
        </button>
      </div>

      {/* Result meta */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {loading ? t('common.loading') : t('workspace.count', { count: items.length })}
        </p>
        <button
          onClick={() => fetchList(filters)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary px-2 py-1.5 rounded-lg active:scale-95 transition-all"
        >
          <RefreshCw size={13} />
          {t('common.refresh')}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center rounded-2xl border border-border bg-card">
          <CalendarClock size={22} className="text-muted-foreground mb-2" />
          <p className="text-sm font-semibold text-foreground">{t('common.nothingHere')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('workspace.noResults')}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-mobile">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="table-th">{t('workspace.name')}</th>
                  <th className="table-th">{t('workspace.dueDate')}</th>
                  <th className="table-th">{t('workspace.status')}</th>
                  <th className="table-th">{t('workspace.priority')}</th>
                  <th className="table-th">{t('workspace.doneCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const due = dueMeta(item.dueDate);
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="table-td">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {item.contactName || item.title || 'Unnamed'}
                          </p>
                          {item.propertyInterest && (
                            <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                              {item.propertyInterest}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="table-td">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold ${due.cls}`}
                        >
                          <CalendarClock size={11} />
                          {due.label}
                          {item.dueTime ? ` · ${item.dueTime}` : ''}
                        </span>
                      </td>
                      <td className="table-td">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${statusColor(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="table-td">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${
                            item.priority === 'High'
                              ? 'bg-red-50 text-red-600'
                              : item.priority === 'Medium'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="table-td">
                        <CompletionIndicator item={item} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter panel */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg bg-card rounded-t-2xl p-4 pb-safe shadow-2xl slide-up-enter">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">
                {t('workspace.filterTitle')}
              </h3>
              <button
                onClick={() => setPanelOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform"
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <FilterGroup
                label={t('workspace.dueFilter')}
                options={[
                  { value: 'any', label: t('workspace.dueAny') },
                  { value: 'late', label: t('workspace.dueLate') },
                  { value: 'today', label: t('common.dueToday') },
                  { value: 'tomorrow', label: t('common.dueTomorrow') },
                ]}
                value={draft.date === 'custom' ? 'custom' : draft.date}
                onChange={(v) => setDraft((d) => ({ ...d, date: v as DateFilter }))}
              />
              {draft.date === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    From
                    <input
                      type="date"
                      value={draft.from}
                      onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                      className="input-base"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    To
                    <input
                      type="date"
                      value={draft.to}
                      onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                      className="input-base"
                    />
                  </label>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {t('workspace.agentFilter')}
                </p>
                <select
                  value={draft.agent}
                  onChange={(e) => setDraft((d) => ({ ...d, agent: e.target.value }))}
                  className="input-base w-full appearance-none pr-8"
                >
                  <option value="">{t('workspace.dueAny')}</option>
                  {agents.map((a) => (
                    <option key={`ws-agent-${a}`} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <FilterGroup
                label={t('workspace.statusFilter')}
                options={[
                  { value: 'any', label: t('workspace.dueAny') },
                  { value: 'notCompleted', label: t('workspace.statusNotCompleted') },
                  { value: 'completed', label: t('workspace.statusCompleted') },
                ]}
                value={draft.status}
                onChange={(v) => setDraft((d) => ({ ...d, status: v as StatusFilter }))}
              />
              <FilterGroup
                label={t('workspace.priority')}
                options={[
                  { value: 'any', label: t('workspace.priorityAny') },
                  { value: 'High', label: 'High' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'Low', label: 'Low' },
                ]}
                value={draft.priority}
                onChange={(v) => setDraft((d) => ({ ...d, priority: v as PriorityFilter }))}
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 mt-5">
              <button
                onClick={resetAll}
                className="h-12 rounded-xl border border-border text-muted-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
              >
                {t('common.reset')}
              </button>
              <button
                onClick={applyPanel}
                className="h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold px-6 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Check size={16} />
                {t('common.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3.5 h-9 rounded-xl text-xs font-semibold transition-colors active:scale-95 ${
              value === o.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

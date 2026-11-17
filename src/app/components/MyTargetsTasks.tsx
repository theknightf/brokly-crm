'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CalendarDays,
  Check,
  Circle,
  ClipboardList,
  Flag,
  Loader2,
  Target,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { kpiTargetsService, tasksService, type KpiProgress, type TaskItem } from '@/lib/services/peopleOpsService';

const METRIC_UNIT: Record<string, string> = {
  daily_calls: 'calls',
  daily_followups: 'follow-ups',
  daily_meetings: 'meetings',
  leads_worked: 'leads',
  deals: 'deals',
  revenue: 'EGP',
};

function pctColor(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

function dueMeta(due: string | null): { label: string; cls: string } {
  if (!due) return { label: 'No due date', cls: 'bg-muted text-muted-foreground' };
  const today = new Date().toISOString().split('T')[0];
  if (due < today) return { label: `Overdue · ${due}`, cls: 'bg-red-100 text-red-600' };
  if (due === today) return { label: `Due today · ${due}`, cls: 'bg-amber-100 text-amber-700' };
  return { label: due, cls: 'bg-muted text-muted-foreground' };
}

const PRIORITY_CLS: Record<string, string> = {
  High: 'bg-red-50 text-red-600',
  Medium: 'bg-amber-50 text-amber-700',
  Low: 'bg-muted text-muted-foreground',
};

export default function MyTargetsTasks({ variant = 'default' }: { variant?: 'default' | 'agent' } = {}) {
  // variant="agent": stacked (it sits inside the Today column), i18n copy. Default is unchanged.
  const agent = variant === 'agent';
  const { t: tr } = useLanguage();
  const L = (key: string, fallback: string, vars?: Record<string, string | number>) => (agent ? tr(key, vars) : fallback);
  const { profile } = useAuth();
  const [kpis, setKpis] = useState<KpiProgress[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || !profile?.role) return;
    setLoading(true);
    try {
      const [k, t] = await Promise.all([
        kpiTargetsService.getMyProgress(profile.id, profile.role),
        tasksService.getForUser(profile.id, profile.role),
      ]);
      setKpis(k);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role]);

  const refresh = useCallback(async () => {
    if (!profile?.id || !profile?.role) return;
    try {
      const [k, t] = await Promise.all([
        kpiTargetsService.getMyProgress(profile.id, profile.role),
        tasksService.getForUser(profile.id, profile.role),
      ]);
      setKpis(k);
      setTasks(t);
    } catch {
      // best-effort — keep current data on failure
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    load();
  }, [load]);

  // Nothing assigned to this user — keep the dashboard clean.
  if (kpis.length === 0 && tasks.length === 0) return null;

  const sortedTasks = [...tasks].sort((a, b) => {
    const da = a.dueDate || '9999-12-31';
    const db = b.dueDate || '9999-12-31';
    if (a.doneByMe !== b.doneByMe) return a.doneByMe ? 1 : -1;
    return da < db ? -1 : 1;
  });

  const toggleTask = async (t: TaskItem) => {
    if (!profile?.id || togglingId) return;
    setTogglingId(t.id);
    try {
      await tasksService.setDone(t.id, profile.id, !t.doneByMe);
      await refresh();
    } finally {
      setTogglingId(null);
    }
  };

  const doneCount = tasks.filter((t) => t.doneByMe).length;

  return (
    <div className={agent ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 xl:grid-cols-2 gap-4'}>
      {/* My Targets */}
      <div className="card-base !p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Target size={15} className="text-primary" /> {L('agent.targets.title', 'My targets')}
          </h3>
          {kpis.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {L('agent.targets.met', `${kpis.filter((k) => k.pct >= 100).length}/${kpis.length} met`, { n: kpis.filter((k) => k.pct >= 100).length, total: kpis.length })}
            </span>
          )}
        </div>
        {kpis.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">
            {L('agent.targets.empty', 'No targets assigned to your role yet.')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {kpis.map((k) => (
              <div key={k.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-foreground truncate">{k.label}</span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap ml-2">
                      {k.actual.toLocaleString()} / {k.targetValue.toLocaleString()}{' '}
                      {agent && METRIC_UNIT[k.metric] ? tr(`agent.unit.${k.metric}`) : METRIC_UNIT[k.metric] || ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pctColor(k.pct)}`}
                      style={{ width: `${Math.max(2, k.pct)}%` }}
                    />
                  </div>
                  <span
                    className={`w-9 text-right text-[11px] font-bold tabular-nums ${
                      k.pct >= 100 ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}
                  >
                    {k.pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Tasks */}
      <div className="card-base !p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ClipboardList size={15} className="text-primary" /> {L('agent.tasks.title', 'My tasks')}
          </h3>
          {tasks.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {L('agent.tasks.done', `${doneCount}/${tasks.length} done`, { n: doneCount, total: tasks.length })}
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">{L('agent.tasks.empty', 'No tasks assigned to your role yet.')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedTasks.map((t) => {
              const due = dueMeta(t.dueDate);
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 transition-all ${
                    t.doneByMe ? 'opacity-60' : ''
                  }`}
                >
                  <button
                    onClick={() => toggleTask(t)}
                    disabled={togglingId === t.id}
                    className="mt-0.5 flex-shrink-0 transition-transform active:scale-90"
                    title={t.doneByMe ? 'Mark as not done' : 'Mark as done'}
                  >
                    {togglingId === t.id ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : t.doneByMe ? (
                      <span className="w-[18px] h-[18px] rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <Check size={12} />
                      </span>
                    ) : (
                      <Circle size={18} className="text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium text-foreground ${t.doneByMe ? 'line-through' : ''}`}
                    >
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${due.cls}`}
                      >
                        <CalendarDays size={9} /> {due.label}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${PRIORITY_CLS[t.priority] || PRIORITY_CLS.Medium}`}
                      >
                        <Flag size={9} /> {t.priority}
                      </span>
                    </div>
                  </div>
                  {t.doneByMe && (
                    <Trophy size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
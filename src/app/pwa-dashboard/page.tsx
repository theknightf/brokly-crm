'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { leadsService } from '@/lib/services/crmService';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { STATUS_COLORS } from '@/lib/ui';
import { PIPELINE_STAGES, OUTCOME_STAGES } from '@/app/leads-management/components/leadStages';

interface ActionRow {
  total: number;
  calls: number;
  notes: number;
  statusUpdates: number;
  leadsAdded: number;
}

/** Sales-agent "Dashboard" in the installed app: one card per stage with its count; tap to open that stage's leads. */
export default function PwaDashboardPage() {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const { user } = useAuth();
  const [actions, setActions] = useState<{ today: ActionRow | null; week: ActionRow | null }>({ today: null, week: null });

  useEffect(() => {
    let alive = true;
    const load = () =>
      leadsService
        .getStatusCounts()
        .then((c: any) => alive && setCounts(c || {}))
        .catch(() => alive && setCounts({}));
    void load();
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const supabase = createClient();
    const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
    const today = cairo(new Date());
    const weekStart = cairo(new Date(Date.now() - 6 * 86400000));
    const mine = async (from: string, to: string): Promise<ActionRow> => {
      const { data } = await (supabase as any).rpc('period_leaderboard', { p_from: from, p_to: to });
      const r = (Array.isArray(data) ? data : []).find((x: any) => x.user_id === user.id);
      return {
        total: Number(r?.total_actions || 0),
        calls: Number(r?.calls || 0),
        notes: Number(r?.notes || 0),
        statusUpdates: Number(r?.status_updates || 0),
        leadsAdded: Number(r?.leads_added || 0),
      };
    };
    const load = () =>
      Promise.all([mine(today, today), mine(weekStart, today)])
        .then(([t, w]) => alive && setActions({ today: t, week: w }))
        .catch(() => {});
    void load();
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user?.id]);

  const stages = [...PIPELINE_STAGES, ...OUTCOME_STAGES].filter((s) => s !== 'Duplicate Leads');
  const total = counts ? Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0) : null;
  const nf = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US');

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{ar ? 'الداشبورد' : 'Dashboard'}</h1>
            <p className="text-sm text-muted-foreground">{ar ? 'اضغط على مرحلة لفتح عملائها' : 'Tap a stage to open its leads'}</p>
          </div>
          <Link href="/leads-management" className="text-sm font-semibold text-primary">
            {ar ? 'كل العملاء' : 'All leads'}
            {total != null ? ` (${nf.format(total)})` : ''}
          </Link>
        </div>
        <section aria-label="My actions" className="rounded-2xl border border-border bg-card p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">{ar ? 'الأكشنز بتاعتي' : 'My actions'}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { key: 'today', label: ar ? 'النهارده' : 'Today', row: actions.today },
              { key: 'week', label: ar ? 'آخر 7 أيام' : 'Last 7 days', row: actions.week },
            ] as const).map((c) => (
              <div key={c.key} className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{c.row ? nf.format(c.row.total) : '…'}</p>
                {c.row && (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {ar ? 'مكالمات' : 'Calls'} {nf.format(c.row.calls)} · {ar ? 'ملاحظات' : 'Notes'} {nf.format(c.row.notes)}
                    <br />
                    {ar ? 'تغيير مراحل' : 'Stage changes'} {nf.format(c.row.statusUpdates)} · {ar ? 'ليدز مضافة' : 'Added'} {nf.format(c.row.leadsAdded)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2.5">
          {stages.map((s) => (
            <Link
              key={s}
              href={`/leads-management?status=${encodeURIComponent(s)}`}
              className={`flex min-h-[84px] flex-col justify-between rounded-2xl p-3.5 transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                STATUS_COLORS[s] || 'bg-muted text-muted-foreground'
              }`}
            >
              <span className="text-sm font-semibold leading-tight">{s}</span>
              <span className="text-2xl font-bold tabular-nums">{counts ? nf.format(Number(counts[s] || 0)) : '…'}</span>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { leadsService } from '@/lib/services/crmService';
import { useLanguage } from '@/contexts/LanguageContext';
import { STATUS_COLORS } from '@/lib/ui';
import { PIPELINE_STAGES, OUTCOME_STAGES } from '@/app/leads-management/components/leadStages';

/** Sales-agent "Dashboard" in the installed app: one card per stage with its count; tap to open that stage's leads. */
export default function PwaDashboardPage() {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

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

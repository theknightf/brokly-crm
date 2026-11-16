'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, Loader2, LogIn, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPositionWithFallback } from '@/lib/geolocation';
import { Segmented, useFmt } from './ui';
import { localToday, useHome, type FollowUp, type Range } from './useHomeData';

/** Greeting + date on one line; page-wide range control and refresh on the right. */
export function HomeHeader({ refreshing }: { refreshing: boolean }) {
  const { profile } = useAuth();
  const { t, lang } = useLanguage();
  const { range, setRange, refresh } = useHome();

  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }).format(new Date()));
  const key = hour < 12 ? 'tl.morning' : hour < 17 ? 'tl.afternoon' : 'tl.evening';
  const first = String(profile?.full_name || '').trim().split(/\s+/)[0] || '';
  const date = new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 truncate text-base text-foreground">
        <span className="font-semibold">{t(key, { name: first })}</span>
        <span className="text-muted-foreground"> · {date}</span>
      </p>
      <div className="flex items-center gap-2">
        <Segmented<Range>
          label={t('tl.range.label')}
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: t('tl.range.today') },
            { value: '7d', label: t('tl.range.7d') },
            { value: '30d', label: t('tl.range.30d') },
          ]}
        />
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label={t('common.refresh')}
          title={t('common.refresh')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 text-zinc-600 transition-colors hover:border-lime-500/50 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-300"
        >
          {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>
    </div>
  );
}

/** Slim row of action chips; renders nothing when there is nothing to act on. Replaces the check-in card. */
export function AttentionBar({ followUps }: { followUps: FollowUp[] | null }) {
  const { t } = useLanguage();
  const fmt = useFmt();
  const { token } = useHome();
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAttendance = useCallback(async () => {
    try {
      const d = localToday();
      const res = await fetch(`/api/attendance/self?from=${d}&to=${d}`, { cache: 'no-store' });
      if (!res.ok) return setCheckedIn(null); // unknown: don't nag
      const json = await res.json().catch(() => ({}));
      const row = (json?.attendance || [])[0];
      setCheckedIn(!!row?.check_in_time);
    } catch {
      setCheckedIn(null);
    }
  }, []);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance, token]);

  const checkIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pos = await getPositionWithFallback(() => {});
      const res = await fetch('/api/attendance/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin', lat: pos.fix?.lat ?? null, lng: pos.fix?.lng ?? null, locationVerified: pos.verified }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || t('tl.attn.checkInFailed'));
      toast.success(t('tl.attn.checkedIn'));
      setCheckedIn(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('tl.attn.checkInFailed'));
    } finally {
      setBusy(false);
    }
  };

  const today = localToday();
  const overdue = (followUps || []).filter((f) => f.dueDate < today).length;
  const dueToday = (followUps || []).filter((f) => f.dueDate === today).length;

  if (checkedIn !== false && overdue === 0 && dueToday === 0) return null;

  const chip =
    'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400';

  return (
    <div role="region" aria-label="Needs attention" className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
      {checkedIn === false && (
        <button
          type="button"
          onClick={checkIn}
          disabled={busy}
          className={`${chip} border-lime-400/40 bg-lime-400/10 text-lime-700 hover:bg-lime-400/20 disabled:opacity-60 dark:text-lime-300`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} className="rtl:-scale-x-100" />}
          {t('tl.attn.notCheckedIn')} <span aria-hidden>·</span> {busy ? t('tl.attn.checkingIn') : t('tl.attn.checkIn')}
        </button>
      )}
      {overdue > 0 && (
        <Link
          href="/follow-ups?tab=overdue"
          className={`${chip} border-red-400/30 bg-red-400/10 text-red-600 hover:bg-red-400/15 dark:text-red-300`}
        >
          <AlertTriangle size={14} />
          {t('tl.attn.overdue', { n: fmt(overdue) })} <span aria-hidden>·</span> {t('tl.attn.review')}
        </Link>
      )}
      {dueToday > 0 && (
        <Link
          href="/follow-ups?tab=today"
          className={`${chip} border-black/10 bg-white text-zinc-700 hover:border-lime-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200`}
        >
          <CalendarClock size={14} />
          {t('tl.attn.dueToday', { n: fmt(dueToday) })}
        </Link>
      )}
    </div>
  );
}

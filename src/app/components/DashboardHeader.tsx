'use client';

import React, { useMemo } from 'react';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import DynamicGreeting from './DynamicGreeting';

interface Props {
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function DashboardHeader({ onRefresh, refreshing = false }: Props) {
  const { t, lang } = useLanguage();
  const today = useMemo(
    () =>
      new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    [lang]
  );

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <DynamicGreeting />
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays size={14} aria-hidden />
          {today}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:border-lime-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:text-zinc-100 sm:self-auto [@media(pointer:coarse)]:h-11"
      >
        {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        <span>{t('common.refresh')}</span>
      </button>
    </div>
  );
}

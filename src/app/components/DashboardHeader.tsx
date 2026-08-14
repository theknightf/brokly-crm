'use client';

import React from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import DynamicGreeting from './DynamicGreeting';

export default function DashboardHeader() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <DynamicGreeting />
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('dashboard.subtitle', { date: 'August 3, 2026' })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-muted-foreground">
          <CalendarDays size={14} />
          <span>{t('dashboard.last30')}</span>
        </div>
        <button className="btn-ghost flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5">
          <RefreshCw size={14} />
          <span className="hidden sm:inline">{t('common.refresh')}</span>
        </button>
      </div>
    </div>
  );
}

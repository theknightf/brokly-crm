'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus, CalendarClock, Building2, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const DISMISS_KEY = 'brokly_got_started';

const STEPS = [
  { key: 'dashboard.step1', href: '/leads-management?new=1', icon: <UserPlus size={18} /> },
  { key: 'dashboard.step2', href: '/follow-ups', icon: <CalendarClock size={18} /> },
  { key: 'dashboard.step3', href: '/projects', icon: <Building2 size={18} /> },
] as const;

export default function GettingStarted() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  return (
    <div className="card-base bg-secondary/40 border-primary/30 relative">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 btn-ghost p-1.5 rounded-lg"
        aria-label={t('dashboard.dismissGuide')}
        title={t('dashboard.dismissGuide')}
      >
        <X size={16} />
      </button>
      <div className="pr-8">
        <h2 className="text-lg font-semibold text-foreground font-display">
          {t('dashboard.startHere')}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5 mb-4">
          {t('dashboard.startHereDesc')}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STEPS.map((step, i) => (
          <Link
            key={step.key}
            href={step.href}
            className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary flex-shrink-0">
              {step.icon}
            </span>
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-muted-foreground/60">{i + 1}.</span>
              <span className="text-sm font-medium text-foreground truncate">{t(step.key)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

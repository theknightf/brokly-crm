'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  CalendarClock,
  CalendarCheck2,
  MapPin,
  X,
  Zap,
  Users,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface QuickAction {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  href: string;
  tint: string;
}

const ACTIONS: QuickAction[] = [
  {
    key: 'lead',
    labelKey: 'quick.addLead',
    icon: <Users size={22} />,
    href: '/leads-management?new=1',
    tint: 'bg-lime-500/15 text-lime-600',
  },
  {
    key: 'followup',
    labelKey: 'quick.addFollowUp',
    icon: <CalendarClock size={22} />,
    href: '/follow-ups?new=1',
    tint: 'bg-emerald-500/15 text-emerald-600',
  },
  {
    key: 'checkin',
    labelKey: 'quick.checkIn',
    icon: <CalendarCheck2 size={22} />,
    href: '/attendance',
    tint: 'bg-sky-500/15 text-sky-600',
  },
  {
    key: 'location',
    labelKey: 'quick.shareLocation',
    icon: <MapPin size={22} />,
    href: '/locations',
    tint: 'bg-amber-500/15 text-amber-600',
  },
];

export default function QuickActions() {
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const run = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 lg:bottom-6 right-4 z-40 flex items-center gap-2 h-14 px-4 rounded-full bg-primary text-primary-foreground font-semibold shadow-[0_12px_30px_-8px_rgba(132,204,22,0.6)] hover:-translate-y-0.5 hover:brightness-105 active:scale-95 transition-all duration-200 btn-press lg:pr-5"
        aria-label={t('quick.title')}
      >
        <Zap size={20} className={open ? 'hidden' : 'block'} />
        <span className="hidden lg:inline">{t('quick.title')}</span>
      </button>

      {/* Sheet / modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm fade-in"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full lg:max-w-md bg-card border border-border rounded-t-3xl lg:rounded-3xl p-5 pop-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-lg font-semibold text-foreground font-display flex items-center gap-2">
                  <Zap size={18} className="text-primary" />
                  {t('quick.title')}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('quick.subtitle')}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="btn-ghost p-1.5 rounded-lg"
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              {ACTIONS.map((action) => (
                <button
                  key={action.key}
                  onClick={() => run(action.href)}
                  className="flex flex-col items-center justify-center gap-2.5 p-5 rounded-2xl bg-muted/50 hover:bg-muted border border-border hover:border-primary/50 hover:-translate-y-0.5 transition-all duration-200 min-h-[104px]"
                >
                  <span
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center ${action.tint}`}
                  >
                    {action.icon}
                  </span>
                  <span className="text-sm font-medium text-foreground text-center">
                    {t(action.labelKey)}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-4 btn-secondary"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

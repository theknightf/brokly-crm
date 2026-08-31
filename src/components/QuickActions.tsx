'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Plus,
  CalendarClock,
  CalendarCheck2,
  MapPin,
  Users,
  ChevronUp,
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
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Hide the FAB on the leads-management page and on the main dashboard to prevent covering the D.Deal card
  const onLeadsPage = pathname === '/leads-management' || pathname?.startsWith('/leads-management/');
  const onDashboard = pathname === '/' ;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const run = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  if (onLeadsPage || onDashboard) return null;

  return (
    <>
      {/* ── Main FAB: direct Add Lead shortcut ── */}
      <div className="fixed bottom-20 lg:bottom-6 right-4 z-40 flex flex-col items-end gap-2">
        {/* Secondary actions menu (other than Add Lead) */}
        {menuOpen && (
          <div className="flex flex-col gap-2 mb-1 animate-in fade-in slide-in-from-bottom-2">
            {ACTIONS.slice(1).map((action) => (
              <button
                key={action.key}
                onClick={() => run(action.href)}
                className="flex items-center gap-2.5 self-end pr-4 pl-3 py-2 rounded-full bg-card border border-border shadow-lg text-sm font-medium text-foreground hover:border-primary/50 transition-all active:scale-95"
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center ${action.tint} flex-shrink-0`}>
                  {action.icon}
                </span>
                {t(action.labelKey)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* More actions toggle */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={`h-10 w-10 rounded-full border border-border bg-card shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 active:scale-90 transition-all duration-150 ${
              menuOpen ? 'rotate-180' : ''
            }`}
            aria-label="More quick actions"
            title="More actions"
          >
            <ChevronUp size={18} />
          </button>

          {/* Primary: Add Lead */}
          <button
            onClick={() => run('/leads-management?new=1')}
            className="relative flex items-center gap-2 h-14 px-5 rounded-full bg-primary text-primary-foreground font-semibold shadow-[0_12px_30px_-8px_rgba(132,204,22,0.65)] hover:-translate-y-0.5 hover:brightness-105 active:scale-95 transition-all duration-200"
            aria-label={t('quick.addLead')}
          >
            {/* pulse ring */}
            <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" style={{ animationDuration: '2s' }} />
            <Plus size={22} strokeWidth={2.5} className="relative z-10 flex-shrink-0" />
            <span className="relative z-10 hidden lg:inline">Add lead</span>
          </button>
        </div>
      </div>

      {/* More actions sheet (when menu is open) — backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}

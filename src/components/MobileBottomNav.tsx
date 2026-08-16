'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CalendarClock, CalendarCheck2, Menu, Plus } from 'lucide-react';
import { isAdminRole } from '@/lib/roles';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

// Split items: 2 left + 2 right, with center FAB for Add Lead
const LEFT_ITEMS = [
  { labelKey: 'common.home', href: '/', icon: LayoutDashboard },
  { labelKey: 'common.leads', href: '/leads-management', icon: Users },
];
const RIGHT_ITEMS = [
  { labelKey: 'common.attendance', href: '/attendance', icon: CalendarCheck2 },
  { labelKey: 'common.followups', href: '/follow-ups', icon: CalendarClock },
];

export default function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  void isAdminRole(profile?.role);

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-safe">
      <div className="flex items-stretch h-16 relative">

        {/* Left items */}
        {LEFT_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 gap-1 text-[10px] font-medium transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
              aria-label={t(item.labelKey)}
            >
              <span
                className={`w-10 h-6 flex items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-secondary' : ''
                }`}
              >
                <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              {t(item.labelKey)}
            </Link>
          );
        })}

        {/* Center Add Lead FAB */}
        <div className="flex flex-col items-center justify-center flex-1 relative">
          <Link
            href="/leads-management?new=1"
            aria-label="Add lead"
            className="absolute -top-5 flex flex-col items-center gap-0.5 group"
          >
            <span className="relative flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[0_6px_24px_-4px_rgba(132,204,22,0.7)] group-active:scale-90 transition-transform duration-150">
              {/* pulse ring */}
              <span className="absolute inset-0 rounded-full bg-primary/50 animate-ping" style={{ animationDuration: '2.5s' }} />
              <Plus size={26} strokeWidth={2.5} className="relative z-10" />
            </span>
            <span className="text-[10px] font-semibold text-primary mt-1 leading-none">Add lead</span>
          </Link>
        </div>

        {/* Right items */}
        {RIGHT_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 gap-1 text-[10px] font-medium transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
              aria-label={t(item.labelKey)}
            >
              <span
                className={`w-10 h-6 flex items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-secondary' : ''
                }`}
              >
                <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              {t(item.labelKey)}
            </Link>
          );
        })}

        {/* Menu */}
        <button
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center flex-1 gap-1 text-[10px] font-medium text-muted-foreground transition-colors"
          aria-label="Open menu"
        >
          <span className="w-10 h-6 flex items-center justify-center rounded-full">
            <Menu size={20} strokeWidth={2} />
          </span>
          {t('common.menu')}
        </button>

      </div>
    </nav>
  );
}

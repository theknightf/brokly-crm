'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CalendarClock, CalendarCheck2, Menu } from 'lucide-react';
import { isAdminRole } from '@/lib/roles';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePendingDuplicates } from '@/hooks/usePendingDuplicates';

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
  const pendingDuplicates = usePendingDuplicates();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  void isAdminRole(profile?.role);

  return (
    <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-40">
      <div
        className="flex items-center justify-around relative px-2"
        style={{
          height: '64px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          paddingTop: '6px',
        }}
      >
        {/* Left items */}
        {LEFT_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              className={`mobile-nav-item flex flex-col items-center justify-center flex-1 gap-1 text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg ${
                active ? 'text-lime-700 dark:text-lime-300' : 'text-muted-foreground'
              }`}
              aria-label={t(item.labelKey)}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`w-10 h-6 flex items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-lime-500/20' : ''
                }`}
              >
                <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              {t(item.labelKey)}
            </Link>
          );
        })}

        {/* Right items */}
        {RIGHT_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              className={`mobile-nav-item flex flex-col items-center justify-center flex-1 gap-1 text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg ${
                active ? 'text-lime-700 dark:text-lime-300' : 'text-muted-foreground'
              }`}
              aria-label={t(item.labelKey)}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`w-10 h-6 flex items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-lime-500/20' : ''
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
          className="mobile-nav-item flex flex-col items-center justify-center flex-1 gap-1 text-[10px] font-medium text-muted-foreground transition-all"
          aria-label={pendingDuplicates > 0 ? `Open menu, ${pendingDuplicates} duplicates to review` : 'Open menu'}
        >
          <span className="relative w-10 h-6 flex items-center justify-center rounded-full">
            <Menu size={20} strokeWidth={2} />
            {pendingDuplicates > 0 && (
              <span className="absolute -top-1 end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-4 text-center tabular-nums">
                {pendingDuplicates > 9 ? '9+' : pendingDuplicates}
              </span>
            )}
          </span>
          {t('common.menu')}
        </button>
      </div>
    </nav>
  );
}

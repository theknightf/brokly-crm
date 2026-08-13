'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, MapPin, CalendarClock, CalendarCheck2, Menu } from 'lucide-react';
import { isAdminRole } from '@/lib/roles';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

// Mobile navigation is uniform for every role: Home | Leads | Attendance | Locations | Follow-ups.
// Customers stays available through the sidebar and the nav menu.
const items = [
  { labelKey: 'common.home', href: '/', icon: LayoutDashboard },
  { labelKey: 'common.leads', href: '/leads-management', icon: Users },
  { labelKey: 'common.attendance', href: '/attendance', icon: CalendarCheck2 },
  { labelKey: 'common.locations', href: '/locations', icon: MapPin },
  { labelKey: 'common.followups', href: '/follow-ups', icon: CalendarClock },
];

export default function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  // Admin still reaches the admin area through the drawer menu.
  void isAdminRole(profile?.role);

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-safe">
      <div className="flex items-stretch h-16">
        {items.map((item) => {
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

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
  const onDashboard = pathname === '/';

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

  // FAB removed per mobile spec — bottom nav handles Add Lead centrally
  return null;
}

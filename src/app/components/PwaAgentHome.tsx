'use client';
import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, ClipboardList, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Home of the installed app for a plain sales agent (same as the phone app):
 * two big buttons. Dashboard opens the lead stage cards, Workspace opens Late / Today follow-ups.
 */
export default function PwaAgentHome() {
  const { profile } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const first = String(profile?.full_name || '').trim().split(' ')[0];

  const buttons = [
    {
      href: '/pwa-dashboard',
      icon: LayoutDashboard,
      title: ar ? 'الداشبورد' : 'Dashboard',
      sub: ar ? 'كروت مراحل العملاء — اضغط على مرحلة لفتح القايمة' : 'Your lead stages — tap a stage to open its list',
      tone: 'bg-lime-500/15 text-lime-700 dark:text-lime-300',
    },
    {
      href: '/follow-ups?tab=overdue',
      icon: ClipboardList,
      title: ar ? 'مساحة العمل' : 'Workspace',
      sub: ar ? 'المتابعات المتأخرة ومتابعات النهارده' : 'Late and Today follow-ups',
      tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pt-2">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          {ar ? 'أهلاً' : 'Hi'}
          {first ? `، ${first}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">{ar ? 'اختار تبدأ منين' : 'Where do you want to start?'}</p>
      </div>
      {buttons.map((b) => (
        <Link
          key={b.href}
          href={b.href}
          className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all active:scale-[0.99] hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${b.tone}`}>
            <b.icon size={28} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-foreground">{b.title}</span>
            <span className="block text-sm text-muted-foreground">{b.sub}</span>
          </span>
          <ChevronRight size={20} className="flex-shrink-0 text-muted-foreground rtl:rotate-180" />
        </Link>
      ))}
    </div>
  );
}

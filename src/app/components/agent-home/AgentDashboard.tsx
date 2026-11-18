'use client';
/**
 * Sales-agent home ("/" for role agent). Order: header → Today (attendance, follow-ups, targets & tasks) →
 * Pipeline → Team (leaderboard + recent activity) → Insights (leads by source + leads by stage) → Start here
 * (new agents only). Every block reuses the existing data sources; shared components are rendered with
 * variant="agent", which leaves their default look (team leader, admin) unchanged.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { followUpsService } from '@/lib/services/crmService';

const AttendanceSelfCard = dynamic(() => import('@/components/AttendanceSelfCard'));
const MyTargetsTasks = dynamic(() => import('../MyTargetsTasks'));
const AgentPipeline = dynamic(() => import('./AgentPipeline'));
const DailyLeaderboard = dynamic(() => import('../DailyLeaderboard'));
const RecentActivity = dynamic(() => import('../RecentActivity'));
const LeadSourceChart = dynamic(() => import('../LeadSourceChart'));
const CustomerLifecycleChart = dynamic(() => import('../CustomerLifecycleChart'));
const GettingStarted = dynamic(() => import('../GettingStarted'));

/** One header pattern for every section: title + muted one-line subtitle + optional right-aligned link. */
function Section({
  title,
  subtitle,
  link,
  children,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {link && (
          <Link href={link.href} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default function AgentDashboard() {
  const { profile, user } = useAuth();
  const { t, lang } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [leadTotal, setLeadTotal] = useState<number | null>(null);
  const [followUpTotal, setFollowUpTotal] = useState<number | null>(null);

  const refresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  // "Start here" is only for brand-new agents (no leads or no follow-ups yet).
  useEffect(() => {
    let alive = true;
    followUpsService
      .getDashboardCounts()
      .then((c: { overdue?: number; dueToday?: number; upcoming?: number } | null) => {
        if (alive) setFollowUpTotal((c?.overdue || 0) + (c?.dueToday || 0) + (c?.upcoming || 0));
      })
      .catch(() => alive && setFollowUpTotal(null));
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  const onLeadTotal = useCallback((n: number) => setLeadTotal(n), []);
  const showStartHere = (leadTotal !== null && leadTotal === 0) || (followUpTotal !== null && followUpTotal === 0);

  const firstName = useMemo(() => {
    const full = profile?.full_name || user?.email?.split('@')[0] || '';
    return full.trim().split(/\s+/)[0] || '';
  }, [profile, user]);

  const hour = new Date().getHours();
  const greetingKey = hour >= 5 && hour < 12 ? 'agent.greet.morning' : hour >= 12 && hour < 18 ? 'agent.greet.afternoon' : 'agent.greet.evening';
  const today = new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      {/* 1. Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">
            {t(greetingKey, { name: firstName })}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('agent.subtitle')} <span className="whitespace-nowrap">· {today}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label={t('common.refresh')}
          title={t('common.refresh')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-lime-500/40 hover:text-foreground disabled:opacity-60 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        >
          {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </header>

      {/* 2. Today */}
      <Section title={t('agent.today.title')} subtitle={t('agent.today.subtitle')}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AttendanceSelfCard variant="agent" />
          <MyTargetsTasks key={`tt-${refreshKey}`} variant="agent" />
        </div>
      </Section>

      {/* 3. Pipeline */}
      <Section
        title={t('agent.pipe.title')}
        subtitle={t('agent.pipe.subtitle')}
        link={{ href: '/leads-management', label: t('agent.seeAll') }}
      >
        <AgentPipeline key={`pipe-${refreshKey}`} onCounts={onLeadTotal} />
      </Section>

      {/* 4. Team */}
      <Section title={t('agent.team.title')} subtitle={t('agent.team.subtitle')}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <DailyLeaderboard key={`lb-${refreshKey}`} variant="agent" />
          </div>
          <div className="min-w-0">
            <RecentActivity key={`ra-${refreshKey}`} variant="agent" />
          </div>
        </div>
      </Section>

      {/* 5. Insights */}
      <Section title={t('agent.insights.title')} subtitle={t('agent.insights.subtitle')}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <LeadSourceChart key={`src-${refreshKey}`} variant="agent" />
          </div>
          <div className="min-w-0">
            <CustomerLifecycleChart key={`stg-${refreshKey}`} variant="agent" />
          </div>
        </div>
      </Section>

      {/* 6. Start here — new agents only */}
      {showStartHere && <GettingStarted variant="agent" />}
    </div>
  );
}

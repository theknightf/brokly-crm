'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole, TEAM_LEAD_ROLE } from '@/lib/roles';

import { usePwaAgentRestriction } from '@/hooks/usePwaAgentRestriction';
const PwaAgentHome = dynamic(() => import('./components/PwaAgentHome'));
const DashboardHeader = dynamic(() => import('./components/DashboardHeader'));
const KPIBentoGrid = dynamic(() => import('./components/KPIBentoGrid'));
const DashboardKpis = dynamic(() => import('./components/DashboardKpis'));
const MyTargetsTasks = dynamic(() => import('./components/MyTargetsTasks'));
const DashboardCharts = dynamic(() => import('./components/DashboardCharts'));
const SalesFollowUpsWidget = dynamic(() => import('./components/SalesFollowUpsWidget'));
const RecentActivity = dynamic(() => import('./components/RecentActivity'));
const OwnerDashboard = dynamic(() => import('./components/OwnerDashboard'));
const GettingStarted = dynamic(() => import('./components/GettingStarted'));
const OwnerHome = dynamic(() => import('./components/OwnerHome'));
const DailyLeaderboard = dynamic(() => import('./components/DailyLeaderboard'));
const TeamOverview = dynamic(() => import('./components/TeamOverview'));
const AgentDashboard = dynamic(() => import('./components/agent-home/AgentDashboard'));
const AttendanceSelfCard = dynamic(() => import('@/components/AttendanceSelfCard'));

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="h-10 bg-muted/60 rounded-2xl animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 h-[92px] animate-pulse">
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="h-7 w-12 bg-muted rounded mb-2" />
            <div className="h-3 w-10 bg-muted/60 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 bg-card border border-border rounded-2xl animate-pulse" />
        <div className="h-64 bg-card border border-border rounded-2xl animate-pulse" />
      </div>
      <div className="h-48 bg-card border border-border rounded-2xl animate-pulse" />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 border-b border-black/5 pb-2 dark:border-white/5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const { profile, loading, user } = useAuth();
  const pwaAgent = usePwaAgentRestriction();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [tab, setTab] = React.useState<'team' | 'mine'>('team');
  const refresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  // Hydration guard: while auth is resolving OR user exists but profile (role) hasn't loaded yet,
  // show a unified skeleton – prevents flash of Sales dashboard for Owner/Admin.
  const isHydrating = loading || (!!user && !profile);
  if (isHydrating) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  // Installed app + plain sales agent: the two-button home (Dashboard / Workspace), like the phone app.
  if (pwaAgent) {
    return (
      <AppLayout>
        <PwaAgentHome />
      </AppLayout>
    );
  }

  // Role-normalized check (handles OWNER_ADMIN, Admin, owner_admin, etc.)
  const isUnified = isAdminRole(profile?.role);
  if (isUnified) {
    return (
      <AppLayout>
        <OwnerHome />
      </AppLayout>
    );
  }

  const roleKey = String(profile?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const isTeamLeader = roleKey === TEAM_LEAD_ROLE || roleKey === 'team_lead';

  // Sales agents (everyone who is not an admin/owner or team leader) get the agent dashboard.
  // Team leaders keep the layout below unchanged.
  if (!isTeamLeader) {
    return (
      <AppLayout>
        <AgentDashboard />
      </AppLayout>
    );
  }

  // Sales-user home: KPIs first, then today's work (follow-ups/calls + attendance), targets,
  // pipeline stages, leaderboard, charts and activity. Refresh remounts the data sections.
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <DashboardHeader onRefresh={refresh} refreshing={refreshing} />

        {isTeamLeader && (
          <div role="tablist" aria-label="Dashboard view" className="flex w-full rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06] sm:w-fit">
            {([['team', 'My Team / فريقي'], ['mine', 'My Work / شغلي']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`h-9 flex-1 rounded-lg px-5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 sm:flex-none ${
                  tab === k
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {isTeamLeader && tab === 'team' ? (
          <TeamOverview key={`team-${refreshKey}`} showEmpty />
        ) : (
        <>

        <Section title="Today" hint="Check in and work your follow-ups">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="order-1 xl:order-2 min-w-0">
              <AttendanceSelfCard />
            </div>
            <div className="order-2 xl:order-1 xl:col-span-2 min-w-0">
              <SalesFollowUpsWidget key={`fu-${refreshKey}`} />
            </div>
          </div>
        </Section>

        <Section title="Performance" hint="Your numbers, targets and tasks">
          <div className="flex flex-col gap-4">
            <DashboardKpis key={`kpi-${refreshKey}`} />
            <MyTargetsTasks key={`tt-${refreshKey}`} />
          </div>
        </Section>

        <Section title="Pipeline" hint="Leads by stage — tap a stage to open it">
          <KPIBentoGrid key={`stages-${refreshKey}`} />
        </Section>

        <Section title="Team" hint="Today's leaderboard and recent activity">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <DailyLeaderboard key={`lb-${refreshKey}`} />
            <div className="hidden lg:block">
              <RecentActivity key={`ra-${refreshKey}`} />
            </div>
          </div>
        </Section>

        <Section title="Insights" hint="Trends and getting started">
          <div className="flex flex-col gap-4">
            <DashboardCharts key={`charts-${refreshKey}`} />
            <GettingStarted />
          </div>
        </Section>
        </>
        )}
      </div>
    </AppLayout>
  );
}

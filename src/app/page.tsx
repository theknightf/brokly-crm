'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

const DashboardHeader = dynamic(() => import('./components/DashboardHeader'));
const KPIBentoGrid = dynamic(() => import('./components/KPIBentoGrid'));
const DashboardKpis = dynamic(() => import('./components/DashboardKpis'));
const MyTargetsTasks = dynamic(() => import('./components/MyTargetsTasks'));
const DashboardCharts = dynamic(() => import('./components/DashboardCharts'));
const SalesFollowUpsWidget = dynamic(() => import('./components/SalesFollowUpsWidget'));
const RecentActivity = dynamic(() => import('./components/RecentActivity'));
const OwnerDashboard = dynamic(() => import('./components/OwnerDashboard'));
const GettingStarted = dynamic(() => import('./components/GettingStarted'));
const UnifiedMasterDashboard = dynamic(() => import('./components/UnifiedMasterDashboard'));
const DailyLeaderboard = dynamic(() => import('./components/DailyLeaderboard'));
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

export default function DashboardPage() {
  const { profile, loading, user } = useAuth();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
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

  // Role-normalized check (handles OWNER_ADMIN, Admin, owner_admin, etc.)
  const isUnified = isAdminRole(profile?.role);
  if (isUnified) {
    return (
      <AppLayout>
        <UnifiedMasterDashboard />
      </AppLayout>
    );
  }

  // Sales-user home: KPIs first, then today's work (follow-ups/calls + attendance), targets,
  // pipeline stages, leaderboard, charts and activity. Refresh remounts the data sections.
  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <DashboardHeader onRefresh={refresh} refreshing={refreshing} />
        <DashboardKpis key={`kpi-${refreshKey}`} />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 min-w-0">
            <SalesFollowUpsWidget key={`fu-${refreshKey}`} />
          </div>
          <div className="min-w-0">
            <AttendanceSelfCard />
          </div>
        </div>
        <MyTargetsTasks key={`tt-${refreshKey}`} />
        <KPIBentoGrid key={`stages-${refreshKey}`} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DailyLeaderboard key={`lb-${refreshKey}`} />
          <div className="hidden lg:block">
            <RecentActivity key={`ra-${refreshKey}`} />
          </div>
        </div>
        <DashboardCharts key={`charts-${refreshKey}`} />
        <GettingStarted />
      </div>
    </AppLayout>
  );
}

'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';

const DashboardHeader = dynamic(() => import('./components/DashboardHeader'));
const KPIBentoGrid = dynamic(() => import('./components/KPIBentoGrid'));
const DashboardKpis = dynamic(() => import('./components/DashboardKpis'));
const MyTargetsTasks = dynamic(() => import('./components/MyTargetsTasks'));
const DashboardCharts = dynamic(() => import('./components/DashboardCharts'));
const OverdueFollowUps = dynamic(() => import('./components/OverdueFollowUps'));
const RecentActivity = dynamic(() => import('./components/RecentActivity'));
const MobileTodayFollowUps = dynamic(() => import('./components/MobileTodayFollowUps'));
const OwnerDashboard = dynamic(() => import('./components/OwnerDashboard'));
const GettingStarted = dynamic(() => import('./components/GettingStarted'));

export default function DashboardPage() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col gap-6">
          <div className="h-12 bg-muted/60 rounded-2xl animate-pulse" />
          <div className="h-24 bg-muted/60 rounded-2xl animate-pulse" />
          <div className="h-24 bg-muted/60 rounded-2xl animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (profile?.role === 'owner') {
    return (
      <AppLayout>
        <OwnerDashboard />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="order-1">
          <DashboardHeader />
        </div>
        <div className="order-2">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <MobileTodayFollowUps />
            <div className="hidden xl:block">
              <OverdueFollowUps />
            </div>
          </div>
        </div>
        <div className="order-3">
          <DashboardKpis />
        </div>
        <div className="order-4">
          <MyTargetsTasks />
        </div>
        <div className="order-5">
          <KPIBentoGrid />
        </div>
        <div className="order-6">
          <DashboardCharts />
        </div>
        <div className="order-7 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="hidden lg:block">
            <RecentActivity />
          </div>
          <div className="lg:hidden">
            <GettingStarted />
          </div>
        </div>
        <div className="hidden lg:block order-8">
          <GettingStarted />
        </div>
      </div>
    </AppLayout>
  );
}

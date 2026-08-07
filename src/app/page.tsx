'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';

const DashboardHeader = dynamic(() => import('./components/DashboardHeader'));
const KPIBentoGrid = dynamic(() => import('./components/KPIBentoGrid'));
const DashboardCharts = dynamic(() => import('./components/DashboardCharts'));
const OverdueFollowUps = dynamic(() => import('./components/OverdueFollowUps'));
const RecentActivity = dynamic(() => import('./components/RecentActivity'));
const MobileTodayFollowUps = dynamic(() => import('./components/MobileTodayFollowUps'));

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="order-3 lg:order-1">
          <DashboardHeader />
        </div>
        <div className="order-4 lg:order-2">
          <KPIBentoGrid />
        </div>
        <div className="order-5 lg:order-3">
          <DashboardCharts />
        </div>
        <div className="order-1 lg:order-4 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MobileTodayFollowUps />
          <div className="hidden lg:block">
            <OverdueFollowUps />
          </div>
          <div className="hidden lg:block">
            <RecentActivity />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

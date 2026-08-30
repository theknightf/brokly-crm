'use client';
import React from 'react';
import dynamic from 'next/dynamic';

const PipelineStageChart = dynamic(() => import('./PipelineStageChart'));
const LeadSourceChart = dynamic(() => import('./LeadSourceChart'));
const CustomerLifecycleChart = dynamic(() => import('./CustomerLifecycleChart'));

export default function DashboardCharts() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <PipelineStageChart />
        </div>
        <div className="xl:col-span-2">
          <LeadSourceChart />
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <CustomerLifecycleChart />
        </div>
      </div>
    </div>
  );
}

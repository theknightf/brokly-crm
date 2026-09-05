import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import LeadsManagementScreen from './components/LeadsManagementScreen';

function LeadsFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function LeadsManagementPage() {
  return (
    <AppLayout>
      {/* Suspense boundary required: the screen reads useSearchParams()
          (?stage= / ?status= deep-links from dashboard cards). */}
      <Suspense fallback={<LeadsFallback />}>
        <LeadsManagementScreen />
      </Suspense>
    </AppLayout>
  );
}

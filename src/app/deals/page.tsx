import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import LeadsManagementScreen from '@/app/leads-management/components/LeadsManagementScreen';

export default function DealsPage() {
  return (
    <AppLayout>
      {/* Suspense boundary required: the screen reads useSearchParams(). */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          </div>
        }
      >
        <LeadsManagementScreen
          initialStatus="Done Deal"
          title="Deals"
          subtitle="Won deals and closed sales"
        />
      </Suspense>
    </AppLayout>
  );
}

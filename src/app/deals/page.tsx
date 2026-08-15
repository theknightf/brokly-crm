import React from 'react';
import AppLayout from '@/components/AppLayout';
import LeadsManagementScreen from '@/app/leads-management/components/LeadsManagementScreen';

export default function DealsPage() {
  return (
    <AppLayout>
      <LeadsManagementScreen
        initialStatus="Done Deal"
        title="Deals"
        subtitle="Won deals and closed sales"
      />
    </AppLayout>
  );
}

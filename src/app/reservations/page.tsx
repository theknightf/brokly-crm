import React from 'react';
import AppLayout from '@/components/AppLayout';
import LeadsManagementScreen from '@/app/leads-management/components/LeadsManagementScreen';

export default function ReservationsPage() {
  return (
    <AppLayout>
      <LeadsManagementScreen
        initialStatus="Reservation"
        title="Reservations"
        subtitle="Leads with an active reservation on a unit"
      />
    </AppLayout>
  );
}

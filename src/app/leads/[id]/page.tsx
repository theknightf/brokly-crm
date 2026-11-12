import AppLayout from '@/components/AppLayout';
import { Suspense } from 'react';
import LeadPageSwitch from './LeadPageSwitch';

export default async function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // Same shell as every other page (sidebar, top bar, mobile nav); `fill` = full content width
    <AppLayout fill>
      {/* Suspense: the phone layout reads ?tab= with useSearchParams(). */}
      <Suspense fallback={null}>
        <LeadPageSwitch leadId={id} />
      </Suspense>
    </AppLayout>
  );
}

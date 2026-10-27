import AppLayout from '@/components/AppLayout';
import LeadProfileScreen from './LeadProfileScreen';

export default async function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // Same shell as every other page (sidebar, top bar, mobile nav); `fill` = full content width
    <AppLayout fill>
      <LeadProfileScreen leadId={id} />
    </AppLayout>
  );
}

import LeadProfileScreen from './LeadProfileScreen';

export default async function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-4 md:p-6 bg-background min-h-screen">
      <LeadProfileScreen leadId={id} />
    </div>
  );
}

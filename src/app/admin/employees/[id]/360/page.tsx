import AppLayout from '@/components/AppLayout';
import Owner360Profile from '@/app/components/Owner360Profile';

export default async function Employee360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppLayout>
      <Owner360Profile employeeId={id} />
    </AppLayout>
  );
}

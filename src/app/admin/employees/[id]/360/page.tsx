import Owner360Profile from '@/app/components/Owner360Profile';

export default async function Employee360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-4 md:p-6 bg-background min-h-screen">
      <Owner360Profile employeeId={id} />
    </div>
  );
}

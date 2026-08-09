import React from 'react';
import { notFound } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import EmployeeReportScreen from './EmployeeReportScreen';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EmployeeReportPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();
  return (
    <AppLayout>
      <EmployeeReportScreen employeeId={id} />
    </AppLayout>
  );
}
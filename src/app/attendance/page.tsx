'use client';
import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import AttendanceScreen from './components/AttendanceScreen';

export default function AttendancePage() {
  return (
    <AppLayout>
      {/* Suspense boundary required: the screen reads useSearchParams()
          (?view=self deep-link to the personal check-in tab). */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          </div>
        }
      >
        <AttendanceScreen />
      </Suspense>
    </AppLayout>
  );
}

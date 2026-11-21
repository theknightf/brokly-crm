'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';
import ITConsole from '@/app/components/ITConsole';
import { useAuth } from '@/contexts/AuthContext';
import { canUseItConsole } from '@/lib/roles';

export default function ItPage() {
  const { profile, loading, user } = useAuth();
  if (loading || (!!user && !profile)) {
    return (
      <AppLayout>
        <div className="space-y-4 animate-pulse">
          <div className="dash-card h-24" />
          <div className="dash-card h-64" />
        </div>
      </AppLayout>
    );
  }
  if (!canUseItConsole(profile?.role)) {
    return (
      <AppLayout>
        <p className="py-16 text-center text-sm text-muted-foreground">This page is for the IT team.</p>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <ITConsole />
    </AppLayout>
  );
}

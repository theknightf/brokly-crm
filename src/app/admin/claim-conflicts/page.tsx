'use client';
import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import ClaimConflictsTab from '../components/ClaimConflictsTab';

/** Admin-only. Non-admins see a plain "not available" note and no data is requested. */
export default function ClaimConflictsPage() {
  const { profile, loading } = useAuth();
  const isAdmin = isAdminRole(profile?.role);

  return (
    <AppLayout>
      <div className="space-y-4 p-3 sm:p-5">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} /> Back to Admin
        </Link>
        {loading ? null : isAdmin ? (
          <ClaimConflictsTab />
        ) : (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            This page is not available.
          </p>
        )}
      </div>
    </AppLayout>
  );
}

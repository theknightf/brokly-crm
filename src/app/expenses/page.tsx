'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';
import ExpensesTab from '@/app/admin/components/ExpensesTab';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { ShieldCheck, Loader2, Receipt } from 'lucide-react';

export default function ExpensesPage() {
  const { profile, loading: authLoading } = useAuth();
  return (
    <AppLayout>
      <div className="flex flex-col min-h-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Expenses</h1>
            <p className="text-sm text-muted-foreground">
              Office &amp; branch running costs — rent, electricity, staff, supplies
            </p>
          </div>
        </div>
        {authLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading expenses…</p>
          </div>
        ) : isAdminRole(profile?.role) ? (
          <ExpensesTab />
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldCheck size={20} className="text-destructive" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Access Denied</h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Only admins and owners can view expenses. Contact your administrator if you need
              access.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

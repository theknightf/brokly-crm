'use client';
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import EmployeeAttendanceView from './EmployeeAttendanceView';
import AdminAttendanceView from './AdminAttendanceView';

export default function AttendanceScreen() {
  const { profile, loading } = useAuth();
  const isAdminOrOwner = isAdminRole(profile?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Employees get the self-service view; admins/owners get full management.
  return isAdminOrOwner ? <AdminAttendanceView /> : <EmployeeAttendanceView />;
}

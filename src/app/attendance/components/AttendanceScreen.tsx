'use client';
import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import EmployeeAttendanceView from './EmployeeAttendanceView';
import AdminQuickAttendance from './AdminQuickAttendance';

type AdminTab = 'team' | 'self';

/**
 * /attendance router:
 * - Admin / Owner → ultra-simple AdminQuickAttendance (instant logging +
 *   batch + roster) by default, with a header toggle for their personal
 *   self check-in (EmployeeAttendanceView). Deep-linkable via ?view=self.
 *   The full enterprise HR surface lives in Admin → Attendance tab.
 * - Employees / agents → personal EmployeeAttendanceView (unchanged).
 */
export default function AttendanceScreen() {
  const { profile, loading } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<AdminTab>(() =>
    searchParams.get('view') === 'self' ? 'self' : 'team'
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isAdminOrOwner = isAdminRole(profile?.role);

  // Regular employees keep the personal self check-in as their only view.
  if (!isAdminOrOwner) {
    return <EmployeeAttendanceView />;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Admin view switcher — team management default, personal check-in one tap away */}
      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#181b22] p-1 w-full sm:w-auto sm:self-start">
        {(
          [
            ['team', 'تسجيل سريع للفريق', 'Quick Team Logger', LayoutGrid],
            ['self', 'تسجيل حضوري الشخصي', 'My Personal Check-in', UserCheck],
          ] as [AdminTab, string, string, any][]
        ).map(([key, ar, en, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === key
                ? 'bg-lime-500 text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Icon size={13} />
            <span className="flex flex-col items-start leading-tight text-left">
              <span dir="rtl">{ar}</span>
              <span className="text-[10px] font-semibold opacity-70" dir="ltr">{en}</span>
            </span>
          </button>
        ))}
      </div>

      {tab === 'team' ? <AdminQuickAttendance /> : <EmployeeAttendanceView />}
    </div>
  );
}

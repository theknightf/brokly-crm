-- ============================================================
-- Brokly CRM - Attendance tracking
-- Migration: 20260805120000_attendance.sql
--
-- Admin/owner can mark when an employee arrives at the office;
-- the check-in time + date is recorded. Check-out is optional.
-- One record per user per day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_out_time TIMESTAMPTZ,
  marked_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_user_day_unique UNIQUE (user_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON public.attendance(user_id, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON public.attendance(attendance_date DESC);

DROP TRIGGER IF EXISTS attendance_updated_at ON public.attendance;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Admins/owners manage all attendance
DROP POLICY IF EXISTS "admins_manage_attendance" ON public.attendance;
CREATE POLICY "admins_manage_attendance"
ON public.attendance FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- Every user can view their own attendance history
DROP POLICY IF EXISTS "users_view_own_attendance" ON public.attendance;
CREATE POLICY "users_view_own_attendance"
ON public.attendance FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- Brokly CRM - Monthly reports, attendance-as-activity + realtime
-- Migration: 20260806010000_productivity_reports_and_realtime.sql
--
-- 1. Attendance check-ins/outs now write to activity_log so attendance
--    counts towards each user's productivity action totals.
-- 2. Adds daily-activity helpers used by the admin monthly report.
-- 3. Ensures activity_log is broadcast-able for live (realtime) dashboards.
-- ============================================================

-- ─── 1. LOG ATTENDANCE INTO activity_log ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_attendance_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.check_in_time IS DISTINCT FROM NEW.check_in_time) THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
    VALUES (NEW.user_id, 'Check-in', 'attendance', NEW.attendance_date::text,
            NEW.attendance_date::text, 'attendance');
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.check_out_time IS DISTINCT FROM NEW.check_out_time
     AND NEW.check_out_time IS NOT NULL THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
    VALUES (NEW.user_id, 'Check-out', 'attendance', NEW.attendance_date::text,
            NEW.attendance_date::text, 'attendance');
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_attendance ON public.attendance;
CREATE TRIGGER trg_log_attendance
  AFTER INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.log_attendance_change();

-- ─── 2. DAILY ACTIVITY SERIES HELPER (for the monthly report) ────────────────

-- Total actions taken by a user on a single calendar day.
CREATE OR REPLACE FUNCTION public.daily_action_count(p_user_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.activity_log
  WHERE user_id = p_user_id
    AND created_at::date = p_date;
$$;

-- Total active seconds for a user on a single calendar day.
CREATE OR REPLACE FUNCTION public.daily_active_seconds(p_user_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(total_active_seconds), 0)::INTEGER
  FROM public.user_daily_activity
  WHERE user_id = p_user_id AND activity_date = p_date;
$$;

-- ─── 3. REALTIME ─────────────────────────────────────────────────────────────
-- Supabase realtime delivers INSERT events for tables in the realtime
-- publication. RLS still applies to subscribers. Replica identity is not
-- strictly required for INSERT broadcasts, but FULL enables UPDATE/DELETE
-- payloads too (useful if a dashboard wants live edits).

ALTER TABLE public.activity_log REPLICA IDENTITY FULL;
ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;

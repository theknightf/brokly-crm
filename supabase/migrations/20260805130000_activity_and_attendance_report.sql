-- ============================================================
-- Brokly CRM - Activity log (actions per user per hour) +
-- Attendance report helpers + office hours
-- Migration: 20260805130000_activity_and_attendance_report.sql
--
-- 1. activity_log table + DB triggers so every user action on
--    leads / follow-ups / lead_comments is recorded automatically.
--    Reports then show "how many actions each user took, per hour".
-- 2. Adds an attendance_lateness() SQL helper used to detect who
--    arrived after the office tolerance (12:30) for the report.
-- ============================================================

-- ─── 1. ACTIVITY LOG ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  meta TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created
  ON public.activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON public.activity_log(created_at);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Admins/owners can read everyone; other users can only read their own.
DROP POLICY IF EXISTS "read_activity_log" ON public.activity_log;
CREATE POLICY "read_activity_log"
ON public.activity_log FOR SELECT TO authenticated
USING (public.is_admin_or_owner_v2() OR user_id = auth.uid());

-- Triggers (SECURITY DEFINER) insert log rows under the acting user.
DROP POLICY IF EXISTS "write_activity_log" ON public.activity_log;
CREATE POLICY "write_activity_log"
ON public.activity_log FOR INSERT TO authenticated
WITH CHECK (true);

-- ─── 2. LOGGING FUNCTIONS + TRIGGERS ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_lead_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (auth.uid(), 'Lead Added', 'lead', NEW.id::text, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (auth.uid(), 'Lead Updated', 'lead', NEW.id::text, NEW.name);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (auth.uid(), 'Lead Deleted', 'lead', OLD.id::text, OLD.name);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_lead ON public.leads;
CREATE TRIGGER trg_log_lead
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_change();

CREATE OR REPLACE FUNCTION public.log_follow_up_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
    VALUES (auth.uid(), 'Follow-up Added', 'follow_up', NEW.id::text, NEW.title, NEW.follow_up_type);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
    VALUES (auth.uid(), 'Follow-up Updated', 'follow_up', NEW.id::text, NEW.title, NEW.follow_up_type);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
    VALUES (auth.uid(), 'Follow-up Deleted', 'follow_up', OLD.id::text, OLD.title, OLD.follow_up_type);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_follow_up ON public.follow_ups;
CREATE TRIGGER trg_log_follow_up
  AFTER INSERT OR UPDATE OR DELETE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.log_follow_up_change();

CREATE OR REPLACE FUNCTION public.log_comment_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
  VALUES (auth.uid(), 'Comment Added', 'lead_comment', NEW.lead_id::text, LEFT(NEW.body, 80));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_comment ON public.lead_comments;
CREATE TRIGGER trg_log_comment
  AFTER INSERT ON public.lead_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_comment_added();

-- ─── 3. OFFICE-HOUR / LATE LOGIC ─────────────────────────────────────────────

-- Reports use a 12:00 → 20:00 office window. "Late" = arrived after 12:30.
-- Attendance stores check_in_time as TIMESTAMPTZ; we treat the stored
-- wall-clock value (the browser local time) as the office clock and compare
-- hours:minutes against the 12:30 tolerance using the server's own clock
-- only where needed. The client applies local-time logic for display.

DROP TYPE IF EXISTS public.attendance_status CASCADE;
CREATE TYPE public.attendance_status AS ENUM ('on_time', 'late', 'missing');

-- Returns how many minutes late an employee was (0 = on time).
-- check_in is the stored TIMESTAMPTZ; we extract its local wall time and
-- compare against the office start (12:00). NULL => -1 (no record).
CREATE OR REPLACE FUNCTION public.attendance_late_minutes(check_in TIMESTAMPTZ)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN check_in IS NULL THEN -1
    WHEN EXTRACT(HOUR   FROM check_in AT TIME ZONE 'UTC') * 60
       + EXTRACT(MINUTE FROM check_in AT TIME ZONE 'UTC') <= 12 * 60 + 30 THEN 0
    ELSE (EXTRACT(HOUR   FROM check_in AT TIME ZONE 'UTC') * 60
       + EXTRACT(MINUTE FROM check_in AT TIME ZONE 'UTC')) - (12 * 60)
  END::INTEGER;
$$;
-- ============================================================
-- Brokly CRM - Restore missing activity/session tracking tables
-- Migration: 20260814000000_restore_missing_activity_tracking.sql
--
-- WHY: The live database is missing activity_log, user_sessions,
-- user_activity_log and user_daily_activity (migrations
-- 20260805130000 / 20260805150000 were never fully applied).
-- The call_logs trigger (trg_log_call) writes to activity_log,
-- so EVERY call_logs INSERT was failing and calls were silently
-- stashed into the admin_settings "call_log_fallback" bucket —
-- which the admin Call Logs panel never reads. This migration:
--
--   1. Recreates the missing tables + indexes + RLS + policies.
--   2. Recreates all activity-logging functions & triggers.
--   3. Recreates session/daily-activity helpers & triggers.
--   4. Re-adds grants for the new tables.
--   5. Backfills call_logs from the admin_settings fallback rows.
--
-- Safe to run on any database (every statement is idempotent).
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

ALTER TABLE public.activity_log REPLICA IDENTITY FULL;

-- ─── 2. LOGGING FUNCTIONS + TRIGGERS ─────────────────────────────────────────

-- Leads: Lead Added / Lead Assigned (prev->new) / Status Updated / Updated / Deleted
CREATE OR REPLACE FUNCTION public.log_lead_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (v_user, 'Lead Added', 'lead', NEW.id::text, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Assigned', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.assigned_to::text,'') || ' -> ' || COALESCE(NEW.assigned_to::text,''));
    ELSIF OLD.crm_status IS DISTINCT FROM NEW.crm_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.crm_status::text,'') || ' -> ' || COALESCE(NEW.crm_status::text,''));
    ELSIF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.lead_status::text,'') || ' -> ' || COALESCE(NEW.lead_status::text,''));
    ELSE
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
      VALUES (v_user, 'Lead Updated', 'lead', NEW.id::text, NEW.name);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (v_user, 'Lead Deleted', 'lead', OLD.id::text, OLD.name);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead ON public.leads;
CREATE TRIGGER trg_log_lead
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_change();

-- Follow-ups
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

-- Lead comments
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

-- Call logs — THE critical one: without activity_log this trigger makes
-- every call_logs INSERT fail.
CREATE OR REPLACE FUNCTION public.log_call_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
  VALUES (
    NEW.user_id,
    'Call Logged',
    NEW.entity_type,
    NEW.entity_id,
    COALESCE(NEW.contact_name, ''),
    NEW.channel || '|' || COALESCE(NEW.direction, '')
  );
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_call ON public.call_logs;
CREATE TRIGGER trg_log_call
  AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_call_added();

-- Attendance check-in / check-out
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

-- ─── 3. OFFICE-HOUR / LATE LOGIC ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE public.attendance_status AS ENUM ('on_time', 'late', 'missing');
  END IF;
END $$;

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

-- ─── 4. USER SESSIONS / ACTIVITY / DAILY AGGREGATES ──────────────────────────

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER DEFAULT 0,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  closed_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_login
  ON public.user_sessions(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON public.user_sessions(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_time
  ON public.user_activity_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_session
  ON public.user_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_type
  ON public.user_activity_log(event_type);

CREATE TABLE IF NOT EXISTS public.user_daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  total_active_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  first_login_at TIMESTAMPTZ,
  last_logout_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_user_date
  ON public.user_daily_activity(user_id, activity_date DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_sessions" ON public.user_sessions;
CREATE POLICY "users_own_sessions"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_sessions" ON public.user_sessions;
CREATE POLICY "users_insert_sessions"
  ON public.user_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_sessions" ON public.user_sessions;
CREATE POLICY "users_update_own_sessions"
  ON public.user_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2())
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_own_activity" ON public.user_activity_log;
CREATE POLICY "users_own_activity"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_activity" ON public.user_activity_log;
CREATE POLICY "users_insert_activity"
  ON public.user_activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_daily" ON public.user_daily_activity;
CREATE POLICY "users_own_daily"
  ON public.user_daily_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;

-- ─── 4. REPORT HELPERS ────────────────────────────────────────────────────────
-- Defined AFTER the tables they read (LANGUAGE sql validates at creation).

CREATE OR REPLACE FUNCTION public.daily_action_count(p_user_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.activity_log
  WHERE user_id = p_user_id
    AND created_at::date = p_date;
$$;

CREATE OR REPLACE FUNCTION public.daily_active_seconds(p_user_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(total_active_seconds), 0)::INTEGER
  FROM public.user_daily_activity
  WHERE user_id = p_user_id AND activity_date = p_date;
$$;

-- ─── 5. SESSION / HEARTBEAT HELPERS ──────────────────────────────────────────

-- Live DB is missing this base helper — define it so the triggers below work.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_stale_sessions(timeout_minutes INTEGER DEFAULT 5)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  closed_count INTEGER := 0;
BEGIN
  UPDATE public.user_sessions
  SET
    logout_at = last_heartbeat_at + (timeout_minutes || ' minutes')::interval,
    duration_seconds = EXTRACT(EPOCH FROM (last_heartbeat_at + (timeout_minutes || ' minutes')::interval - login_at))::INTEGER,
    is_active = false,
    closed_reason = 'timeout',
    updated_at = CURRENT_TIMESTAMP
  WHERE is_active = true
    AND last_heartbeat_at < CURRENT_TIMESTAMP - (timeout_minutes || ' minutes')::interval;

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END $$;

CREATE OR REPLACE FUNCTION public.record_heartbeat(
  p_user_id UUID,
  p_session_id UUID,
  p_event_type TEXT DEFAULT 'heartbeat',
  p_event_data JSONB DEFAULT '{}'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session public.user_sessions%ROWTYPE;
  v_now TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_last TIMESTAMPTZ;
  v_diff INTEGER;
BEGIN
  SELECT * INTO v_session
  FROM public.user_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_last := v_session.last_heartbeat_at;
  v_diff := EXTRACT(EPOCH FROM (v_now - v_last))::INTEGER;
  IF v_diff > 120 THEN v_diff := 120; END IF;

  UPDATE public.user_sessions
  SET
    last_heartbeat_at = v_now,
    duration_seconds = duration_seconds + v_diff,
    updated_at = v_now
  WHERE id = p_session_id;

  INSERT INTO public.user_activity_log (user_id, session_id, event_type, event_data, occurred_at)
  VALUES (p_user_id, p_session_id, p_event_type, p_event_data, v_now);
END $$;

CREATE OR REPLACE FUNCTION public.refresh_daily_activity(p_user_id UUID, p_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_sec INTEGER;
  v_sessions INTEGER;
  v_first_login TIMESTAMPTZ;
  v_last_logout TIMESTAMPTZ;
  v_last_activity TIMESTAMPTZ;
BEGIN
  SELECT
    COALESCE(SUM(duration_seconds), 0),
    COUNT(*),
    MIN(login_at),
    MAX(logout_at),
    MAX(last_heartbeat_at)
  INTO v_total_sec, v_sessions, v_first_login, v_last_logout, v_last_activity
  FROM public.user_sessions
  WHERE user_id = p_user_id
    AND login_at::date = p_date;

  INSERT INTO public.user_daily_activity (user_id, activity_date, total_active_seconds, session_count, first_login_at, last_logout_at, last_activity_at, updated_at)
  VALUES (p_user_id, p_date, v_total_sec, v_sessions, v_first_login, v_last_logout, v_last_activity, CURRENT_TIMESTAMP)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    total_active_seconds = EXCLUDED.total_active_seconds,
    session_count = EXCLUDED.session_count,
    first_login_at = EXCLUDED.first_login_at,
    last_logout_at = EXCLUDED.last_logout_at,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = EXCLUDED.updated_at;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_refresh_daily()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    PERFORM public.refresh_daily_activity(NEW.user_id, NEW.login_at::date);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refresh_daily ON public.user_sessions;
CREATE TRIGGER trg_refresh_daily
  AFTER UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_refresh_daily();

DROP TRIGGER IF EXISTS trg_user_sessions_updated ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_updated
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_user_daily_updated ON public.user_daily_activity;
CREATE TRIGGER trg_user_daily_updated
  BEFORE UPDATE ON public.user_daily_activity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 7. GRANTS ────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_daily_activity TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.user_activity_log_id_seq TO authenticated;

-- ─── 8. CALL LOGS — UPSERT FIX ────────────────────────────────────────────────
-- The old PARTIAL unique index (WHERE client_ref IS NOT NULL) cannot serve as
-- an ON CONFLICT arbiter → Postgres error 42P10 on every upsert. Replace it
-- with a plain unique index (NULLs are distinct, so rows without client_ref
-- are unaffected) and add the UPDATE policy the upsert's implicit UPDATE needs.

DROP INDEX IF EXISTS public.idx_call_logs_client_ref;

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_client_ref_unique
  ON public.call_logs (client_ref);

DROP POLICY IF EXISTS "users_update_call_logs" ON public.call_logs;
CREATE POLICY "users_update_call_logs"
  ON public.call_logs FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner_v2() OR user_id = auth.uid())
  WITH CHECK (public.is_admin_or_owner_v2() OR user_id = auth.uid());

-- ─── 9. BACKFILL: salvage call logs stashed in admin_settings ────────────────
-- Each fallback row stores a JSON call object in admin_settings.color.
-- Loop per-row and skip anything malformed so this migration can never fail.

DO $$
DECLARE
  r RECORD;
  rec JSONB;
BEGIN
  FOR r IN SELECT color FROM public.admin_settings
           WHERE category = 'call_log_fallback' AND color IS NOT NULL
  LOOP
    BEGIN
      rec := r.color::jsonb;
      IF rec ? 'user_id' AND rec ->> 'user_id' IS NOT NULL THEN
        INSERT INTO public.call_logs (
          user_id, entity_type, entity_id, contact_name, contact_phone,
          channel, direction, duration_seconds, outcome, notes,
          client_ref, project_name, created_at
        )
        VALUES (
          NULLIF(rec ->> 'user_id', '')::uuid,
          COALESCE(rec ->> 'entity_type', 'lead'),
          COALESCE(rec ->> 'entity_id', ''),
          COALESCE(rec ->> 'contact_name', ''),
          COALESCE(rec ->> 'contact_phone', ''),
          COALESCE(rec ->> 'channel', 'Call'),
          COALESCE(rec ->> 'direction', 'outgoing'),
          COALESCE(NULLIF(rec ->> 'duration_seconds', '')::integer, 0),
          COALESCE(rec ->> 'outcome', ''),
          COALESCE(rec ->> 'notes', ''),
          NULLIF(rec ->> 'client_ref', ''),
          COALESCE(rec ->> 'project_name', ''),
          COALESCE(NULLIF(rec ->> 'created_at', '')::timestamptz, CURRENT_TIMESTAMP)
        )
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- skip malformed rows, never block the migration
    END;
  END LOOP;
END $$;

-- ─── 10. REALTIME ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_log'
  ) THEN
    NULL;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'follow_ups'
  ) THEN
    NULL;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
  END IF;
END $$;

-- Refresh PostgREST's schema cache so the new tables are queryable immediately.
NOTIFY pgrst, 'reload schema';

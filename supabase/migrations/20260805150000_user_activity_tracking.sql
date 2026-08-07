-- ============================================================
-- Brokly CRM - User Activity & Session Tracking
-- Migration: 20260805150000_user_activity_tracking.sql
-- ============================================================

-- ─── 1. USER SESSIONS ────────────────────────────────────────────────────────
-- One row per login session. Closed when user logs out or heartbeat times out.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER DEFAULT 0,      -- accumulated active seconds
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  closed_reason TEXT,                      -- 'logout' | 'timeout' | 'manual'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_login
  ON public.user_sessions(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON public.user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_date
  ON public.user_sessions((login_at::date) DESC);

-- ─── 2. USER ACTIVITY LOG ────────────────────────────────────────────────────
-- Fine-grained events: page views, clicks, form submissions, heartbeats, etc.

CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,                -- 'heartbeat' | 'page_view' | 'click' | 'form_submit' | 'api_call' | 'login' | 'logout'
  event_data JSONB DEFAULT '{}',           -- flexible payload (url, element, etc.)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_time
  ON public.user_activity_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_session
  ON public.user_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_type
  ON public.user_activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_date
  ON public.user_activity_log((occurred_at::date) DESC);

-- ─── 3. DAILY AGGREGATES (Materialized / Refreshed) ──────────────────────────
-- Pre-computed daily totals for fast dashboard queries.

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

-- ─── 4. RLS POLICIES ─────────────────────────────────────────────────────────

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;

-- Users see own sessions; admins see all
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

-- Activity log: users see own; admins see all
DROP POLICY IF EXISTS "users_own_activity" ON public.user_activity_log;
CREATE POLICY "users_own_activity"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_activity" ON public.user_activity_log;
CREATE POLICY "users_insert_activity"
  ON public.user_activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Daily aggregates: users see own; admins see all
DROP POLICY IF EXISTS "users_own_daily" ON public.user_daily_activity;
CREATE POLICY "users_own_daily"
  ON public.user_daily_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

-- ─── 5. HELPER FUNCTIONS ──────────────────────────────────────────────────────

-- Close stale sessions (called by cron or manual)
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

-- Record heartbeat (upsert session, insert activity log, update duration)
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
  -- Update session last_heartbeat and duration
  SELECT * INTO v_session
  FROM public.user_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- session closed or doesn't exist
  END IF;

  v_last := v_session.last_heartbeat_at;
  v_diff := EXTRACT(EPOCH FROM (v_now - v_last))::INTEGER;
  -- Cap diff at 2 minutes to handle tab sleeping
  IF v_diff > 120 THEN v_diff := 120; END IF;

  UPDATE public.user_sessions
  SET
    last_heartbeat_at = v_now,
    duration_seconds = duration_seconds + v_diff,
    updated_at = v_now
  WHERE id = p_session_id;

  -- Log activity
  INSERT INTO public.user_activity_log (user_id, session_id, event_type, event_data, occurred_at)
  VALUES (p_user_id, p_session_id, p_event_type, p_event_data, v_now);
END $$;

-- Refresh daily aggregates for a user/date
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

-- Trigger to auto-refresh daily on session close
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

-- Updated at trigger
DROP TRIGGER IF EXISTS trg_user_sessions_updated ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_updated
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_user_daily_updated ON public.user_daily_activity;
CREATE TRIGGER trg_user_daily_updated
  BEFORE UPDATE ON public.user_daily_activity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
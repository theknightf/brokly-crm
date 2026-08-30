-- ============================================================
-- Brokly CRM - Employee Activity & Site Visits Upgrade
-- Migration: 20260810000000_employee_activity_site_visits.sql
--
-- Builds on the existing tables (never duplicates them):
--   1. site_visits  → link to CRM Leads, full visit lifecycle
--      (Scheduled / Check-in / In Progress / Check-out / Completed /
--       Cancelled / No Show), outcome, duration + event timeline.
--   2. attendance   → GPS capture on check-in/out + self check-in
--      for employees (previously admin-only).
--   3. audit_log    → who changed what, old → new, always retained.
-- ============================================================

-- ─── 1. SITE VISITS — LEAD LINKAGE + LIFECYCLE ───────────────────────────────

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lead_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_site_visits_lead
  ON public.site_visits(lead_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_status
  ON public.site_visits(status);
CREATE INDEX IF NOT EXISTS idx_site_visits_scheduled
  ON public.site_visits(created_at);

-- ─── 2. SITE VISIT EVENT TIMELINE ───────────────────────────────────────────
-- Every lifecycle step (Created → Assigned → Check-in → Location Captured →
-- In Progress → Check-out → Completed) becomes a row so the full trail can be
-- reconstructed and showed to admin/owner.

CREATE TABLE IF NOT EXISTS public.site_visit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id UUID NOT NULL REFERENCES public.site_visits(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                 -- seen Below
  detail TEXT DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_visit_events_visit
  ON public.site_visit_events(site_visit_id, created_at);

ALTER TABLE public.site_visit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_view_site_visit_events" ON public.site_visit_events;
CREATE POLICY "admins_view_site_visit_events"
  ON public.site_visit_events FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_view_own_site_visit_events" ON public.site_visit_events;
CREATE POLICY "users_view_own_site_visit_events"
  ON public.site_visit_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_insert_site_visit_events" ON public.site_visit_events;
CREATE POLICY "users_insert_site_visit_events"
  ON public.site_visit_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─── 3. ATTENDANCE — GPS + SELF CHECK-IN ────────────────────────────────────

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_in_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';  -- 'gps' | 'manual'

-- Employees can now start their own attendance (previously admin-only).
DROP POLICY IF EXISTS "users_insert_own_attendance" ON public.attendance;
CREATE POLICY "users_insert_own_attendance"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_attendance" ON public.attendance;
CREATE POLICY "users_update_own_attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── 4. AUDIT LOG — EVERY IMPORTANT CHANGE, RETAINED FOREVER ────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  user_name TEXT DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',       -- lead | site_visit | attendance | expense | user
  entity_id TEXT DEFAULT '',
  action TEXT NOT NULL DEFAULT '',            -- created | updated | status_changed | assigned …
  prev_value JSONB DEFAULT '{}',
  new_value JSONB DEFAULT '{}',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_time
  ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_time
  ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_view_audit_log" ON public.audit_log;
CREATE POLICY "admins_view_audit_log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_audit_log" ON public.audit_log;
CREATE POLICY "users_insert_audit_log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.site_visit_events, public.audit_log TO authenticated;
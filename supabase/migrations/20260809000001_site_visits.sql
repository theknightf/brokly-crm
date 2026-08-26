-- ============================================================
-- Brokly CRM - Site Visits (field GPS check-in)
-- Migration: 20260809000001_site_visits.sql
--
-- 1. Adds optional latitude/longitude + radius to projects so the app
--    can verify a sales agent is physically at the site.
-- 2. Creates a site_visits table: one row per check-in that an agent ends
--    with a check-out (each start = Start Site Visit, end = End Site Visit).
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS radius_m INTEGER DEFAULT 300;

CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_name TEXT DEFAULT '',
  check_in_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  check_out_at TIMESTAMPTZ,
  check_in_lat DOUBLE PRECISION,
  check_in_lng DOUBLE PRECISION,
  check_out_lat DOUBLE PRECISION,
  check_out_lng DOUBLE PRECISION,
  distance_m DOUBLE PRECISION,          -- from check-in point to project pin
  verified BOOLEAN DEFAULT false,       -- true when check-in within project radius
  within_radius BOOLEAN DEFAULT false,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_visits_user_time
  ON public.site_visits(user_id, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_project
  ON public.site_visits(project_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_open
  ON public.site_visits(user_id) WHERE check_out_at IS NULL;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_site_visits" ON public.site_visits;
CREATE POLICY "users_own_site_visits"
  ON public.site_visits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_site_visits" ON public.site_visits;
CREATE POLICY "users_insert_site_visits"
  ON public.site_visits FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_site_visits" ON public.site_visits;
CREATE POLICY "users_update_site_visits"
  ON public.site_visits FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());
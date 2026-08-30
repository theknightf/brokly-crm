-- ============================================================
-- Brokly CRM — One-time fix: create missing `kpi_targets` table
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard → SQL Editor)
-- Safe to run more than once (fully idempotent).
-- ============================================================

-- 1) Ensure the admin/owner helper used by RLS exists (safe to redefine)
CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'owner')
  );
$$;

-- 2) Create the KPI targets table (if missing)
CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL,
  label TEXT DEFAULT '',
  target_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  period_type TEXT NOT NULL DEFAULT 'day',
  target_role TEXT NOT NULL DEFAULT 'all',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpi_targets_metric ON public.kpi_targets(metric, period_type);

-- 3) Row-level security + policies
ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kpi_targets_read" ON public.kpi_targets;
CREATE POLICY "kpi_targets_read"
  ON public.kpi_targets FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kpi_targets_admin" ON public.kpi_targets;
CREATE POLICY "kpi_targets_admin"
  ON public.kpi_targets FOR ALL TO authenticated
  USING (public.is_admin_or_owner_v2())
  WITH CHECK (public.is_admin_or_owner_v2());

-- 4) Grant the authenticated role table access (required for PostgREST/supabase-js)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_targets TO authenticated;

-- 5) Seed the default targets (only if the table is empty)
INSERT INTO public.kpi_targets (metric, label, target_value, period_type, target_role)
SELECT m, l, v, pt, r
FROM (VALUES
  ('daily_calls', 'Daily Calls', 30, 'day', 'all'),
  ('daily_followups', 'Daily Follow-ups', 15, 'day', 'all'),
  ('daily_meetings', 'Daily Meetings', 2, 'day', 'all'),
  ('leads_worked', 'Leads Worked', 10, 'day', 'all'),
  ('deals', 'Deals per Month', 2, 'month', 'all'),
  ('revenue', 'Revenue per Month (EGP)', 100000, 'month', 'all')
) AS t(m, l, v, pt, r)
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_targets);
-- ============================================================
-- Brokly CRM - Ensure KPI Targets table exists
-- Migration: 20260821000000_create_kpi_targets.sql
--
-- Idempotent. Creates the `kpi_targets` table (and its RLS policies +
-- seed rows) if missing. Mirrors the KPI portion of
-- 20260818000000_payroll_leave_kpi.sql so it can be applied on its own
-- when the production database is behind on migrations.
--
-- Depends on the helper `public.is_admin_or_owner_v2()` (created by an
-- earlier migration). If that is also missing, run `supabase db push`
-- to apply all pending migrations instead.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL,                     -- daily_calls | daily_followups | daily_meetings | leads_worked | deals | revenue
  label TEXT DEFAULT '',
  target_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  period_type TEXT NOT NULL DEFAULT 'day',   -- day | week | month
  target_role TEXT NOT NULL DEFAULT 'all',   -- all | broker | telecaller | ...
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpi_targets_metric ON public.kpi_targets(metric, period_type);

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

-- ============================================================
-- Brokly CRM - Payroll, Leave, KPI Targets, Company Settings
-- Migration: 20260818000000_payroll_leave_kpi.sql
--
-- Adds the HR-finance layer required for a fully integrated CRM:
--   * configurable company working hours + flexible-hours mode
--   * configurable payroll rules (late / absence deductions, basis)
--   * leave/vacation requests with approval workflow
--   * payroll periods + auto-computed payroll entries (attendance-aware)
--   * KPI targets (configurable, per metric/period/role)
--   * lead rotation history log
--   * duplicate-lead attempt tracking (feeds admin notifications)
--   * lead.last_activity_at for inactivity-based rotation
--
-- Everything here is additive; existing tables are only extended.
-- ============================================================

-- ─── 1. COMPANY SETTINGS (key/value with JSONB values) ──────────────────────
CREATE TABLE IF NOT EXISTS public.company_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_read" ON public.company_settings;
CREATE POLICY "company_settings_read"
ON public.company_settings FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "company_settings_write" ON public.company_settings;
CREATE POLICY "company_settings_write"
ON public.company_settings FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- Seed default working hours + payroll rules (overridable in Admin).
INSERT INTO public.company_settings (key, value)
VALUES
  ('workingHours', '{"start":"12:00","end":"20:00","flexibleHours":false,"lateGraceMinutes":30,"workdays":[0,1,2,3,4,5,6]}'::jsonb),
  ('payrollRules', '{"dailySalaryBasis":26,"lateGraceMinutes":30,"deductPerLateMinute":0,"absenceDeductionPerDay":0,"overtimeEnabled":false,"overtimeRate":1.5,"commissionRate":0,"commissionBasis":"deal_value"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 2. EXTEND USER PROFILES (salary + employment) ──────────────────────────
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hire_date DATE,
ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active';

-- ─── 3. LEAVE REQUESTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'Annual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(4,1) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | cancelled
  reason TEXT DEFAULT '',
  approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON public.leave_requests(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_users_manage_own" ON public.leave_requests;
CREATE POLICY "leave_users_manage_own"
ON public.leave_requests FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "leave_admins_manage_all" ON public.leave_requests;
CREATE POLICY "leave_admins_manage_all"
ON public.leave_requests FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- ─── 4. PAYROLL PERIODS + ENTRIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',     -- draft | finalized
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_period_unique UNIQUE (period_start, period_end),
  CONSTRAINT payroll_period_valid CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,

  -- Attendance inputs (auto-computed, editable by admin)
  total_working_days NUMERIC(5,1) DEFAULT 0,
  attendance_days NUMERIC(5,1) DEFAULT 0,
  late_days NUMERIC(5,1) DEFAULT 0,
  late_minutes NUMERIC(8,0) DEFAULT 0,
  absence_days NUMERIC(5,1) DEFAULT 0,
  leave_days NUMERIC(5,1) DEFAULT 0,
  overtime_minutes NUMERIC(8,0) DEFAULT 0,

  -- Money inputs
  base_salary NUMERIC(12,2) DEFAULT 0,
  bonus NUMERIC(12,2) DEFAULT 0,
  commission NUMERIC(12,2) DEFAULT 0,
  expense_reimbursement NUMERIC(12,2) DEFAULT 0,
  other_deductions NUMERIC(12,2) DEFAULT 0,

  -- Computed amounts (derived, shown readonly)
  attendance_deduction NUMERIC(12,2) DEFAULT 0,
  late_deduction NUMERIC(12,2) DEFAULT 0,
  absence_deduction NUMERIC(12,2) DEFAULT 0,
  overtime_pay NUMERIC(12,2) DEFAULT 0,
  gross NUMERIC(12,2) DEFAULT 0,
  deductions_total NUMERIC(12,2) DEFAULT 0,
  net NUMERIC(12,2) DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft',     -- draft | approved | paid
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_entry_unique UNIQUE (period_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON public.payroll_periods(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON public.payroll_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_user ON public.payroll_entries(user_id);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_periods_admin" ON public.payroll_periods;
CREATE POLICY "payroll_periods_admin"
ON public.payroll_periods FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "payroll_entries_admin" ON public.payroll_entries;
CREATE POLICY "payroll_entries_admin"
ON public.payroll_entries FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- Employees may view their own payroll entries (their net pay).
DROP POLICY IF EXISTS "payroll_entries_own_view" ON public.payroll_entries;
CREATE POLICY "payroll_entries_own_view"
ON public.payroll_entries FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ─── 5. KPI TARGETS ─────────────────────────────────────────────────────────
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

-- ─── 6. LEAD ROTATION HISTORY ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_rotation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reason TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  rotated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rotation_log_lead ON public.lead_rotation_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_rotation_log_rotated ON public.lead_rotation_log(rotated_at DESC);

ALTER TABLE public.lead_rotation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rotation_log_admin" ON public.lead_rotation_log;
CREATE POLICY "rotation_log_admin"
ON public.lead_rotation_log FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- ─── 7. DUPLICATE LEAD ATTEMPTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.duplicate_lead_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matched_lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  attempted_lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  attempted_phone TEXT DEFAULT '',
  attempted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'flagged',    -- flagged | reviewed | merged | ignored
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dup_attempts_phone ON public.duplicate_lead_attempts(attempted_phone);
CREATE INDEX IF NOT EXISTS idx_dup_attempts_status ON public.duplicate_lead_attempts(status);

ALTER TABLE public.duplicate_lead_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dup_attempts_admin" ON public.duplicate_lead_attempts;
CREATE POLICY "dup_attempts_admin"
ON public.duplicate_lead_attempts FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "dup_attempts_insert_any" ON public.duplicate_lead_attempts;
CREATE POLICY "dup_attempts_insert_any"
ON public.duplicate_lead_attempts FOR INSERT TO authenticated
WITH CHECK (true);

-- ─── 8. LEADS: last_activity_at for inactivity-based rotation ───────────────
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON public.leads(last_activity_at DESC);

-- Touch last_activity_at whenever a comment is added to a lead.
CREATE OR REPLACE FUNCTION public.touch_lead_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.leads SET last_activity_at = now()
  WHERE id = COALESCE(NEW.lead_id, NEW.entity_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_lead_on_comment ON public.lead_comments;
CREATE TRIGGER trg_touch_lead_on_comment
  AFTER INSERT ON public.lead_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_activity();

DROP TRIGGER IF EXISTS trg_touch_lead_on_followup ON public.follow_ups;
CREATE TRIGGER trg_touch_lead_on_followup
  AFTER INSERT OR UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_activity();

DROP TRIGGER IF EXISTS trg_touch_lead_on_call ON public.call_logs;
CREATE TRIGGER trg_touch_lead_on_call
  AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_activity();

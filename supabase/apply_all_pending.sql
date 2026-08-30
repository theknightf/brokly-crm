-- ============================================================
-- Brokly CRM - ONE-TIME DB FIX (run in Supabase SQL Editor)
-- Fixes: missing user_profiles.base_salary, missing kpi_targets,
-- payroll/leave/company-settings tables, and the new tasks tables.
-- Fully idempotent - safe even if some objects already exist.
-- ============================================================
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

-- â”€â”€â”€ 1. COMPANY SETTINGS (key/value with JSONB values) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ 2. EXTEND USER PROFILES (salary + employment) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hire_date DATE,
ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active';

-- â”€â”€â”€ 3. LEAVE REQUESTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ 4. PAYROLL PERIODS + ENTRIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ 5. KPI TARGETS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ 6. LEAD ROTATION HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ 7. DUPLICATE LEAD ATTEMPTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ 8. LEADS: last_activity_at for inactivity-based rotation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


-- ─── PART 2: tasks + per-user completions + kpi_targets grants ──────────────────

-- ============================================================
-- Brokly CRM - Role tasks + user-facing KPI/task visibility
-- Migration: 20260822000000_tasks_and_role_kpis.sql
--
-- Adds:
--   * `tasks` - simple role-assigned to-dos (title, note, due date,
--     priority, target role) created by owners/admins.
--   * `task_completions` - per-user completion of a role task so each
--     member tracks their own "done" state.
--   * Safety: grants for `kpi_targets` (created by an earlier migration
--     without table grants) so the authenticated role can read/write it.
--   * Safety: re-creates the admin/owner helper used by RLS.
--
-- Fully idempotent.
-- ============================================================

-- â”€â”€â”€ 1. BASE GUARD (safe to redefine) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'owner')
  );
$$;

-- â”€â”€â”€ 2. TASKS (role-assigned to-dos) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  target_role TEXT NOT NULL DEFAULT 'all',   -- all | broker | senior_agent | agent | telecaller | ...
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'Medium',   -- High | Medium | Low
  assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_role_due ON public.tasks(target_role, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON public.tasks(created_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
CREATE POLICY "tasks_read"
  ON public.tasks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tasks_admin" ON public.tasks;
CREATE POLICY "tasks_admin"
  ON public.tasks FOR ALL TO authenticated
  USING (public.is_admin_or_owner_v2())
  WITH CHECK (public.is_admin_or_owner_v2());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

-- â”€â”€â”€ 3. TASK COMPLETIONS (per-user done state) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.task_completions (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_user ON public.task_completions(user_id);

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_completions_read" ON public.task_completions;
CREATE POLICY "task_completions_read"
  ON public.task_completions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "task_completions_insert" ON public.task_completions;
CREATE POLICY "task_completions_insert"
  ON public.task_completions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "task_completions_delete" ON public.task_completions;
CREATE POLICY "task_completions_delete"
  ON public.task_completions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

GRANT SELECT, INSERT, DELETE ON public.task_completions TO authenticated;

-- â”€â”€â”€ 4. SAFETY: ensure kpi_targets has table grants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_targets TO authenticated;
-- Final: refresh PostgREST schema cache so old "schema cache" errors clear.
NOTIFY pgrst, 'reload schema';

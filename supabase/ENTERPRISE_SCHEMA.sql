-- ============================================================
-- Brokly CRM — Enterprise Consolidated Schema (Spec Deliverable)
-- Single Source of Truth SQL mirroring prisma/schema.prisma
-- Run via: psql $DATABASE_URL -f supabase/ENTERPRISE_SCHEMA.sql
-- or Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── 0. Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. User (user_profiles) ───────────────────────────────
-- Spec: User (id, name, email, phone, role: OWNER_ADMIN | SALES, baseSalary, targetKPIs)
-- Actual: user_profiles (id UUID FK auth.users, full_name, email, phone, role, base_salary, employment_status, hire_date, is_active)
-- Role mapping: OWNER_ADMIN unified dashboard role covers both owner & admin; SALES covers agent/broker/telecaller etc.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','OWNER_ADMIN','SALES','broker','branch_manager','senior_agent','agent','telecaller','team_leader')),
  base_salary NUMERIC(12,2) DEFAULT 0,
  target_kpis JSONB DEFAULT '{}'::jsonb,
  brokerage_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  hire_date DATE,
  employment_status TEXT DEFAULT 'active',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- ─── 2. Lead ───────────────────────────────────────────────
-- Spec: Lead (id, name, phone, email, stage, assignedToUserId) + stages: New Fresh, New Cold, Leads Pending, Calls Answer, No Answer, Cancel, D.Deal + All Stages View
-- Actual: leads with crm_status (pipeline) + lead_status (legacy) + assigned_to FK + dedup columns
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(phone,''), '\D', '', 'g')) STORED,
  email TEXT DEFAULT '',
  email_normalized TEXT GENERATED ALWAYS AS (lower(trim(COALESCE(email,'')))) STORED,
  crm_status TEXT DEFAULT 'Fresh Leads', -- spec alias: stage
  lead_status TEXT DEFAULT 'New',
  assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  source TEXT DEFAULT '',
  location TEXT DEFAULT '',
  developer TEXT DEFAULT '',
  project TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  property_type TEXT DEFAULT '',
  budget_min NUMERIC(12,2) DEFAULT 0,
  budget_max NUMERIC(12,2) DEFAULT 0,
  follow_up_due DATE DEFAULT CURRENT_DATE,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(crm_status);
-- Global deduplication (spec 2.C): phone/email unique globally, raises 23505 on duplicate → API returns 409 with redirect link
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_normalized_unique ON public.leads(phone_normalized) WHERE phone_normalized <> '' AND char_length(phone_normalized) >= 8;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_normalized_unique ON public.leads(email_normalized) WHERE email_normalized <> '';

-- ─── 3. CallLog ─────────────────────────────────────────────
-- Spec: CallLog (id, userId, leadId, durationSeconds, outcome, notes, isValid, isFlagged)
-- Rules: <30s → NOT_INTERESTED + isValid=false + locked; >=30s → manual outcome + notes min 20; >45min → isFlagged=true; anti-overlap via 2-min window check
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  entity_type TEXT DEFAULT 'lead',
  entity_id TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  channel TEXT DEFAULT 'Call',
  direction TEXT DEFAULT 'outgoing',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'NOT_INTERESTED',
  notes TEXT DEFAULT '',
  is_valid BOOLEAN DEFAULT true,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT DEFAULT '',
  project_name TEXT DEFAULT '',
  client_ref TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON public.call_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON public.call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_flagged ON public.call_logs(is_flagged) WHERE is_flagged = true;

-- Trigger: auto-create FollowUpTask when outcome = FOLLOW_UP
CREATE OR REPLACE FUNCTION public.auto_create_followup_task()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_lead UUID; v_scheduled TIMESTAMPTZ;
BEGIN
  IF NEW.outcome = 'FOLLOW_UP' AND NEW.is_valid = true THEN
    v_lead := NEW.lead_id;
    IF v_lead IS NULL AND NEW.entity_type='lead' THEN
      BEGIN v_lead := NEW.entity_id::uuid; EXCEPTION WHEN OTHERS THEN v_lead := NULL; END;
    END IF;
    BEGIN v_scheduled := (NEW.notes::jsonb->>'followUpDateTime')::timestamptz; EXCEPTION WHEN OTHERS THEN v_scheduled := NOW() + INTERVAL '1 day'; END;
    IF v_scheduled IS NULL THEN v_scheduled := NOW() + INTERVAL '1 day'; END IF;
    INSERT INTO public.follow_up_tasks (call_log_id, user_id, lead_id, scheduled_at, status, notes)
    VALUES (NEW.id, NEW.user_id, v_lead, v_scheduled, 'PENDING', COALESCE(NEW.notes,''));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_auto_followup_task ON public.call_logs;
CREATE TRIGGER trg_auto_followup_task AFTER INSERT ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.auto_create_followup_task();

-- ─── 4. FollowUpTask ────────────────────────────────────────
-- Spec: FollowUpTask (id, callLogId, userId, leadId, scheduledAt, status)
CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','OVERDUE','CANCELLED')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fut_user ON public.follow_up_tasks(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_fut_lead ON public.follow_up_tasks(lead_id);

-- ─── 5. Attendance ─────────────────────────────────────────
-- Spec: Attendance (id, userId, checkIn, checkOut, delayMinutes, isLate)
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  delay_minutes INTEGER DEFAULT 0,
  is_late BOOLEAN DEFAULT false,
  late_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON public.attendance(user_id, attendance_date DESC);

-- ─── 6. Evaluation ─────────────────────────────────────────
-- Spec: Evaluation (id, employeeId, evaluatorId, dressCodeRating, notes, date)
CREATE TABLE IF NOT EXISTS public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  dress_code_rating SMALLINT NOT NULL CHECK (dress_code_rating BETWEEN 1 AND 5),
  notes TEXT DEFAULT '',
  behavioral_flags TEXT[] DEFAULT '{}',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, date, evaluator_id)
);
CREATE INDEX IF NOT EXISTS idx_evaluations_emp_date ON public.evaluations(employee_id, date DESC);
-- DressScore helper for leaderboard weight (30%)
CREATE OR REPLACE FUNCTION public.dress_score_for_user(p_user_id UUID, p_start DATE, p_end DATE) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE(ROUND(AVG(dress_code_rating)/5.0*100)::INTEGER,0) FROM public.evaluations WHERE employee_id=p_user_id AND date BETWEEN p_start AND p_end;
$$;

-- ─── 7. PayrollDeduction ────────────────────────────────────
-- Spec: PayrollDeduction (id, userId, sourceRef, reason, amount, monthYear, isApplied)
-- Sources: attendance tardiness | dress_code | low_kpi (<60%)
CREATE TABLE IF NOT EXISTS public.payroll_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  source_ref TEXT NOT NULL DEFAULT '', -- attendance_tardiness | dress_code | low_kpi
  reason TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  month_year TEXT NOT NULL, -- YYYY-MM
  is_applied BOOLEAN DEFAULT false,
  payroll_entry_id UUID REFERENCES public.payroll_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payroll_ded_user_month ON public.payroll_deductions(user_id, month_year);
-- Dispatcher: instant notification on insert
CREATE OR REPLACE FUNCTION public.dispatch_deduction_notification() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, deduction_id, title, message, amount, reason, reference_link, channel)
  VALUES (NEW.user_id, NEW.id, 'Deduction Alert / إشعار خصم', NEW.reason, NEW.amount, NEW.source_ref, '/dashboard?tab=payroll&month='||NEW.month_year, 'in_app');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_dispatch_deduction ON public.payroll_deductions;
CREATE TRIGGER trg_dispatch_deduction AFTER INSERT ON public.payroll_deductions FOR EACH ROW EXECUTE FUNCTION public.dispatch_deduction_notification();

-- ─── 8. Notification ───────────────────────────────────────
-- Spec: Notification (id, userId, deductionId, title, message, isRead, createdAt)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  deduction_id UUID REFERENCES public.payroll_deductions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  reason TEXT DEFAULT '',
  reference_link TEXT DEFAULT '/dashboard?tab=payroll',
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app','push','email','slack')),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read, created_at DESC);

-- ─── 9. Leaderboard formula (DB view helper) ───────────────
-- Total Score = ValidCallsScore*0.40 + AttendanceScore*0.30 + DressCodeScore*0.30
-- See /api/leaderboard and /api/dashboard/unified-master for weighted calculation

-- ─── 10. RLS (minimal — tighten per is_admin_or_owner_v2 in prod) ─
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- (Policies already defined in incremental migrations — see supabase/migrations/*)

NOTIFY pgrst, 'reload schema';

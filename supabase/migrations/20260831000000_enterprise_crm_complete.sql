-- ============================================================
-- Enterprise CRM Complete: Call validation, FollowUpTask, PayrollDeduction, NotificationLog
-- Migration: 20260831000000_enterprise_crm_complete.sql
-- ============================================================

-- 1. CallLogs: anti-fraud flags
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT true;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS flag_reason TEXT DEFAULT '';
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON public.call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON public.call_logs(user_id, created_at DESC);

-- 2. Attendance: persisted delayMinutes/isLate (fix hardcoded 12:30)
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS delay_minutes INTEGER DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS late_reason TEXT DEFAULT '';

-- Backfill existing rows using company_settings workingHours (fallback 12:30)
DO $$
DECLARE
  v_start_minutes INTEGER := 12*60;
  v_grace INTEGER := 30;
  r RECORD;
BEGIN
  SELECT COALESCE((value->>'lateGraceMinutes')::int, 30) INTO v_grace FROM public.company_settings WHERE key='workingHours' LIMIT 1;
  -- not critical if missing, use 30
  FOR r IN SELECT id, check_in_time FROM public.attendance WHERE delay_minutes IS NULL OR delay_minutes=0 LOOP
    UPDATE public.attendance SET
      delay_minutes = GREATEST(0, EXTRACT(HOUR FROM check_in_time AT TIME ZONE 'UTC')::int*60 + EXTRACT(MINUTE FROM check_in_time AT TIME ZONE 'UTC')::int - (v_start_minutes + v_grace)),
      is_late = (EXTRACT(HOUR FROM check_in_time AT TIME ZONE 'UTC')::int*60 + EXTRACT(MINUTE FROM check_in_time AT TIME ZONE 'UTC')::int > v_start_minutes + v_grace)
    WHERE id = r.id;
  END LOOP;
END $$;

-- 3. FollowUpTask: enterprise multi-task per lead (separate from follow_ups single-row)
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
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_user ON public.follow_up_tasks(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_lead ON public.follow_up_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_status ON public.follow_up_tasks(status);

ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_up_tasks_select ON public.follow_up_tasks;
CREATE POLICY follow_up_tasks_select ON public.follow_up_tasks FOR SELECT USING (is_admin_or_owner_v2() OR user_id = auth.uid() OR is_same_team(user_id));
DROP POLICY IF EXISTS follow_up_tasks_write ON public.follow_up_tasks;
CREATE POLICY follow_up_tasks_write ON public.follow_up_tasks FOR ALL USING (is_admin_or_owner_v2() OR user_id = auth.uid()) WITH CHECK (is_admin_or_owner_v2() OR user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_tasks TO authenticated;

-- 4. PayrollDeduction: auditable line-items
CREATE TABLE IF NOT EXISTS public.payroll_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  source_ref TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  month_year TEXT NOT NULL, -- YYYY-MM
  is_applied BOOLEAN DEFAULT false,
  payroll_entry_id UUID REFERENCES public.payroll_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payroll_ded_user_month ON public.payroll_deductions(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_payroll_ded_applied ON public.payroll_deductions(is_applied);
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_ded_select ON public.payroll_deductions;
CREATE POLICY payroll_ded_select ON public.payroll_deductions FOR SELECT USING (is_admin_or_owner_v2() OR user_id = auth.uid());
DROP POLICY IF EXISTS payroll_ded_write ON public.payroll_deductions;
CREATE POLICY payroll_ded_write ON public.payroll_deductions FOR ALL USING (is_admin_or_owner_v2()) WITH CHECK (is_admin_or_owner_v2());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_deductions TO authenticated;

-- 5. NotificationLog: dispatcher audit (in-app + push)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  deduction_id UUID REFERENCES public.payroll_deductions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  reason TEXT DEFAULT '',
  reference_link TEXT DEFAULT '',
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app','push','email','slack')),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_ded ON public.notifications(deduction_id);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select ON public.notifications FOR SELECT USING (is_admin_or_owner_v2() OR user_id = auth.uid());
DROP POLICY IF EXISTS notif_write ON public.notifications;
CREATE POLICY notif_write ON public.notifications FOR ALL USING (is_admin_or_owner_v2()) WITH CHECK (is_admin_or_owner_v2());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- 6. Lead stage hardening: ensure crm_status has known values (no enum lock to allow Admin settings sync, but add check via allowed list soft)
-- Add dedup support: normalized phone/email generated columns + unique partial indexes for global dedup
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(phone,''), '\D', '', 'g')) STORED;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_normalized TEXT GENERATED ALWAYS AS (lower(trim(COALESCE(email,'')))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_normalized_unique ON public.leads(phone_normalized) WHERE phone_normalized <> '' AND char_length(phone_normalized) >= 8;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_normalized_unique ON public.leads(email_normalized) WHERE email_normalized <> '';

-- 7. Trigger: auto-create FollowUpTask on call outcome FOLLOW_UP
CREATE OR REPLACE FUNCTION public.auto_create_followup_task()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lead UUID;
  v_scheduled TIMESTAMPTZ;
BEGIN
  IF NEW.outcome = 'FOLLOW_UP' AND NEW.is_valid = true THEN
    v_lead := NEW.lead_id;
    IF v_lead IS NULL AND NEW.entity_type='lead' THEN
      BEGIN v_lead := NEW.entity_id::uuid; EXCEPTION WHEN OTHERS THEN v_lead := NULL; END;
    END IF;
    v_scheduled := COALESCE((NEW.notes::jsonb->>'followUpDateTime')::timestamptz, NOW() + INTERVAL '1 day');
    -- notes must contain followUpDateTime json or fallback
    INSERT INTO public.follow_up_tasks (call_log_id, user_id, lead_id, scheduled_at, status, notes)
    VALUES (NEW.id, NEW.user_id, v_lead, v_scheduled, 'PENDING', COALESCE(NEW.notes,''));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_auto_followup_task ON public.call_logs;
CREATE TRIGGER trg_auto_followup_task AFTER INSERT ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.auto_create_followup_task();

-- 8. Notification dispatcher helper: call from payroll engine
CREATE OR REPLACE FUNCTION public.dispatch_deduction_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, deduction_id, title, message, amount, reason, reference_link, channel)
  VALUES (
    NEW.user_id,
    NEW.id,
    'Deduction Alert / إشعار خصم',
    NEW.reason,
    NEW.amount,
    NEW.source_ref,
    '/dashboard?tab=payroll&month=' || NEW.month_year,
    'in_app'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_dispatch_deduction ON public.payroll_deductions;
CREATE TRIGGER trg_dispatch_deduction AFTER INSERT ON public.payroll_deductions FOR EACH ROW EXECUTE FUNCTION public.dispatch_deduction_notification();

NOTIFY pgrst, 'reload schema';

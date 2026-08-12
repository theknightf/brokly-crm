-- ============================================================
-- Brokly CRM - Harden activity & auth provisioning triggers
-- Migration: 20260815000000_harden_activity_and_auth_triggers.sql
--
-- WHY:
--   Bug 1 (lead stage change fails): the AFTER UPDATE trigger
--   trg_log_lead writes to activity_log unconditionally. If that
--   table is missing (see 20260814000000) or an insert fails for
--   any reason (RLS, FK, privilege), the WHOLE leads UPDATE is
--   aborted -- so "changing a lead's stage" errors out and the
--   status never saves. Logging must NEVER break the primary write.
--
--   Bug 2 (creating a new user fails): handle_new_user runs AFTER
--   INSERT on auth.users and inserts into user_profiles. If that
--   insert fails (missing column, bad role cast, RLS, etc.) the
--   ENTIRE auth user creation is aborted by Supabase.
--
--   Fix: every audit/provisioning trigger becomes best-effort --
--   failures are swallowed and logged to a console RAISE NOTICE so
--   the primary operation always succeeds. The activity_log table
--   is also re-asserted idempotently as a safety net.
--
-- Safe to run on any database (every statement is idempotent).
-- ============================================================

-- ─── 1. SAFETY NET: RE-ASSERT activity_log + grants ─────────────────────────

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

DROP POLICY IF EXISTS "read_activity_log" ON public.activity_log;
CREATE POLICY "read_activity_log"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2() OR user_id = auth.uid());

DROP POLICY IF EXISTS "write_activity_log" ON public.activity_log;
CREATE POLICY "write_activity_log"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;

-- ─── 2. BEST-EFFORT LEAD LOGGING (Bug 1 root fix) ───────────────────────────

CREATE OR REPLACE FUNCTION public.log_lead_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
      VALUES (auth.uid(), 'Lead Added', 'lead', NEW.id::text, NEW.name);
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
        VALUES (auth.uid(), 'Lead Assigned', 'lead', NEW.id::text, NEW.name,
                COALESCE(OLD.assigned_to::text,'') || ' -> ' || COALESCE(NEW.assigned_to::text,''));
      ELSIF OLD.crm_status IS DISTINCT FROM NEW.crm_status THEN
        INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
        VALUES (auth.uid(), 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
                COALESCE(OLD.crm_status::text,'') || ' -> ' || COALESCE(NEW.crm_status::text,''));
      ELSIF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
        INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
        VALUES (auth.uid(), 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
                COALESCE(OLD.lead_status::text,'') || ' -> ' || COALESCE(NEW.lead_status::text,''));
      ELSE
        INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
        VALUES (auth.uid(), 'Lead Updated', 'lead', NEW.id::text, NEW.name);
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
      VALUES (auth.uid(), 'Lead Deleted', 'lead', OLD.id::text, OLD.name);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'log_lead_change skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ─── 3. BEST-EFFORT FOLLOW-UP LOGGING ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_follow_up_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'log_follow_up_change skipped: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

-- ─── 4. BEST-EFFORT COMMENT LOGGING ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_comment_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (auth.uid(), 'Comment Added', 'lead_comment', NEW.lead_id::text, LEFT(NEW.body, 80));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'log_comment_added skipped: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

-- ─── 5. BEST-EFFORT CALL LOGGING ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_call_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'log_call_added skipped: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

-- ─── 6. BEST-EFFORT ATTENDANCE LOGGING ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_attendance_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'log_attendance_change skipped: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

-- ─── 7. HARDEN AUTH PROVISIONING (Bug 2 root fix) ────────────────────────────
-- Profile creation must never abort auth user creation. Invalid/unknown roles
-- are normalized to 'agent' instead of raising a cast error.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_allowed TEXT[] := ARRAY[
    'owner','admin','broker','branch_manager','senior_agent','agent','telecaller'
  ];
BEGIN
  IF v_role IS NULL OR NOT v_role = ANY(v_allowed) THEN
    v_role := 'agent';
  END IF;

  BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role, brokerage_name, phone)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
      v_role::public.user_role,
      COALESCE(NEW.raw_user_meta_data->>'brokerage_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', '')
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'handle_new_user skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Refresh PostgREST's schema cache so the new table shapes are queryable.
NOTIFY pgrst, 'reload schema';

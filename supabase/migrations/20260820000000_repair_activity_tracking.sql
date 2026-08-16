-- ============================================================
-- Brokly CRM - Repair activity tracking (leaderboard "Actions")
-- Migration: 20260820000000_repair_activity_tracking.sql
--
-- WHY: The leaderboard "Actions" metric counts activity_log rows
-- per user_id. That data is only written by DB triggers
-- (trg_log_lead / trg_log_follow_up / trg_log_call / trg_log_comment
-- / trg_log_attendance). If the live database is missing those
-- triggers/tables (earlier migrations not fully applied — the same
-- root cause as 20260814000000), actions are silently never
-- recorded and the leaderboard shows 0.
--
-- This migration re-asserts the ENTIRE stack idempotently and is
-- safe on any database state: tables, indexes, RLS + policies,
-- grants, and every logging trigger. Each trigger creation is
-- guarded so a missing table can never abort the migration.
-- ============================================================

-- ─── 1. BASE GUARD: is_admin_or_owner_v2 (used by RLS policies) ─────────────

CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'owner')
  );
$$;

-- ─── 2. ACTIVITY LOG TABLE ───────────────────────────────────────────────────

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
ALTER TABLE public.activity_log REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "read_activity_log" ON public.activity_log;
CREATE POLICY "read_activity_log"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2() OR user_id = auth.uid());

DROP POLICY IF EXISTS "write_activity_log" ON public.activity_log;
CREATE POLICY "write_activity_log"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;

-- ─── 3. LOGGING FUNCTIONS + TRIGGERS (best-effort, never break writes) ───────

-- Leads: Lead Added / Lead Assigned / Lead Status Updated / Lead Updated / Deleted
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
END $$;

-- Follow-ups
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

-- Lead comments
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

-- Call logs (the critical productivity action)
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

-- Attendance check-in / check-out
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

-- Attach triggers only where their base table exists (never fail the migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_log_lead ON public.leads;
    CREATE TRIGGER trg_log_lead
      AFTER INSERT OR UPDATE OR DELETE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION public.log_lead_change();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follow_ups') THEN
    DROP TRIGGER IF EXISTS trg_log_follow_up ON public.follow_ups;
    CREATE TRIGGER trg_log_follow_up
      AFTER INSERT OR UPDATE OR DELETE ON public.follow_ups
      FOR EACH ROW EXECUTE FUNCTION public.log_follow_up_change();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lead_comments') THEN
    DROP TRIGGER IF EXISTS trg_log_comment ON public.lead_comments;
    CREATE TRIGGER trg_log_comment
      AFTER INSERT ON public.lead_comments
      FOR EACH ROW EXECUTE FUNCTION public.log_comment_added();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'call_logs') THEN
    DROP TRIGGER IF EXISTS trg_log_call ON public.call_logs;
    CREATE TRIGGER trg_log_call
      AFTER INSERT ON public.call_logs
      FOR EACH ROW EXECUTE FUNCTION public.log_call_added();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'attendance') THEN
    DROP TRIGGER IF EXISTS trg_log_attendance ON public.attendance;
    CREATE TRIGGER trg_log_attendance
      AFTER INSERT OR UPDATE ON public.attendance
      FOR EACH ROW EXECUTE FUNCTION public.log_attendance_change();
  END IF;
END $$;

-- ─── 4. REALTIME (so dashboards refresh live on new activity) ─────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;
END $$;

-- Refresh PostgREST's schema cache so everything is immediately queryable.
NOTIFY pgrst, 'reload schema';
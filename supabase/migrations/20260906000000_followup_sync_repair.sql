-- ============================================================
-- Brokly CRM — Follow-up sync repair
-- Migration: 20260906000000_followup_lead_sync_repair.sql
--
-- PROBLEM (prod-verified): leads carry follow_up_due dates but the
-- follow_ups table stays EMPTY, so Follow-ups / Workspace / Dashboard
-- sections never show scheduled reminders. Two compounding causes:
--   1. This trigger was never applied (or an older version skips
--      'No Answer' — yet No Answer + a retry date IS the retry queue
--      and must persist as a Pending reminder).
--   2. The client fallback upsert needs the uq_follow_ups_lead_id
--      constraint + RLS INSERT/UPDATE policies that may be missing.
--
-- This migration is fully idempotent (safe to re-run). The app also
-- syncs server-side via POST /api/follow-ups/sync, so reminders work
-- even before this file is applied.
-- ============================================================

-- ─── 1. Link + uniqueness (idempotent) ────────────────────────
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_follow_ups_lead_id') THEN
    ALTER TABLE public.follow_ups ADD CONSTRAINT uq_follow_ups_lead_id UNIQUE (lead_id);
  END IF;
END $$;

DROP INDEX IF EXISTS uq_follow_ups_lead_id;

-- ─── 2. Fixed auto-sync trigger ───────────────────────────────
-- - A due date on a LIVE stage (incl. No Answer retry) → upsert Pending row.
-- - Move to a truly terminal stage → Cancel the open reminder (no stale rows).
CREATE OR REPLACE FUNCTION public.sync_follow_up_from_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := COALESCE(NEW.crm_status, NEW.lead_status::TEXT, '');
  v_terminal TEXT[] := ARRAY[
    'Done Deal', 'Not Interested', 'Cancellation', 'Duplicate Leads',
    'Wrong Number', 'Closed Number',
    'Low Budget', 'Data Rotation', 'Won', 'Lost'
  ];
  v_due DATE := NEW.follow_up_due;
  v_assignee UUID := COALESCE(NEW.assigned_to, NEW.created_by);
BEGIN
  -- Terminal stage → cancel any open reminder for this lead.
  IF v_status = ANY(v_terminal) THEN
    UPDATE public.follow_ups
       SET follow_up_status = 'Cancelled', updated_at = now()
     WHERE lead_id = NEW.id
       AND follow_up_status NOT IN ('Completed', 'Cancelled');
    RETURN NEW;
  END IF;

  -- No due date → nothing to schedule.
  IF v_due IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.follow_ups (
    lead_id, title, contact_name, contact_type, contact_phone, contact_email,
    follow_up_type, follow_up_status, priority, due_date, due_time,
    agent, agent_initials, notes, property_interest, relationship_status,
    created_by, created_at, updated_at
  ) VALUES (
    NEW.id,
    'Follow up: ' || NEW.name,
    COALESCE(NEW.name, ''),
    'Lead',
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.email, ''),
    'Call', 'Pending', 'Medium',
    v_due, '09:00',
    COALESCE(NEW.agent, ''), COALESCE(NEW.agent_initials, ''),
    COALESCE(NEW.notes, ''), COALESCE(NEW.property_type, ''),
    'New', v_assignee,
    COALESCE(NEW.created_at, now()), now()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    due_date          = EXCLUDED.due_date,
    contact_name      = EXCLUDED.contact_name,
    contact_phone     = EXCLUDED.contact_phone,
    contact_email     = EXCLUDED.contact_email,
    agent             = EXCLUDED.agent,
    agent_initials    = EXCLUDED.agent_initials,
    notes             = EXCLUDED.notes,
    property_interest = EXCLUDED.property_interest,
    updated_at        = now(),
    follow_up_status  = CASE
      WHEN follow_ups.follow_up_status IN ('Completed', 'Cancelled')
      THEN 'Pending' ELSE follow_ups.follow_up_status
    END;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_follow_up_from_lead ON public.leads;
CREATE TRIGGER trg_follow_up_from_lead
  AFTER INSERT OR UPDATE OF crm_status, lead_status, follow_up_due, assigned_to
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_follow_up_from_lead();

-- ─── 3. Realtime (idempotent) ─────────────────────────────────
ALTER TABLE public.follow_ups REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'follow_ups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
  END IF;
END $$;

-- ─── 4. RLS policies (idempotent) ─────────────────────────────
-- App behavior: every signed-in member reads follow-ups (pages show all);
-- writes allowed to admins/owners + the row owner (created_by).
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follow_ups' AND policyname='follow_ups_select_all') THEN
    CREATE POLICY follow_ups_select_all ON public.follow_ups
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follow_ups' AND policyname='follow_ups_insert_owner_admin') THEN
    CREATE POLICY follow_ups_insert_owner_admin ON public.follow_ups
      FOR INSERT TO authenticated WITH CHECK (
        created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM public.user_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager')
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follow_ups' AND policyname='follow_ups_update_owner_admin') THEN
    CREATE POLICY follow_ups_update_owner_admin ON public.follow_ups
      FOR UPDATE TO authenticated USING (
        created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM public.user_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager')
        )
      ) WITH CHECK (
        created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM public.user_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager')
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follow_ups' AND policyname='follow_ups_delete_admin') THEN
    CREATE POLICY follow_ups_delete_admin ON public.follow_ups
      FOR DELETE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager')
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

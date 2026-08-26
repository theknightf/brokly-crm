-- ============================================================
-- Brokly CRM - Follow-up auto-sync from leads + notifications realtime
-- Migration: 20260807000000_followup_lead_sync_and_realtime.sql
--
-- 1. BLOCKING BUG FIX: Setting a lead's status to a follow-up stage (e.g.
--    "Following Up", "Interested", "Meeting") or giving it a follow-up date
--    never created a row in `follow_ups`, so the Follow-ups page was always
--    empty for leads. This adds a `lead_id` link on follow_ups and a trigger
--    that auto-creates/updates the follow-up whenever a lead is inserted or
--    when its status or follow-up date changes.
--
-- 2. Enables Supabase Realtime broadcast for `activity_log` (notifications)
--    and `follow_ups` (workspace/dashboard live updates) so clients receive
--    changes immediately instead of only via polling fallback.
-- ============================================================

-- ─── 1. LINK FOLLOW-UPS BACK TO LEADS ───────────────────────────────────────

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- One scheduled follow-up per lead (re-saving moves the same row). A plain
-- unique constraint (not a partial index) is used so it works both in the
-- trigger's raw SQL and with the client's PostgREST ON CONFLICT (lead_id).
ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS uq_follow_ups_lead_id;
DROP INDEX IF EXISTS uq_follow_ups_lead_id;
ALTER TABLE public.follow_ups
  ADD CONSTRAINT uq_follow_ups_lead_id UNIQUE (lead_id) DEFERRABLE INITIALLY IMMEDIATE;

-- ─── 2. AUTO-CREATE A FOLLOW-UP FROM A LEAD ────────────────────────────────

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
    'Wrong Number', 'Closed Number', 'No Answer', 'No Answer At All',
    'Low Budget', 'Data Rotation', 'Won', 'Lost'
  ];
  v_due DATE := NEW.follow_up_due;
  v_assignee UUID := COALESCE(NEW.assigned_to, NEW.created_by);
BEGIN
  -- No follow-up needed (no due date, or a closed/terminal stage).
  IF v_due IS NULL OR v_status = ANY(v_terminal) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.follow_ups (
    lead_id,
    title,
    contact_name,
    contact_type,
    contact_phone,
    contact_email,
    follow_up_type,
    follow_up_status,
    priority,
    due_date,
    due_time,
    agent,
    agent_initials,
    notes,
    property_interest,
    relationship_status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    'Follow up: ' || NEW.name,
    COALESCE(NEW.name, ''),
    'Lead'::public.contact_type,
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.email, ''),
    'Call'::public.follow_up_type,
    'Pending'::public.follow_up_status,
    'Medium'::public.follow_up_priority,
    v_due,
    '09:00',
    COALESCE(NEW.agent, ''),
    COALESCE(NEW.agent_initials, ''),
    COALESCE(NEW.notes, ''),
    COALESCE(NEW.property_type, ''),
    'New'::public.relationship_status,
    v_assignee,
    COALESCE(NEW.created_at, now()),
    now()
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
    -- Re-open a previously completed follow-up when the lead is re-followed.
    follow_up_status  = CASE
      WHEN follow_ups.follow_up_status IN ('Completed', 'Cancelled')
      THEN 'Pending'::public.follow_up_status
      ELSE follow_ups.follow_up_status
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_up_from_lead ON public.leads;
CREATE TRIGGER trg_follow_up_from_lead
  AFTER INSERT OR UPDATE OF crm_status, lead_status, follow_up_due, assigned_to
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_follow_up_from_lead();

-- ─── 3. REALTIME FOR NOTIFICATIONS + WORKSPACE ─────────────────────────────
-- Broadcast activity_log (in-app notification feed) and follow_ups
-- (workspace/dashboard) INSERT/UPDATE/DELETE events so live clients update
-- instantly. Replica identity FULL is needed for UPDATE/DELETE payloads.

ALTER TABLE public.activity_log REPLICA IDENTITY FULL;
ALTER TABLE public.follow_ups REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'follow_ups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
  END IF;
END $$;
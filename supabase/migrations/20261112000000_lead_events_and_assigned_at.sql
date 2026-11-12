-- Lead drawer: assign date + a clean, trigger-only event history per lead.
-- The next action date stays leads.follow_up_due (already used by the follow-ups page, the app and triggers).

-- 1. When the lead was last given to its current owner.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE OR REPLACE FUNCTION public.leads_set_assigned_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.assigned_at := COALESCE(NEW.assigned_at, now());
    END IF;
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    NEW.assigned_at := CASE WHEN NEW.assigned_to IS NULL THEN OLD.assigned_at ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_assigned_at ON public.leads;
CREATE TRIGGER trg_leads_set_assigned_at
  BEFORE INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_set_assigned_at();

-- 2. Event history. Written only by the triggers below (any client: website, app, imports, API).
CREATE TABLE IF NOT EXISTS public.lead_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  type       text NOT NULL CHECK (type IN ('created', 'assigned', 'stage', 'priority', 'next_action', 'note')),
  old_value  text,
  new_value  text,
  ref_id     uuid,          -- e.g. the lead_comments row for 'note'
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_time ON public.lead_events (lead_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_actor ON public.lead_events (actor_id);

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.lead_events FROM anon, authenticated;
GRANT SELECT ON public.lead_events TO authenticated;

-- Same visibility as the lead (can_access_lead applies the lead rules, incl. hidden duplicates).
DROP POLICY IF EXISTS lead_events_select ON public.lead_events;
CREATE POLICY lead_events_select ON public.lead_events FOR SELECT TO authenticated
  USING (public.can_access_lead(lead_id));

-- 3. Triggers that write it.
CREATE OR REPLACE FUNCTION public.lead_events_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(auth.uid(), NEW.last_action_by, NEW.created_by);
  v_prev  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_events (lead_id, actor_id, type, new_value, created_at)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.created_by), 'created', NEW.crm_status, COALESCE(NEW.created_at, now()));
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- A reassignment from the Leads page clears the owner first (assignee list replaced), then sets the new one.
    -- Skip the intermediate "no owner" step and report the move as previous owner -> new owner.
    IF NEW.assigned_to IS NULL AND pg_trigger_depth() > 1 THEN
      NULL;
    ELSE
      v_prev := OLD.assigned_to::text;
      IF v_prev IS NULL THEN
        SELECT e.new_value INTO v_prev FROM public.lead_events e
         WHERE e.lead_id = NEW.id AND e.type = 'assigned'
         ORDER BY e.created_at DESC, e.id DESC LIMIT 1;
      END IF;
      IF v_prev IS DISTINCT FROM NEW.assigned_to::text THEN
        INSERT INTO public.lead_events (lead_id, actor_id, type, old_value, new_value)
        VALUES (NEW.id, v_actor, 'assigned', v_prev, NEW.assigned_to::text);
      END IF;
    END IF;
  END IF;

  IF NEW.crm_status IS DISTINCT FROM OLD.crm_status THEN
    INSERT INTO public.lead_events (lead_id, actor_id, type, old_value, new_value)
    VALUES (NEW.id, v_actor, 'stage', OLD.crm_status, NEW.crm_status);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.lead_events (lead_id, actor_id, type, old_value, new_value)
    VALUES (NEW.id, v_actor, 'priority', OLD.priority, NEW.priority);
  END IF;

  IF NEW.follow_up_due IS DISTINCT FROM OLD.follow_up_due THEN
    INSERT INTO public.lead_events (lead_id, actor_id, type, old_value, new_value)
    VALUES (NEW.id, v_actor, 'next_action', OLD.follow_up_due::text, NEW.follow_up_due::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_events_from_lead ON public.leads;
CREATE TRIGGER trg_lead_events_from_lead
  AFTER INSERT OR UPDATE OF assigned_to, crm_status, priority, follow_up_due ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_events_from_lead();

CREATE OR REPLACE FUNCTION public.lead_events_from_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only notes a person wrote (not the automatic phone call-sync lines).
  IF NEW.lead_id IS NOT NULL AND public.is_written_comment(NEW.body) THEN
    INSERT INTO public.lead_events (lead_id, actor_id, type, ref_id, created_at)
    VALUES (NEW.lead_id, COALESCE(NEW.user_id, auth.uid()), 'note', NEW.id, COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_events_from_comment ON public.lead_comments;
CREATE TRIGGER trg_lead_events_from_comment
  AFTER INSERT ON public.lead_comments
  FOR EACH ROW EXECUTE FUNCTION public.lead_events_from_comment();

REVOKE EXECUTE ON FUNCTION public.lead_events_from_lead() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.lead_events_from_comment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.leads_set_assigned_at() FROM anon, authenticated, public;

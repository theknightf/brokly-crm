-- Action Taken: track when a lead was last worked on (call, note, status, follow-up)
-- Replaces the narrow "Contacted" (call+follow_up.created_at) with a comprehensive
-- activity timestamp that covers every key interaction. The leads list filter
-- "Action Taken (Today / No Action)" reads this column directly — no more
-- joining call_logs + follow_ups at query time for the happy path.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_action_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_action_at ON public.leads(last_action_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_action_by ON public.leads(last_action_by);

-- ─── Triggers: keep last_action_at in sync for direct inserts ─────────────────
-- Comments → action
CREATE OR REPLACE FUNCTION public.touch_lead_action_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.leads
     SET last_action_at = now(),
         last_action_by = NEW.user_id,
         last_activity_at = now()
   WHERE id = NEW.lead_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_action_on_comment ON public.lead_comments;
CREATE TRIGGER trg_lead_action_on_comment
  AFTER INSERT ON public.lead_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_action_on_comment();

-- Call logs → action (entity_id holds the lead id for type 'lead')
CREATE OR REPLACE FUNCTION public.touch_lead_action_on_call()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.entity_type = 'lead'
     AND NEW.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    UPDATE public.leads
       SET last_action_at = now(),
           last_action_by = NEW.user_id,
           last_activity_at = now()
     WHERE id = NEW.entity_id::uuid;
  ELSIF NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET last_action_at = now(),
           last_action_by = NEW.user_id,
           last_activity_at = now()
     WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_action_on_call ON public.call_logs;
CREATE TRIGGER trg_lead_action_on_call
  AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_action_on_call();

-- Follow-ups → action (linked via lead_id)
CREATE OR REPLACE FUNCTION public.touch_lead_action_on_followup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET last_action_at = now(),
           last_action_by = COALESCE(NEW.created_by, last_action_by),
           last_activity_at = now()
     WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_action_on_followup ON public.follow_ups;
CREATE TRIGGER trg_lead_action_on_followup
  AFTER INSERT OR UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_action_on_followup();

-- Leads self-update: stage / assignment changes should also bump last_action_at.
-- We cannot know the acting user inside a row trigger (auth.uid() is not always
-- available), so the service layer explicitly writes last_action_by; this trigger
-- is a safety net that at least bumps the timestamp.
CREATE OR REPLACE FUNCTION public.touch_lead_action_on_lead_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (OLD.crm_status IS DISTINCT FROM NEW.crm_status)
     OR (OLD.lead_status IS DISTINCT FROM NEW.lead_status)
     OR (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     OR (OLD.follow_up_due IS DISTINCT FROM NEW.follow_up_due) THEN
    NEW.last_action_at = COALESCE(NEW.last_action_at, now());
    NEW.last_activity_at = COALESCE(NEW.last_activity_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_action_on_lead ON public.leads;
CREATE TRIGGER trg_lead_action_on_lead
  BEFORE UPDATE OF crm_status, lead_status, assigned_to, follow_up_due ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_action_on_lead_update();

-- Backfill: existing leads that have a last_activity_at but no last_action_at
-- inherit it so the "No Action Taken" bucket is not spuriously large after rollout.
UPDATE public.leads
   SET last_action_at = last_activity_at
 WHERE last_action_at IS NULL
   AND last_activity_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';

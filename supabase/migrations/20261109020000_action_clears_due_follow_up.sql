-- Rule: when someone takes an action on a lead whose follow-up is due (today or overdue, Cairo time), the follow-up is done:
-- the lead leaves the follow-up queue, unless a new follow-up date is set in that same action.
-- "Action" = a written note (quick note, note in the Notes section, text typed while logging a call) or a stage change.
-- Done in the database so the website, the app and old app versions all follow the same rule.

CREATE OR REPLACE FUNCTION public.close_follow_up_for_lead(p_lead_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  UPDATE public.follow_ups
     SET follow_up_status = 'Completed', completed_at = now(), updated_at = now()
   WHERE lead_id = p_lead_id AND follow_up_status NOT IN ('Completed', 'Cancelled');
$f$;

CREATE OR REPLACE FUNCTION public.clear_due_follow_up_on_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.crm_status IS DISTINCT FROM OLD.crm_status
     AND NEW.follow_up_due IS NOT DISTINCT FROM OLD.follow_up_due
     AND OLD.follow_up_due IS NOT NULL
     AND OLD.follow_up_due <= (now() AT TIME ZONE 'Africa/Cairo')::date THEN
    NEW.follow_up_due := NULL;
    PERFORM public.close_follow_up_for_lead(NEW.id);
  END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_clear_due_follow_up_on_stage ON public.leads;
CREATE TRIGGER trg_clear_due_follow_up_on_stage
  BEFORE UPDATE OF crm_status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.clear_due_follow_up_on_stage_change();

CREATE OR REPLACE FUNCTION public.clear_due_follow_up_on_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.lead_id IS NULL OR NOT public.is_written_comment(NEW.body) THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.leads l
     WHERE l.id = NEW.lead_id AND l.follow_up_due IS NOT NULL
       AND l.follow_up_due <= (now() AT TIME ZONE 'Africa/Cairo')::date
  ) AND NOT EXISTS (
    SELECT 1 FROM public.follow_ups f
     WHERE f.lead_id = NEW.lead_id AND f.updated_at > now() - interval '2 minutes'
       AND f.follow_up_status NOT IN ('Completed', 'Cancelled')
  ) THEN
    UPDATE public.leads SET follow_up_due = NULL WHERE id = NEW.lead_id;
    PERFORM public.close_follow_up_for_lead(NEW.lead_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never block saving a note
END $f$;

DROP TRIGGER IF EXISTS trg_clear_due_follow_up_on_note ON public.lead_comments;
CREATE TRIGGER trg_clear_due_follow_up_on_note
  AFTER INSERT ON public.lead_comments
  FOR EACH ROW EXECUTE FUNCTION public.clear_due_follow_up_on_note();

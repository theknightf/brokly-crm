-- A lead in "No Answer At All" never goes into Follow-ups: no follow-up is created for it, open ones are cancelled,
-- it cannot carry a follow-up date (so it is not counted as late either), and any client that tries to add or reopen
-- a follow-up for it (website, installed app, old phone app) gets the row saved as Cancelled.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='sync_follow_up_from_lead';
  IF d IS NULL THEN RAISE EXCEPTION 'sync_follow_up_from_lead not found'; END IF;
  d := replace(d, '''Duplicate Leads'',''Wrong Number''', '''Duplicate Leads'',''No Answer At All'',''Wrong Number''');
  IF position('No Answer At All' in d) = 0 THEN RAISE EXCEPTION 'terminal list not found'; END IF;
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.leads_no_followup_for_no_answer_at_all()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.crm_status = 'No Answer At All' THEN NEW.follow_up_due := NULL; END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_no_followup_no_answer_at_all ON public.leads;
CREATE TRIGGER trg_no_followup_no_answer_at_all
  BEFORE INSERT OR UPDATE OF crm_status, follow_up_due ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_no_followup_for_no_answer_at_all();

CREATE OR REPLACE FUNCTION public.follow_ups_skip_no_answer_at_all()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND coalesce(NEW.follow_up_status, 'Pending') NOT IN ('Completed', 'Cancelled')
     AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.crm_status = 'No Answer At All') THEN
    NEW.follow_up_status := 'Cancelled';
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_follow_ups_skip_no_answer_at_all ON public.follow_ups;
CREATE TRIGGER trg_follow_ups_skip_no_answer_at_all
  BEFORE INSERT OR UPDATE OF follow_up_status, due_date ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.follow_ups_skip_no_answer_at_all();

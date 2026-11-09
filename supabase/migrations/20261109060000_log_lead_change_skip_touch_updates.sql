-- Applied to the DB. "Lead Updated" activity rows are written only for real edits; updates that only touch
-- last_action_at / last_action_by / updated_at / last_contact no longer add a row (about half of activity_log).
CREATE OR REPLACE FUNCTION public.log_lead_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  noise text[] := ARRAY['last_action_at','last_action_by','updated_at','last_contact'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (v_user, 'Lead Added', 'lead', NEW.id::text, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Assigned', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.assigned_to::text,'') || ' -> ' || COALESCE(NEW.assigned_to::text,''));
    ELSIF OLD.crm_status IS DISTINCT FROM NEW.crm_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.crm_status::text,'') || ' -> ' || COALESCE(NEW.crm_status::text,''));
    ELSIF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.lead_status::text,'') || ' -> ' || COALESCE(NEW.lead_status::text,''));
    ELSIF (to_jsonb(NEW) - noise) IS DISTINCT FROM (to_jsonb(OLD) - noise) THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
      VALUES (v_user, 'Lead Updated', 'lead', NEW.id::text, NEW.name);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (v_user, 'Lead Deleted', 'lead', OLD.id::text, OLD.name);
  END IF;
  RETURN NULL;
END;
$function$;

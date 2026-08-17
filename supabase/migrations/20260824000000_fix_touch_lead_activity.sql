-- Fix touch_lead_activity: it referenced NEW.lead_id, but call_logs has no
-- lead_id column, so EVERY call-log insert errored with
--   ERROR: 42703: record "new" has no field "lead_id"
-- and the whole insert rolled back (the log was never saved).
-- call_logs links to a lead via entity_id (entity_type='lead'), so use that.

CREATE OR REPLACE FUNCTION public.touch_lead_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    UPDATE public.leads SET last_activity_at = now()
    WHERE id = NEW.entity_id::uuid;
  END IF;
  RETURN NEW;
END $function$;
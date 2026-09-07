-- Fix touch_lead_activity: follow_ups has lead_id, not entity_id.
-- Previous version 20260824000000 assumed NEW.entity_id, so every INSERT into
-- public.follow_ups failed with "record \"new\" has no field \"entity_id\"" and
-- rolled back — follow_ups stayed empty (0 rows) even though 99 leads had
-- follow_up_due. This version branches on TG_TABLE_NAME.
CREATE OR REPLACE FUNCTION public.touch_lead_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_TABLE_NAME = 'follow_ups' THEN
    IF NEW.lead_id IS NOT NULL THEN
      UPDATE public.leads SET last_activity_at = now() WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'lead_comments' THEN
    IF NEW.lead_id IS NOT NULL THEN
      UPDATE public.leads SET last_activity_at = now() WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'call_logs' THEN
    IF NEW.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      UPDATE public.leads SET last_activity_at = now() WHERE id = NEW.entity_id::uuid;
    ELSIF NEW.lead_id IS NOT NULL THEN
      UPDATE public.leads SET last_activity_at = now() WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

-- Backfill: ensure every lead with a due date has a follow_ups row (the sync
-- trigger only fires on INSERT/UPDATE, so existing 99 rows needed one-time insert).
INSERT INTO public.follow_ups (lead_id, title, contact_name, contact_type, contact_phone, contact_email, follow_up_type, follow_up_status, priority, due_date, due_time, agent, agent_initials, notes, property_interest, relationship_status, created_by, created_at, updated_at)
SELECT id, 'Follow up: ' || COALESCE(name,''), COALESCE(name,''), 'Lead', COALESCE(phone,''), COALESCE(email,''), 'Call','Pending','Medium', follow_up_due, '09:00', COALESCE(agent,''), COALESCE(agent_initials,''), COALESCE(notes,''), COALESCE(property_type,''), 'New', COALESCE(assigned_to, created_by), COALESCE(created_at, now()), now()
FROM public.leads WHERE follow_up_due IS NOT NULL
ON CONFLICT (lead_id) DO UPDATE SET due_date=EXCLUDED.due_date, updated_at=now();

NOTIFY pgrst, 'reload schema';

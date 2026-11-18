-- A lead is NOT a duplicate when the person adding it is the one who already owns / added the existing lead
-- (e.g. the owner re-adds his own lead and gives it to another agent). Only other people's re-adds are duplicates.
CREATE OR REPLACE FUNCTION public.leads_route_duplicate_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_phone text := public.normalize_phone(new.phone);
  v_orig  record;
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_data  jsonb;
begin
  if coalesce(current_setting('brokly.dup_separate', true), '') = '1' then
    return new;
  end if;
  if char_length(coalesce(v_phone, '')) < 8 then
    return new;
  end if;

  select l.id, coalesce(l.assigned_to, l.created_by) as owner_id, l.created_by
    into v_orig
  from public.leads l
  where l.phone_normalized = v_phone
    and coalesce(l.is_duplicate, false) = false
  order by l.created_at asc, l.id asc
  limit 1;

  if not found then
    return new;
  end if;

  -- the owner / adder of the existing lead adding it again is not a duplicate
  if v_actor is not null and (v_actor = v_orig.owner_id or v_actor = v_orig.created_by) then
    return new;
  end if;

  v_data := to_jsonb(new) - 'phone_normalized';

  perform set_config('brokly.dup_rpc', '1', true);
  insert into public.duplicate_leads
    (original_lead_id, original_owner_id, original_added_by, attempted_by, attempted_data, match_type, source)
  values
    (v_orig.id, v_orig.owner_id, v_orig.created_by, v_actor, v_data, 'phone', 'attempt')
  on conflict (original_lead_id, attempted_by) where status = 'pending' and duplicate_lead_id is null
  do update set attempted_data  = excluded.attempted_data,
                attempt_count   = public.duplicate_leads.attempt_count + 1,
                last_attempt_at = now();

  insert into public.notifications (user_id, title, message, reference_link, channel)
  select up.id, 'Duplicate lead added',
         'A lead that already exists was entered again: ' || coalesce(nullif(new.name, ''), new.phone),
         '/duplicates', 'in_app'
  from public.user_profiles up
  where up.role::text in ('owner', 'admin') and coalesce(up.is_active, true);

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.leads_flag_duplicate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_original uuid;
  v_o_owner uuid;
  v_o_by uuid;
  v_actor uuid := coalesce(auth.uid(), NEW.created_by);
BEGIN
  NEW.phone_normalized := public.normalize_phone(NEW.phone);

  IF TG_OP = 'INSERT' THEN
    NEW.is_duplicate := false;
    NEW.duplicate_of_lead_id := NULL;
    NEW.duplicate_notified_at := NULL;
    NEW.duplicate_released_to := NULL;
    IF COALESCE(current_setting('brokly.dup_separate', true), '') = '1' THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.phone_normalized IS NOT DISTINCT FROM OLD.phone_normalized OR NEW.is_duplicate THEN
    RETURN NEW;
  END IF;

  IF char_length(NEW.phone_normalized) >= 8 THEN
    SELECT id, coalesce(assigned_to, created_by), created_by INTO v_original, v_o_owner, v_o_by
    FROM public.leads
    WHERE phone_normalized = NEW.phone_normalized
      AND id <> NEW.id
      AND merged_into IS NULL
    ORDER BY is_duplicate ASC, created_at ASC, id ASC
    LIMIT 1;

    IF v_original IS NOT NULL
       AND NOT (TG_OP = 'INSERT' AND v_actor IS NOT NULL AND (v_actor = v_o_owner OR v_actor = v_o_by)) THEN
      NEW.is_duplicate := true;
      NEW.duplicate_of_lead_id := v_original;
      NEW.duplicate_released_to := NULL;
      NEW.crm_status := 'Duplicate Leads';
      NEW.follow_up_due := NULL;
      IF TG_OP = 'UPDATE' THEN
        UPDATE public.follow_ups SET follow_up_status = 'Cancelled', updated_at = now()
         WHERE lead_id = NEW.id AND follow_up_status NOT IN ('Completed', 'Cancelled');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

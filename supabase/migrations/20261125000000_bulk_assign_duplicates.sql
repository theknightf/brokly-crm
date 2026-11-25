-- Duplicates page: bulk-assign. Select duplicates, pick ONE sales agent, and in a single transaction:
--  * the ORIGINAL lead (first entered) moves to the new agent (so the agent who had it loses it),
--  * every duplicate entry attempt is kept as a COPY (status 'assigned', with a snapshot) but stays with nobody,
--  * a real duplicate lead row (if there is one) is archived: unassigned, creator cleared, hidden from sales,
--    with its full row snapshot saved in duplicate_leads.resolution,
--  * one activity_log row per duplicate: who did it, when, the lead, the old agent, the new agent.
-- Nothing is deleted. Allowed for owner / admin / limited_admin (Admin Manager) only, checked inside the function.

ALTER TABLE public.duplicate_leads DROP CONSTRAINT IF EXISTS duplicate_leads_status_check;
ALTER TABLE public.duplicate_leads
  ADD CONSTRAINT duplicate_leads_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'merged'::text, 'dismissed'::text, 'separated'::text, 'assigned'::text]));

-- The limited_admin "no hide" trigger must let THIS function archive a duplicate lead (it does not delete anything).
CREATE OR REPLACE FUNCTION public.leads_block_limited_admin_hide()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('brokly.dup_bulk', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF public.is_limited_admin() AND (
       (NEW.merged_into IS NOT NULL AND NEW.merged_into IS DISTINCT FROM OLD.merged_into)
    OR (NEW.is_duplicate IS TRUE AND OLD.is_duplicate IS DISTINCT FROM TRUE)
    OR (NEW.crm_status = 'Duplicate Leads' AND OLD.crm_status IS DISTINCT FROM 'Duplicate Leads')) THEN
    RAISE EXCEPTION 'limited_admin cannot hide or merge leads' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.bulk_assign_duplicates(p_ids uuid[], p_agent uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_role text;
  v_agent_name text;
  v_agent_role text;
  v_agent_active boolean;
  v_ids uuid[];
  v_id uuid;
  d public.duplicate_leads%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_old uuid;
  v_old_name text;
  v_tried_name text;
  v_snapshot jsonb;
  v_old_by_lead jsonb := '{}'::jsonb;
  v_moved uuid[] := ARRAY[]::uuid[];
  v_rows int := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT lower(role::text), COALESCE(NULLIF(full_name, ''), email, 'A user')
    INTO v_role, v_actor_name
  FROM public.user_profiles WHERE id = v_actor AND is_active = true;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'limited_admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no duplicates selected' USING ERRCODE = '22023';
  END IF;
  IF array_length(v_ids, 1) > 1000 THEN
    RAISE EXCEPTION 'too many selected (max 1000)' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), email), lower(role::text), is_active
    INTO v_agent_name, v_agent_role, v_agent_active
  FROM public.user_profiles WHERE id = p_agent;
  IF v_agent_name IS NULL OR v_agent_active IS NOT TRUE THEN
    RAISE EXCEPTION 'the selected agent does not exist or is not active' USING ERRCODE = 'P0002';
  END IF;
  IF v_agent_role NOT IN ('agent', 'senior_agent', 'telecaller', 'team_leader', 'broker', 'branch_manager') THEN
    RAISE EXCEPTION 'the selected user is not a sales agent' USING ERRCODE = '22023';
  END IF;

  -- Pass 1: validate everything first, so a bad item stops the whole operation before anything changes.
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO d FROM public.duplicate_leads WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'duplicate record % was not found', v_id USING ERRCODE = 'P0002';
    END IF;
    IF d.status <> 'pending' THEN
      RAISE EXCEPTION 'duplicate % is already resolved (%)', v_id, d.status USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.leads WHERE id = d.original_lead_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the original lead for % (phone %) is missing or was deleted',
        v_id, COALESCE(d.attempted_data->>'phone', '?') USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  PERFORM set_config('brokly.dup_bulk', '1', true);
  PERFORM set_config('brokly.dup_rpc', '1', true);
  PERFORM set_config('brokly.dup_notify', '1', true);

  -- Pass 2: apply.
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO d FROM public.duplicate_leads WHERE id = v_id;
    SELECT * INTO v_lead FROM public.leads WHERE id = d.original_lead_id;

    IF d.original_lead_id = ANY (v_moved) THEN
      v_old := NULLIF(v_old_by_lead->>(d.original_lead_id::text), '')::uuid;
    ELSE
      v_old := v_lead.assigned_to;
      v_old_by_lead := v_old_by_lead || jsonb_build_object(d.original_lead_id::text, v_old::text);
      v_moved := v_moved || d.original_lead_id;
      -- lead_assignees is the real source of ownership (up to 2 people; leads.assigned_to follows the oldest).
      -- Remove everyone else, so no previous agent keeps access, then make the new agent the owner.
      DELETE FROM public.lead_assignees WHERE lead_id = d.original_lead_id AND user_id <> p_agent;
      UPDATE public.leads SET assigned_to = p_agent WHERE id = d.original_lead_id AND assigned_to IS DISTINCT FROM p_agent;
      INSERT INTO public.lead_assignees (lead_id, user_id, assigned_by)
      VALUES (d.original_lead_id, p_agent, v_actor) ON CONFLICT (lead_id, user_id) DO NOTHING;
    END IF;

    SELECT COALESCE(NULLIF(full_name, ''), email) INTO v_old_name FROM public.user_profiles WHERE id = v_old;
    SELECT COALESCE(NULLIF(full_name, ''), email) INTO v_tried_name FROM public.user_profiles WHERE id = d.attempted_by;

    v_snapshot := NULL;
    IF d.duplicate_lead_id IS NOT NULL THEN
      SELECT to_jsonb(l) INTO v_snapshot FROM public.leads l WHERE l.id = d.duplicate_lead_id;
      IF v_snapshot IS NOT NULL THEN
        DELETE FROM public.lead_assignees WHERE lead_id = d.duplicate_lead_id;
        UPDATE public.leads
           SET assigned_to = NULL, created_by = NULL, is_duplicate = true,
               duplicate_of_lead_id = d.original_lead_id, duplicate_released_to = NULL
         WHERE id = d.duplicate_lead_id;
      END IF;
    END IF;

    UPDATE public.duplicate_leads
       SET status = 'assigned', resolved_by = v_actor, resolved_at = now(),
           resolution = jsonb_build_object(
             'action', 'bulk_assign',
             'assigned_to', p_agent,
             'previous_owner', v_old,
             'attempted_by', d.attempted_by,
             'original_lead_id', d.original_lead_id,
             'duplicate_lead_snapshot', v_snapshot)
     WHERE id = d.id;

    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
    VALUES (v_actor, 'Duplicate Bulk Assigned', 'lead', d.original_lead_id::text,
            v_actor_name || ' moved the lead from ' || COALESCE(v_old_name, 'nobody') || ' to ' || v_agent_name
              || CASE WHEN v_tried_name IS NOT NULL THEN ' (duplicate entered by ' || v_tried_name || ' kept as a copy)' ELSE '' END,
            jsonb_build_object('duplicate_id', d.id, 'old_agent', v_old, 'new_agent', p_agent,
                               'attempted_by', d.attempted_by, 'actor', v_actor)::text);
    v_rows := v_rows + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'duplicates', v_rows, 'leads_moved', COALESCE(array_length(v_moved, 1), 0),
                            'agent', v_agent_name);
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_assign_duplicates(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_assign_duplicates(uuid[], uuid) TO authenticated;

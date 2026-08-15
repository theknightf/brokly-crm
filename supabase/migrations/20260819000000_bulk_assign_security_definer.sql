-- 20260819000000_bulk_assign_security_definer.sql
-- Fix: "Error on assign" for bulk-assign (many) and bulk-assign (team).
--
-- The leads UPDATE RLS policy only permits updating leads the caller already
-- "owns" (assigned_to = auth.uid(), is_leader_of_assignee, or unassigned +
-- created_by = auth.uid()). The bulk-assignment RPCs ran as SECURITY INVOKER,
-- so any legitimate reassignment of a lead the caller does not currently own
-- (e.g. a team leader distributing leads, or an admin bulk-assigning many
-- leads at once) was blocked by RLS and raised a permission error.
--
-- Assignment SCOPE is already enforced independently by the BEFORE trigger
-- public.validate_lead_assignment() (self / own-team / admin|owner), which
-- still runs under the caller's auth.uid(). Making the bulk RPCs SECURITY
-- DEFINER removes only the conflicting RLS UPDATE block — it does NOT loosen
-- who may assign leads.

CREATE OR REPLACE FUNCTION public.bulk_assign_round_robin(
  p_lead_ids uuid[],
  p_user_ids uuid[]
)
RETURNS TABLE(lead_id uuid, user_id uuid, user_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n_leads int := COALESCE(array_length(p_lead_ids, 1), 0);
  v_n_users int := COALESCE(array_length(p_user_ids, 1), 0);
  v_idx int;
  v_lead uuid;
  v_user uuid;
  v_name text;
  v_initials text;
BEGIN
  IF v_n_leads = 0 OR v_n_users = 0 THEN
    RETURN;
  END IF;

  FOR v_idx IN 1..v_n_leads LOOP
    v_lead := p_lead_ids[v_idx];
    -- Deterministic round-robin: lead[i] -> user[i % user_count]
    v_user := p_user_ids[((v_idx - 1) % v_n_users) + 1];

    SELECT full_name INTO v_name
      FROM public.user_profiles
     WHERE id = v_user;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Assignable user % not found', v_user;
    END IF;

    v_initials := UPPER(LEFT(
      LEFT(v_name, 1) || CASE WHEN v_name ~ '\s' THEN SUBSTRING(v_name FROM '\s(\w)') ELSE '' END,
      2
    ));

    -- Scope is enforced by the validate_lead_assignment trigger (runs as the
    -- caller). SECURITY DEFINER lets the update pass the leads RLS UPDATE
    -- policy so legitimate reassignments succeed.
    UPDATE public.leads
       SET assigned_to = v_user,
           agent = v_name,
           agent_initials = v_initials
     WHERE id = v_lead;
  END LOOP;

  -- Re-query the results so the client gets accurate names back.
  RETURN QUERY
    SELECT l.id, l.assigned_to, u.full_name
      FROM public.leads l
      JOIN public.user_profiles u ON u.id = l.assigned_to
     WHERE l.id = ANY(p_lead_ids)
       AND l.assigned_to = ANY(p_user_ids);
END;
$$;

-- Bulk team-label update. SECURITY DEFINER so a manager can relabel leads
-- they are allowed to manage (team labelling is not sensitive).
CREATE OR REPLACE FUNCTION public.bulk_set_team(
  p_lead_ids uuid[],
  p_team text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET team = NULLIF(TRIM(p_team), '')
   WHERE id = ANY(p_lead_ids);
END;
$$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

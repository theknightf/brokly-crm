-- 20260817000000_bulk_assign_atomic.sql
-- Transaction-safe round-robin bulk lead assignment.
-- One RPC call updates every lead atomically: if ANY lead is not permitted for
-- the caller (RLS INVOKER) or any user is missing, the whole operation raises
-- and rolls back — no partial assignments are ever persisted.

CREATE OR REPLACE FUNCTION public.bulk_assign_round_robin(
  p_lead_ids uuid[],
  p_user_ids uuid[]
)
RETURNS TABLE(lead_id uuid, user_id uuid, user_name text)
LANGUAGE plpgsql
SECURITY INVOKER
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
  v_updated int;
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

    -- RLS runs as the caller (SECURITY INVOKER). Unauthorized rows are simply
    -- not updated, so we detect that and abort the whole transaction.
    UPDATE public.leads
       SET assigned_to = v_user,
           agent = v_name,
           agent_initials = v_initials
     WHERE id = v_lead;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      RAISE EXCEPTION 'You do not have permission to reassign one or more selected leads';
    END IF;

    RETURN QUERY SELECT v_lead, v_user, v_name;
  END LOOP;
END;
$$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

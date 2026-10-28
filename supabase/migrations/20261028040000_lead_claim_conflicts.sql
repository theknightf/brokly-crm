-- ============================================================
-- Lead claim conflicts: reject + audit when someone tries to take a lead that
-- another user already holds. Visible to admin/owner only.
-- ============================================================
-- "Holder" of a lead = leads.assigned_to, plus every lead_assignees member.
-- claim_leads() is called by the app before a NON-admin assigns a lead to
-- themselves. If any lead is held by someone else it logs one REJECTED row per
-- lead and returns {ok:false}; the caller shows a generic "not authorized"
-- message. The function returns normally (it does not RAISE) so the audit rows
-- are committed.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_claim_conflicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  lead_id        uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_name      text,
  lead_phone     text,
  holder_id      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  holder_name    text,
  requester_id   uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  requester_name text,
  attempted_action text NOT NULL DEFAULT 'claim',
  status         text NOT NULL DEFAULT 'REJECTED' CHECK (status IN ('REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_lead_claim_conflicts_created ON public.lead_claim_conflicts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_claim_conflicts_lead ON public.lead_claim_conflicts (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_claim_conflicts_requester ON public.lead_claim_conflicts (requester_id);

-- Admin/owner read only. No INSERT/UPDATE/DELETE policy for anyone: rows are written
-- exclusively by claim_leads() (SECURITY DEFINER) and are immutable afterwards.
ALTER TABLE public.lead_claim_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_claim_conflicts_admin_select ON public.lead_claim_conflicts;
CREATE POLICY lead_claim_conflicts_admin_select ON public.lead_claim_conflicts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2());

REVOKE ALL ON public.lead_claim_conflicts FROM anon, authenticated;
GRANT SELECT ON public.lead_claim_conflicts TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_leads(p_lead_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_rejected int := 0;
  r record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'rejected', 0);
  END IF;
  IF array_length(p_lead_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'too many leads' USING ERRCODE = '22023';
  END IF;

  -- Admins / owners may reassign anything.
  IF public.is_admin_or_owner_v2() THEN
    RETURN jsonb_build_object('ok', true, 'rejected', 0);
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), email, 'A user') INTO v_actor_name
  FROM public.user_profiles WHERE id = v_actor;

  FOR r IN
    SELECT l.id, l.name, l.phone, l.assigned_to,
           (SELECT COALESCE(NULLIF(up.full_name, ''), up.email) FROM public.user_profiles up WHERE up.id = l.assigned_to) AS holder_name
    FROM public.leads l
    WHERE l.id = ANY(p_lead_ids)
      AND l.assigned_to IS NOT NULL
      AND l.assigned_to <> v_actor
      -- a co-assignee already holds the lead
      AND NOT EXISTS (SELECT 1 FROM public.lead_assignees la WHERE la.lead_id = l.id AND la.user_id = v_actor)
      -- a team leader / admin-of-user may reassign their own people's leads
      AND NOT (public.is_leader_of_assignee(l.assigned_to) OR public.is_admin_of_user(l.assigned_to))
  LOOP
    INSERT INTO public.lead_claim_conflicts
      (lead_id, lead_name, lead_phone, holder_id, holder_name, requester_id, requester_name, attempted_action, status)
    VALUES
      (r.id, r.name, r.phone, r.assigned_to, r.holder_name, v_actor, v_actor_name, 'claim', 'REJECTED');
    v_rejected := v_rejected + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', v_rejected = 0, 'rejected', v_rejected);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_leads(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_leads(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Brokly CRM — Lead Co-Assignment (Max 2 Agents) & RLS Policies
-- Migration: 20261024140000_lead_co_assignment.sql
-- ============================================================

-- 1. Create table lead_assignees
CREATE TABLE IF NOT EXISTS public.lead_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lead_assignees_lead_user UNIQUE (lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_assignees_lead_id ON public.lead_assignees(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignees_user_id ON public.lead_assignees(user_id);

-- 2. Enforce a max of 2 assignees per lead
CREATE OR REPLACE FUNCTION public.check_max_lead_assignees()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.lead_assignees
    WHERE lead_id = NEW.lead_id
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) >= 2 THEN
    RAISE EXCEPTION 'A lead can have at most 2 assignees'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_max_lead_assignees ON public.lead_assignees;
CREATE TRIGGER trg_check_max_lead_assignees
  BEFORE INSERT OR UPDATE ON public.lead_assignees
  FOR EACH ROW
  EXECUTE FUNCTION public.check_max_lead_assignees();

-- 3. Copy existing leads.assigned_to values into lead_assignees (keep leads.assigned_to intact)
INSERT INTO public.lead_assignees (lead_id, user_id, assigned_at)
SELECT id, assigned_to, COALESCE(updated_at, created_at, now())
FROM public.leads
WHERE assigned_to IS NOT NULL
ON CONFLICT (lead_id, user_id) DO NOTHING;

-- 4. Sync triggers: Keep leads.assigned_to and lead_assignees synchronized
CREATE OR REPLACE FUNCTION public.sync_lead_assignees_to_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
  v_primary_user UUID;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  
  -- Pick the oldest remaining assignee as primary
  SELECT user_id INTO v_primary_user
  FROM public.lead_assignees
  WHERE lead_id = v_lead_id
  ORDER BY assigned_at ASC
  LIMIT 1;

  UPDATE public.leads
  SET assigned_to = v_primary_user
  WHERE id = v_lead_id AND assigned_to IS DISTINCT FROM v_primary_user;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_assignees_to_lead ON public.lead_assignees;
CREATE TRIGGER trg_sync_lead_assignees_to_lead
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_assignees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_assignees_to_lead();

CREATE OR REPLACE FUNCTION public.sync_lead_assigned_to_to_assignees()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD IS NULL OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    IF NOT EXISTS (SELECT 1 FROM public.lead_assignees WHERE lead_id = NEW.id AND user_id = NEW.assigned_to) THEN
      IF (SELECT COUNT(*) FROM public.lead_assignees WHERE lead_id = NEW.id) < 2 THEN
        INSERT INTO public.lead_assignees (lead_id, user_id, assigned_by)
        VALUES (NEW.id, NEW.assigned_to, auth.uid())
        ON CONFLICT (lead_id, user_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_assigned_to ON public.leads;
CREATE TRIGGER trg_sync_lead_assigned_to
  AFTER INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_assigned_to_to_assignees();

-- 5. RPCs for atomic assignment management
CREATE OR REPLACE FUNCTION public.set_lead_assignees(
  p_lead_id UUID,
  p_user_ids UUID[],
  p_assigned_by UUID DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Only admins can manage lead assignees'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF array_length(p_user_ids, 1) > 2 THEN
    RAISE EXCEPTION 'A lead can have at most 2 assignees'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    DELETE FROM public.lead_assignees WHERE lead_id = p_lead_id;
    UPDATE public.leads SET assigned_to = NULL, agent = NULL, agent_initials = NULL WHERE id = p_lead_id;
  ELSE
    DELETE FROM public.lead_assignees WHERE lead_id = p_lead_id AND NOT (user_id = ANY(p_user_ids));
    
    FOREACH v_uid IN ARRAY p_user_ids LOOP
      INSERT INTO public.lead_assignees (lead_id, user_id, assigned_by)
      VALUES (p_lead_id, v_uid, p_assigned_by)
      ON CONFLICT (lead_id, user_id) DO NOTHING;
    END LOOP;

    UPDATE public.leads
    SET assigned_to = p_user_ids[1]
    WHERE id = p_lead_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assignees', p_user_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_set_lead_assignees(
  p_lead_ids UUID[],
  p_user_ids UUID[],
  p_assigned_by UUID DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Only admins can manage lead assignees'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF array_length(p_user_ids, 1) > 2 THEN
    RAISE EXCEPTION 'A lead can have at most 2 assignees'
      USING ERRCODE = 'check_violation';
  END IF;

  FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
    PERFORM public.set_lead_assignees(v_lead_id, p_user_ids, p_assigned_by);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', array_length(p_lead_ids, 1));
END;
$$;

-- 6. RLS Policies
ALTER TABLE public.lead_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_assignees_admin_all" ON public.lead_assignees;
CREATE POLICY "lead_assignees_admin_all"
ON public.lead_assignees
FOR ALL
TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "lead_assignees_select_authorized" ON public.lead_assignees;
CREATE POLICY "lead_assignees_select_authorized"
ON public.lead_assignees
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.lead_assignees la
    WHERE la.lead_id = lead_assignees.lead_id AND la.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_assignees.lead_id
      AND (
        l.created_by = auth.uid()
        OR (l.created_by IS NOT NULL AND (public.is_leader_of_assignee(l.created_by) OR public.is_admin_of_user(l.created_by)))
        OR (l.assigned_to IS NOT NULL AND (public.is_leader_of_assignee(l.assigned_to) OR public.is_admin_of_user(l.assigned_to)))
      )
  )
);

-- Update leads table select and update policies to check lead_assignees
DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;
CREATE POLICY "leads_select_policy" ON public.leads
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  is_admin_or_owner_v2()
  OR (assigned_to IS NOT NULL AND assigned_to = auth.uid())
  OR (created_by IS NOT NULL AND created_by = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.lead_assignees la
    WHERE la.lead_id = leads.id AND la.user_id = auth.uid()
  )
  OR (assigned_to IS NOT NULL AND (is_leader_of_assignee(assigned_to) OR is_admin_of_user(assigned_to)))
  OR (created_by IS NOT NULL AND (is_leader_of_assignee(created_by) OR is_admin_of_user(created_by)))
  OR EXISTS (
    SELECT 1 FROM public.lead_assignees la
    WHERE la.lead_id = leads.id AND (is_leader_of_assignee(la.user_id) OR is_admin_of_user(la.user_id))
  )
  OR (referred_to IS NOT NULL AND referred_to = auth.uid())
  OR (referred_by IS NOT NULL AND referred_by = auth.uid())
);

DROP POLICY IF EXISTS "leads_update_policy" ON public.leads;
CREATE POLICY "leads_update_policy"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (assigned_to IS NOT NULL AND assigned_to = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.lead_assignees la
    WHERE la.lead_id = leads.id AND la.user_id = auth.uid()
  )
  OR (
    assigned_to IS NOT NULL
    AND (
      public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.lead_assignees la
    WHERE la.lead_id = leads.id AND (is_leader_of_assignee(la.user_id) OR is_admin_of_user(la.user_id))
  )
  OR (assigned_to IS NULL AND created_by = auth.uid())
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND (
      public.is_leader_of_assignee(created_by)
      OR public.is_admin_of_user(created_by)
    )
  )
)
WITH CHECK (true);

-- Update follow_ups select policy to also check lead_assignees
DROP POLICY IF EXISTS "follow_ups_select_policy" ON public.follow_ups;
CREATE POLICY "follow_ups_select_policy" ON public.follow_ups
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = follow_ups.lead_id
      AND (
        l.assigned_to = auth.uid()
        OR l.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.lead_assignees la WHERE la.lead_id = l.id AND la.user_id = auth.uid())
        OR (l.assigned_to IS NOT NULL AND is_leader_of_assignee(l.assigned_to))
        OR (l.created_by IS NOT NULL AND is_leader_of_assignee(l.created_by))
        OR EXISTS (SELECT 1 FROM public.lead_assignees la WHERE la.lead_id = l.id AND is_leader_of_assignee(la.user_id))
      )
  )
  OR (created_by IS NOT NULL AND is_leader_of_lead_creator(created_by))
);

-- Update get_lead_status_counts to count leads for co-assigned agents
CREATE OR REPLACE FUNCTION public.get_lead_status_counts(p_assigned_to uuid DEFAULT NULL)
RETURNS TABLE (status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_filtered AS (
    SELECT crm_status, lead_status
    FROM public.active_leads l
    WHERE (
      CASE
        WHEN auth.uid() IS NOT NULL AND NOT is_admin_or_owner_v2() THEN (
          l.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.lead_assignees la
            WHERE la.lead_id = l.id AND la.user_id = auth.uid()
          )
        )
        WHEN p_assigned_to IS NOT NULL THEN (
          l.assigned_to = p_assigned_to
          OR EXISTS (
            SELECT 1 FROM public.lead_assignees la
            WHERE la.lead_id = l.id AND la.user_id = p_assigned_to
          )
        )
        ELSE true
      END
    )
  ),
  normalized AS (
    SELECT
      CASE
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('not interested','not_interested','not-interested','lost','not intereted') THEN 'Not Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('duplicate leads','duplicate') THEN 'Duplicate Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('fresh leads','fresh','new fresh','new') THEN 'Fresh Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cold calls','cold','new cold') THEN 'Cold Calls'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('pending leads','pending') THEN 'Pending Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('following up','follow up','followup') THEN 'Following Up'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('meeting','site visit scheduled') THEN 'Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cancellation','cancel','cancelled') THEN 'Cancellation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('done deal','won','closed won') THEN 'Done Deal'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('interested','qualified') THEN 'Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('wrong number','wrong_number') THEN 'Wrong Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('data rotation','rotation') THEN 'Data Rotation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('closed number','closed_number') THEN 'Closed Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer','no_answer') THEN 'No Answer'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer at all','no_answer_at_all') THEN 'No Answer At All'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('low budget','low_budget') THEN 'Low Budget'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reschedule meeting','reschedule') THEN 'Reschedule Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reservation','reserved') THEN 'Reservation'
        ELSE trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, 'Fresh Leads'))
      END AS canon
    FROM user_filtered
  )
  SELECT canon AS status, COUNT(*)::BIGINT FROM normalized
  GROUP BY canon ORDER BY 2 DESC;
$$;

NOTIFY pgrst, 'reload schema';

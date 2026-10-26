-- ============================================================
-- Brokly CRM — Fix RLS Infinite Recursion on lead_assignees & leads
-- Migration: 20261024150000_fix_lead_assignees_rls_infinite_recursion.sql
-- ============================================================

-- 1. Helper SECURITY DEFINER functions to safely query lead permissions without RLS recursion
CREATE OR REPLACE FUNCTION public.is_lead_assignee(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lead_assignees
    WHERE lead_id = p_lead_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_leader_of_lead_assignee(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lead_assignees la
    WHERE la.lead_id = p_lead_id
      AND (
        public.is_leader_of_assignee(la.user_id)
        OR public.is_admin_of_user(la.user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_lead(target_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_admin_or_owner_v2()
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = target_lead_id
        AND (
          l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
          OR l.referred_to = auth.uid()
          OR l.referred_by = auth.uid()
          OR (l.assigned_to IS NOT NULL AND (public.is_leader_of_assignee(l.assigned_to) OR public.is_admin_of_user(l.assigned_to)))
          OR (l.created_by IS NOT NULL AND (public.is_leader_of_assignee(l.created_by) OR public.is_admin_of_user(l.created_by)))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.lead_assignees la
      WHERE la.lead_id = target_lead_id
        AND (
          la.user_id = auth.uid()
          OR public.is_leader_of_assignee(la.user_id)
          OR public.is_admin_of_user(la.user_id)
        )
    )
  );
$$;

-- 2. Drop old recursive policies on lead_assignees
DROP POLICY IF EXISTS "lead_assignees_select_authorized" ON public.lead_assignees;
DROP POLICY IF EXISTS "lead_assignees_select_policy" ON public.lead_assignees;
DROP POLICY IF EXISTS "lead_assignees_admin_all" ON public.lead_assignees;

-- 3. Recreate clean non-recursive policies on lead_assignees
-- Notice: NO direct subqueries on public.leads, breaking the mutual recursion loop.
CREATE POLICY "lead_assignees_admin_all"
ON public.lead_assignees
FOR ALL
TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

CREATE POLICY "lead_assignees_select_policy"
ON public.lead_assignees
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR user_id = auth.uid()
  OR public.is_leader_of_assignee(user_id)
  OR public.is_admin_of_user(user_id)
  OR public.can_access_lead(lead_id)
);

-- 4. Recreate clean non-recursive policies on leads using SECURITY DEFINER functions
DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;
CREATE POLICY "leads_select_policy" ON public.leads
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (assigned_to IS NOT NULL AND assigned_to = auth.uid())
  OR (created_by IS NOT NULL AND created_by = auth.uid())
  OR (referred_to IS NOT NULL AND referred_to = auth.uid())
  OR (referred_by IS NOT NULL AND referred_by = auth.uid())
  OR (assigned_to IS NOT NULL AND (public.is_leader_of_assignee(assigned_to) OR public.is_admin_of_user(assigned_to)))
  OR (created_by IS NOT NULL AND (public.is_leader_of_assignee(created_by) OR public.is_admin_of_user(created_by)))
  OR public.is_lead_assignee(id)
  OR public.is_leader_of_lead_assignee(id)
);

DROP POLICY IF EXISTS "leads_update_policy" ON public.leads;
CREATE POLICY "leads_update_policy" ON public.leads
AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (assigned_to IS NOT NULL AND assigned_to = auth.uid())
  OR (referred_to IS NOT NULL AND referred_to = auth.uid())
  OR (
    assigned_to IS NOT NULL
    AND (public.is_leader_of_assignee(assigned_to) OR public.is_admin_of_user(assigned_to))
  )
  OR (assigned_to IS NULL AND created_by = auth.uid())
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND (public.is_leader_of_assignee(created_by) OR public.is_admin_of_user(created_by))
  )
  OR public.is_lead_assignee(id)
  OR public.is_leader_of_lead_assignee(id)
)
WITH CHECK (true);

-- 5. Update follow_ups select policy to also use the SECURITY DEFINER check
DROP POLICY IF EXISTS "follow_ups_select_policy" ON public.follow_ups;
CREATE POLICY "follow_ups_select_policy" ON public.follow_ups
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
  OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
);

NOTIFY pgrst, 'reload schema';

-- Performance-only rewrite of the SELECT policies on public.leads.
-- Same access rules as before; the difference is HOW they are evaluated:
--   * per-row calls (is_leader_of_assignee(assigned_to), is_admin_of_user(...), is_lead_assignee(id), ...)
--     are replaced by uncorrelated set lookups that Postgres evaluates once per query;
--   * row-independent functions (auth.uid(), is_admin_or_owner_v2(), get_current_user_team_id()) are
--     wrapped in (select ...) so they run once (InitPlan) instead of once per row.
-- A non-admin counting ~2.4k leads took ~1.7s per query under the old policy and hit statement timeouts.

-- 1) Helper sets (SECURITY DEFINER like the functions they replace; no arguments, STABLE).

-- Users whose leads I may see as their leader / admin
-- (== is_leader_of_assignee(x) OR is_admin_of_user(x)).
CREATE OR REPLACE FUNCTION public.my_visible_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm_member.user_id
  FROM public.teams t
  JOIN public.team_memberships tm_member ON tm_member.team_id = t.id
  WHERE (
    t.leader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_memberships tm_lead
      WHERE tm_lead.team_id = t.id
        AND tm_lead.user_id = auth.uid()
        AND tm_lead.is_leader = true
    )
  )
  AND tm_member.user_id <> auth.uid()
  AND COALESCE(tm_member.is_leader, false) = false
  UNION
  SELECT up.id FROM public.user_profiles up WHERE up.admin_id = auth.uid();
$$;

-- Leads I am an additional assignee on (== is_lead_assignee(id)).
CREATE OR REPLACE FUNCTION public.my_assigned_lead_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lead_id FROM public.lead_assignees WHERE user_id = auth.uid();
$$;

-- Leads whose additional assignee is one of my visible users (== is_leader_of_lead_assignee(id)).
CREATE OR REPLACE FUNCTION public.my_team_lead_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT la.lead_id
  FROM public.lead_assignees la
  WHERE la.user_id IN (SELECT public.my_visible_user_ids());
$$;

REVOKE ALL ON FUNCTION public.my_visible_user_ids(), public.my_assigned_lead_ids(), public.my_team_lead_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_visible_user_ids(), public.my_assigned_lead_ids(), public.my_team_lead_ids() TO authenticated;

-- 2) Policies (apply only after the equivalence check).
ALTER POLICY leads_select_policy ON public.leads USING (
  (SELECT public.is_admin_or_owner_v2())
  OR assigned_to = (SELECT auth.uid())
  OR created_by = (SELECT auth.uid())
  OR referred_to = (SELECT auth.uid())
  OR referred_by = (SELECT auth.uid())
  OR assigned_to IN (SELECT public.my_visible_user_ids())
  OR created_by IN (SELECT public.my_visible_user_ids())
  OR id IN (SELECT public.my_assigned_lead_ids())
  OR id IN (SELECT public.my_team_lead_ids())
);

ALTER POLICY team_members_view_leads ON public.leads USING (
  (SELECT public.is_admin_or_owner_v2())
  OR created_by = (SELECT auth.uid())
  OR (
    (SELECT public.get_current_user_team_id()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = leads.created_by
        AND up.team_id = (SELECT public.get_current_user_team_id())
    )
  )
);

ALTER POLICY leads_referral_recipient_select ON public.leads USING (
  referred_to = (SELECT auth.uid()) OR referred_by = (SELECT auth.uid())
);

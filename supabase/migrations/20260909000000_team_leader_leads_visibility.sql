-- ============================================================
-- Brokly CRM - Team Leader vs Member Leads Visibility
-- Migration: 20260909000000_team_leader_leads_visibility.sql
--
-- Rule:
-- 1. Team Leader: Can see their own leads AND all leads assigned to
--    their team members (non-leaders of the team they lead).
-- 2. Team Members: Can ONLY see their own leads (assigned_to = auth.uid()
--    or unassigned leads they created). They CANNOT see other team members'
--    leads, nor can they see their team leader's leads.
-- 3. Admin / Owner: Can see all leads.
-- ============================================================

-- Ensure is_leader_of_assignee checks that:
-- - The current user (auth.uid()) is the leader of the team (either via teams.leader_id OR team_memberships.is_leader = true)
-- - AND the other user (assignee) is a member of that same team
-- - AND the other user is NOT a team leader themselves
CREATE OR REPLACE FUNCTION public.is_leader_of_assignee(assignee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
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
    AND tm_member.user_id = assignee_id
    AND tm_member.user_id <> auth.uid()
    AND COALESCE(tm_member.is_leader, false) = false
  );
$$;

-- Helper for creator if lead is unassigned
CREATE OR REPLACE FUNCTION public.is_leader_of_lead_creator(creator_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_leader_of_assignee(creator_id);
$$;

-- ─── RECREATE LEADS POLICIES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;
CREATE POLICY "leads_select_policy"
ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND (
      public.is_leader_of_assignee(created_by)
      OR public.is_admin_of_user(created_by)
    )
  )
);

DROP POLICY IF EXISTS "leads_update_policy" ON public.leads;
CREATE POLICY "leads_update_policy"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
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

DROP POLICY IF EXISTS "leads_delete_policy" ON public.leads;
CREATE POLICY "leads_delete_policy"
ON public.leads FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND (
      public.is_leader_of_assignee(created_by)
      OR public.is_admin_of_user(created_by)
    )
  )
);

-- Lead comments helper update to align with new visibility
CREATE OR REPLACE FUNCTION public.can_access_lead(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = target_lead_id
      AND (
        public.is_admin_or_owner_v2()
        OR (
          l.assigned_to IS NOT NULL
          AND (
            l.assigned_to = auth.uid()
            OR public.is_leader_of_assignee(l.assigned_to)
            OR public.is_admin_of_user(l.assigned_to)
          )
        )
        OR (
          l.assigned_to IS NULL
          AND l.created_by IS NOT NULL
          AND (
            l.created_by = auth.uid()
            OR public.is_leader_of_assignee(l.created_by)
            OR public.is_admin_of_user(l.created_by)
          )
        )
      )
  );
$$;

-- Reload postgrest schema
NOTIFY pgrst, 'reload schema';

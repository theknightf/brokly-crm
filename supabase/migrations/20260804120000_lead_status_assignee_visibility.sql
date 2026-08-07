-- ============================================================
-- Brokly CRM - Lead Status, Assignee & Team Visibility
-- Migration: 20260804120000_lead_status_assignee_visibility.sql
-- ============================================================

-- ─── 1. NEW CRM LEAD STATUS TYPE ─────────────────────────────────────────────
-- Replace the old lead_status enum with the full CRM stage list

-- Add new columns using TEXT so we can migrate freely
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_status TEXT DEFAULT 'Fresh Leads';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- Migrate existing lead_status values to crm_status
UPDATE public.leads SET crm_status = CASE
  WHEN lead_status::TEXT = 'New'                    THEN 'Fresh Leads'
  WHEN lead_status::TEXT = 'Contacted'              THEN 'Cold Calls'
  WHEN lead_status::TEXT = 'Qualified'              THEN 'Interested'
  WHEN lead_status::TEXT = 'Site Visit Scheduled'   THEN 'Meeting'
  WHEN lead_status::TEXT = 'Site Visited'           THEN 'Following Up'
  WHEN lead_status::TEXT = 'Negotiation'            THEN 'Following Up'
  WHEN lead_status::TEXT = 'Won'                    THEN 'Done Deal'
  WHEN lead_status::TEXT = 'Lost'                   THEN 'Not Interested'
  ELSE 'Fresh Leads'
END
WHERE crm_status IS NULL OR crm_status = 'Fresh Leads';

-- ─── 2. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_crm_status ON public.leads(crm_status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);

-- ─── 3. HELPER FUNCTIONS FOR TEAM VISIBILITY ─────────────────────────────────

-- Returns true if the current user is a team leader of any team
CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = auth.uid()
      AND is_leader = true
  );
$$;

-- Returns true if other_user_id is a member of a team where current user is the leader
CREATE OR REPLACE FUNCTION public.is_my_team_member(other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm_leader
    JOIN public.team_memberships tm_member
      ON tm_leader.team_id = tm_member.team_id
    WHERE tm_leader.user_id = auth.uid()
      AND tm_leader.is_leader = true
      AND tm_member.user_id = other_user_id
  );
$$;

-- Returns true if the current user is the team leader of the user who created the lead
CREATE OR REPLACE FUNCTION public.is_leader_of_lead_creator(creator_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_my_team_member(creator_id);
$$;

-- Returns true if the current user is the team leader of the lead's assignee
CREATE OR REPLACE FUNCTION public.is_leader_of_assignee(assignee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_my_team_member(assignee_id);
$$;

-- ─── 4. UPDATE LEAD RLS POLICIES ─────────────────────────────────────────────
-- Drop old team-based policies and replace with assignee + leader visibility

DROP POLICY IF EXISTS "team_members_view_leads" ON public.leads;
DROP POLICY IF EXISTS "team_members_insert_leads" ON public.leads;
DROP POLICY IF EXISTS "team_members_update_leads" ON public.leads;
DROP POLICY IF EXISTS "team_members_delete_leads" ON public.leads;
DROP POLICY IF EXISTS "authenticated_manage_leads" ON public.leads;

-- SELECT: admin/owner sees all; assignee sees their lead; team leader sees all leads of their members
CREATE POLICY "leads_select_policy"
ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (assigned_to IS NOT NULL AND public.is_leader_of_assignee(assigned_to))
  OR (assigned_to IS NULL AND created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
);

-- INSERT: any authenticated user can create leads
CREATE POLICY "leads_insert_policy"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (true);

-- UPDATE: admin/owner, the assignee, or the team leader of the assignee
CREATE POLICY "leads_update_policy"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (assigned_to IS NOT NULL AND public.is_leader_of_assignee(assigned_to))
  OR (assigned_to IS NULL AND created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
)
WITH CHECK (true);

-- DELETE: admin/owner, the assignee, or the team leader
CREATE POLICY "leads_delete_policy"
ON public.leads FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (assigned_to IS NOT NULL AND public.is_leader_of_assignee(assigned_to))
  OR (assigned_to IS NULL AND created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
);

-- ─── 5. UPDATE FOLLOW-UPS RLS (leader sees team members' follow-ups) ─────────

DROP POLICY IF EXISTS "team_members_view_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "team_members_insert_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "team_members_update_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "team_members_delete_follow_ups" ON public.follow_ups;

CREATE POLICY "follow_ups_select_policy"
ON public.follow_ups FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
);

CREATE POLICY "follow_ups_insert_policy"
ON public.follow_ups FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "follow_ups_update_policy"
ON public.follow_ups FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
)
WITH CHECK (true);

CREATE POLICY "follow_ups_delete_policy"
ON public.follow_ups FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (created_by IS NOT NULL AND public.is_leader_of_lead_creator(created_by))
);

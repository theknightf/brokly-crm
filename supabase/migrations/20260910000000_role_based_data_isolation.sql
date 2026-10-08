-- ============================================================
-- Brokly CRM — Role-Based Data Isolation & Privacy Policy
-- Migration: 20260910000000_role_based_data_isolation.sql
--
-- PURPOSE:
-- 1. Ensure regular agents only see leads and follow-ups assigned to or created by them.
-- 2. Team leaders can view all records across their assigned team members.
-- 3. Admins / Owners retain full global visibility.
-- ============================================================

-- ─── 1. Leads Table Privacy Policies ─────────────────────────
DROP POLICY IF EXISTS "team_members_view_leads" ON public.leads;
DROP POLICY IF EXISTS "team_members_update_leads" ON public.leads;
DROP POLICY IF EXISTS "team_members_delete_leads" ON public.leads;
DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;

CREATE POLICY "leads_select_policy" ON public.leads
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  is_admin_or_owner_v2()
  OR (assigned_to IS NOT NULL AND assigned_to = auth.uid())
  OR (created_by IS NOT NULL AND created_by = auth.uid())
  OR (assigned_to IS NOT NULL AND (is_leader_of_assignee(assigned_to) OR is_admin_of_user(assigned_to)))
  OR (created_by IS NOT NULL AND (is_leader_of_assignee(created_by) OR is_admin_of_user(created_by)))
  OR (referred_to IS NOT NULL AND referred_to = auth.uid())
  OR (referred_by IS NOT NULL AND referred_by = auth.uid())
);

-- ─── 2. Follow-Ups Table Privacy Policies ────────────────────
DROP POLICY IF EXISTS "follow_ups_select_all" ON public.follow_ups;
DROP POLICY IF EXISTS "team_members_view_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "team_members_update_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "team_members_delete_follow_ups" ON public.follow_ups;
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
        OR (l.assigned_to IS NOT NULL AND is_leader_of_assignee(l.assigned_to))
        OR (l.created_by IS NOT NULL AND is_leader_of_assignee(l.created_by))
      )
  )
  OR (created_by IS NOT NULL AND is_leader_of_lead_creator(created_by))
);

NOTIFY pgrst, 'reload schema';

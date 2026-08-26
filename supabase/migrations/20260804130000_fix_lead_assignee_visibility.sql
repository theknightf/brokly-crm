-- ============================================================
-- Brokly CRM - Fix Lead Assignee Visibility (Strict)
-- Migration: 20260804130000_fix_lead_assignee_visibility.sql
-- ============================================================
-- Rule: When assigned_to IS SET on a lead:
--   - Only the assignee can see it
--   - Only the team leader of the assignee can see it
--   - Only admins/owners can see it
--   - The creator (created_by) CANNOT see it unless they are also the assignee
-- When assigned_to IS NULL:
--   - The creator can see it (unassigned lead)
--   - Admins/owners can see it
-- ─────────────────────────────────────────────────────────────

-- ─── DROP OLD POLICIES ───────────────────────────────────────
DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;
DROP POLICY IF EXISTS "leads_update_policy" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON public.leads;

-- ─── RECREATE SELECT POLICY (strict assignee visibility) ─────
-- When assigned_to IS SET: only assignee, their team leader, or admin/owner
-- When assigned_to IS NULL: creator or admin/owner
CREATE POLICY "leads_select_policy"
ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
);

-- ─── RECREATE UPDATE POLICY (strict assignee visibility) ─────
CREATE POLICY "leads_update_policy"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
)
WITH CHECK (true);

-- ─── RECREATE DELETE POLICY (strict assignee visibility) ─────
CREATE POLICY "leads_delete_policy"
ON public.leads FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
);

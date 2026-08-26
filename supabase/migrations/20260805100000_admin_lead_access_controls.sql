-- ============================================================
-- Brokly CRM - Admin / Team-Lead access controls
-- Migration: 20260805100000_admin_lead_access_controls.sql
--
-- 1. Grants admins/owners the ability to manage every user
--    profile (the Users tab in the Admin screen relies on this;
--    RLS previously blocked profile updates).
-- 2. Blocks non-admins from changing their own role, admin_id,
--    or is_active (prevents self-promotion to admin).
-- 3. Enforces lead-assignment scope in the database: only
--    admins/owners may assign leads to any user; team leaders
--    may only assign to members of their own team; everyone else
--    may only assign to themselves.
-- ============================================================

-- ─── 1. RLS: admins/owners can manage all user profiles ────────────
DROP POLICY IF EXISTS "admins_manage_profiles" ON public.user_profiles;
CREATE POLICY "admins_manage_profiles"
ON public.user_profiles FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- ─── 2. Trigger: block non-admin privilege escalation ──────────────
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.id = auth.uid() AND NOT public.is_admin_or_owner_v2() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.admin_id IS DISTINCT FROM OLD.admin_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'You may not change your own role, admin, or active status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.user_profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

-- ─── 3. Trigger: restrict lead-assignment scope ────────────────────
CREATE OR REPLACE FUNCTION public.validate_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to <> auth.uid()
     AND NOT public.is_admin_or_owner_v2()
     AND NOT public.is_my_team_member(NEW.assigned_to) THEN
    RAISE EXCEPTION 'You can only assign leads to yourself or members of your own team';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_lead_assignment ON public.leads;
CREATE TRIGGER validate_lead_assignment
  BEFORE INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_lead_assignment();

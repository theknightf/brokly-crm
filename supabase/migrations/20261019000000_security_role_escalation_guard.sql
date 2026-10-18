-- ============================================================
-- Brokly CRM - Security Hardening & Privilege Escalation Guard
-- Migration: 20261019000000_security_role_escalation_guard.sql
-- ============================================================

-- 1. Prevent users from escalating their own role, status, or admin_id
CREATE OR REPLACE FUNCTION public.protect_user_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- Service role / background triggers (no JWT auth.uid()) are allowed
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Detect modifications to sensitive security fields
  IF (OLD.role IS DISTINCT FROM NEW.role)
     OR (OLD.is_active IS DISTINCT FROM NEW.is_active)
     OR (OLD.admin_id IS DISTINCT FROM NEW.admin_id) THEN
    
    -- Verify caller's role directly from database
    SELECT lower(role::text) INTO v_caller_role
    FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = true;

    IF v_caller_role NOT IN ('owner', 'admin', 'owner_admin') THEN
      RAISE EXCEPTION 'Permission denied: only an administrator can change user roles, status, or ownership.';
    END IF;

    -- Prevent users from escalating or modifying their own role
    IF auth.uid() = OLD.id AND (OLD.role IS DISTINCT FROM NEW.role) THEN
      RAISE EXCEPTION 'Permission denied: users cannot modify their own role.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_profile_security_fields ON public.user_profiles;
CREATE TRIGGER trg_protect_user_profile_security_fields
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_profile_security_fields();

-- 2. Drop open follow_ups_select_all policy to enforce role/assignment data isolation
DROP POLICY IF EXISTS "follow_ups_select_all" ON public.follow_ups;

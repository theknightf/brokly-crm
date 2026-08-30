-- Fix user creation triggers: allow service_role to provision and manage privileged roles (admin, owner).

-- ─── 1. Fix handle_new_user trigger ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  -- Non-privileged roles self-signup users are allowed to claim.
  v_self_roles TEXT[] := ARRAY['broker','branch_manager','team_leader','senior_agent','agent','telecaller'];
  -- All allowed roles in the system.
  v_all_roles TEXT[] := ARRAY['owner','admin','broker','branch_manager','team_leader','senior_agent','agent','telecaller'];
BEGIN
  -- If called by service_role, allow any valid role. Otherwise restrict to non-privileged roles.
  IF auth.role() = 'service_role' THEN
    IF v_role IS NULL OR NOT v_role = ANY(v_all_roles) THEN
      v_role := 'agent';
    END IF;
  ELSE
    IF v_role IS NULL OR NOT v_role = ANY(v_self_roles) THEN
      v_role := 'agent';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role, brokerage_name, phone)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
      v_role::public.user_role,
      COALESCE(NEW.raw_user_meta_data->>'brokerage_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', '')
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'handle_new_user skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;


-- ─── 2. Fix prevent_privilege_escalation trigger ───
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_is_owner BOOLEAN;
  v_is_self BOOLEAN := (NEW.id = auth.uid());
BEGIN
  -- Bypass all restrictions when run by the service_role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT u.role INTO v_actor_role FROM public.user_profiles u WHERE u.id = auth.uid();
  v_actor_is_owner := COALESCE(v_actor_role, '') = 'owner';

  -- A non-owner is never allowed to set a role to 'owner' (self or other).
  IF NEW.role = 'owner' AND NOT v_actor_is_owner THEN
    RAISE EXCEPTION 'Only the business owner can grant the owner role';
  END IF;

  -- Nobody may promote themselves to a privilege tier above their own.
  IF v_is_self AND NEW.role <> COALESCE(v_actor_role, '') THEN
    IF NEW.role = 'admin' OR NEW.role = 'owner' THEN
      RAISE EXCEPTION 'You cannot change your own privileged role';
    END IF;
  END IF;

  -- Admins may only be granted by an owner.
  IF NEW.role <> OLD.role AND NEW.role = 'admin' AND NOT v_actor_is_owner AND NOT v_is_self THEN
    IF OLD.role <> 'admin' THEN
      RAISE EXCEPTION 'Only the business owner can grant the admin role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

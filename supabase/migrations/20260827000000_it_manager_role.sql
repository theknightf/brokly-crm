-- 20260827000000_it_manager_role.sql
-- Adds the 'it_manager' role. IT managers get a dedicated technical
-- diagnostics dashboard (/admin → System) but no CRM/admin data access.
-- The role can only be granted by an owner through the admin Users tab
-- (it is intentionally NOT available on the public sign-up form).

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'it_manager';

-- Re-register handle_new_user so server-side provisioning accepts the new
-- enum value while public self-signup still cannot claim it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_admin_id UUID := NULL;
  -- Roles a public self-signup may claim.
  v_self_roles TEXT[] := ARRAY['broker','branch_manager','team_leader','senior_agent','agent','telecaller'];
  -- Every valid enum value (server provisioning via the admin API may use all).
  v_all_roles TEXT[] := ARRAY['owner','admin','it_manager','broker','branch_manager','team_leader','senior_agent','agent','telecaller'];
  -- Admin API provisions with email_confirm: true; public signup does not.
  v_server_provisioned BOOLEAN := NEW.email_confirmed_at IS NOT NULL;
BEGIN
  IF v_role IS NULL OR NOT v_role = ANY(v_all_roles) THEN
    v_role := 'agent';
  ELSIF NOT v_server_provisioned AND NOT v_role = ANY(v_self_roles) THEN
    v_role := 'agent';
  END IF;

  BEGIN
    IF NULLIF(NEW.raw_user_meta_data->>'admin_id', '') IS NOT NULL THEN
      v_admin_id := (NEW.raw_user_meta_data->>'admin_id')::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_admin_id := NULL;
  END;

  BEGIN
    INSERT INTO public.user_profiles (
      id, email, full_name, avatar_url, role, brokerage_name, phone,
      agent_code, admin_id
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
      v_role::public.user_role,
      COALESCE(NEW.raw_user_meta_data->>'brokerage_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      COALESCE(NEW.raw_user_meta_data->>'agent_code', ''),
      v_admin_id
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN undefined_column THEN
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
    WHEN OTHERS THEN
      RAISE NOTICE 'handle_new_user skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

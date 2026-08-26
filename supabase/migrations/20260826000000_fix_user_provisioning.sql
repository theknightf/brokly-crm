-- 20260826000000_fix_user_provisioning.sql
-- Fixes broken admin-side user creation / role management.
--
-- Bugs fixed:
--  1) handle_new_user downgraded EVERY privileged metadata role (owner/admin/
--     team_leader) to 'agent', even for users provisioned by the admin API.
--     It also ignored agent_code/admin_id metadata, so lead routing broke for
--     admin-provisioned agents until the route's follow-up upsert ran.
--  2) prevent_privilege_escalation resolved the actor via auth.uid(), which is
--     NULL on the service-role connection used by the admin API routes — so
--     every legitimate owner/admin provisioning or promotion request raised
--     "Only the business owner can grant ..." and failed after the auth user
--     had already been created (leaving an orphan that could never be retried).
--
-- Server-provisioned vs self-signup detection:
--  * The auth.users INSERT trigger runs on GoTrue's own DB connection (no JWT
--    claims), so we use NEW.email_confirmed_at: the admin API provisions users
--    with email already confirmed (email_confirm: true), while public sign-ups
--    start unconfirmed. Self-signup therefore still cannot claim a privileged
--    role.
--  * The profile UPDATE trigger runs through PostgREST where JWT claims ARE
--    available; requests carrying the service_role claim come exclusively from
--    our server-side admin routes, which enforce owner-only rules themselves.

-- ─── 1. handle_new_user: trust roles only for server-provisioned users ─────
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
  -- Every valid enum value (server provisioning may use all of them).
  v_all_roles TEXT[] := ARRAY['owner','admin','broker','branch_manager','team_leader','senior_agent','agent','telecaller'];
  -- Admin API provisions with email_confirm: true; public signup does not.
  v_server_provisioned BOOLEAN := NEW.email_confirmed_at IS NOT NULL;
BEGIN
  IF v_role IS NULL OR NOT v_role = ANY(v_all_roles) THEN
    v_role := 'agent';
  ELSIF NOT v_server_provisioned AND NOT v_role = ANY(v_self_roles) THEN
    v_role := 'agent'; -- self-signup can never claim owner/admin
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
      -- admin_id/agent_code migration not applied yet — base insert only.
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

-- ─── 2. prevent_privilege_escalation: allow trusted server-side calls ──────
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claims JSON;
  v_actor_role TEXT;
  v_actor_is_owner BOOLEAN;
  v_is_self BOOLEAN := (NEW.id = auth.uid());
BEGIN
  -- Service-role requests originate only from our server-side admin routes,
  -- which already enforce owner-only checks before writing. Without this the
  -- trigger saw auth.uid() = NULL and blocked every legitimate write.
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_claims := NULL;
  END;
  IF COALESCE(v_claims->>'role', '') = 'service_role' THEN
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

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.user_profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE OF role, admin_id, is_active ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

NOTIFY pgrst, 'reload schema';

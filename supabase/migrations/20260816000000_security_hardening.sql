-- 20260816000000_security_hardening.sql
-- Production release hardening. Safe: additive, reversible, no data dropped.

-- ─── 1. Self-signup can NEVER self-grant admin/owner ───────────────────────
-- handle_new_user reads role from auth metadata. Both the public sign-up form
-- and a hand-crafted auth.signUp() could pass role=owner/admin. Only staff
-- provisioning via the admin APIs/service role may set privileged roles, so the
-- trigger now downgrades any metadata role to a non-privileged default.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  -- Non-privileged roles self-signup users are allowed to claim.
  v_self_roles TEXT[] := ARRAY['broker','branch_manager','senior_agent','agent','telecaller'];
BEGIN
  IF v_role IS NULL OR NOT v_role = ANY(v_self_roles) THEN
    v_role := 'agent';
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

-- ─── 2. Prevent granted admins from self-elevating to owner ────────────────
-- Existing trigger only blocked non-admins. An admin could set their own role
-- to owner (and thereby take over the org). Now: only an existing OWNER may
-- change anyone's role to owner, and nobody may elevate their own role to a
-- higher privilege.
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
DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.user_profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE OF role, admin_id, is_active ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

-- ─── 3. admin_settings — reads for everyone, writes admin-only ─────────────
DROP POLICY IF EXISTS "authenticated_manage_admin_settings" ON public.admin_settings;
CREATE POLICY "authenticated_read_admin_settings" ON public.admin_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins_manage_admin_settings" ON public.admin_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner_v2())
  WITH CHECK (public.is_admin_or_owner_v2());

-- ─── 4. activity_log inserts must belong to the caller ─────────────────────
DROP POLICY IF EXISTS "authenticated_insert_activity_log" ON public.activity_log;
CREATE POLICY "authenticated_insert_activity_log" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_owner_v2() OR user_id = auth.uid());

-- ─── 5. lead_recommended_units — scope by lead access (IDOR fix) ───────────
DROP POLICY IF EXISTS "recommended_units_all" ON public.lead_recommended_units;
CREATE POLICY "recommended_units_read" ON public.lead_recommended_units
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_owner_v2()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
    )
  );
CREATE POLICY "recommended_units_write" ON public.lead_recommended_units
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_owner_v2()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
    )
  );

-- ─── 6. user_sessions — closing a session requires ownership ───────────────
-- (defense in depth; the API route already filters by user_id)
DROP POLICY IF EXISTS "authenticated_manage_own_sessions" ON public.user_sessions;
CREATE POLICY "authenticated_manage_own_sessions" ON public.user_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2())
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_owner_v2());

-- ─── 7. Indexes for the hot lead queries ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_updated ON public.leads (assigned_to, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_by_updated ON public.leads (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_team_updated ON public.leads (team, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_ups_date ON public.follow_ups (due_date);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON public.call_logs (user_id, created_at DESC);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
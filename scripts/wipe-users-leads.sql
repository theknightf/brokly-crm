-- ============================================================================
--  WIPE: delete ALL leads + ALL users except the owner(s)
--  Run in the Supabase Dashboard > SQL Editor (executes as service role/postgres).
--  ⚠ IRREVERSIBLE — take a database backup / snapshot BEFORE running.
--  Everything is wrapped in one transaction; if any step errors it rolls back.
-- ============================================================================

BEGIN;

-- 1) Safety guard: refuse to run if there is no user with role = 'owner'.
DO $$
DECLARE
  v_owners int;
BEGIN
  SELECT count(*) INTO v_owners FROM public.user_profiles WHERE role = 'owner';
  IF v_owners < 1 THEN
    RAISE EXCEPTION 'ABORT: no user_profiles row with role=owner found. Nothing deleted.';
  END IF;
  RAISE NOTICE 'Owners that will be KEPT: %', v_owners;
END
$$;

-- 2) Delete ALL leads. Children with ON DELETE CASCADE are removed automatically
--    (lead_comments, lead_recommended_units, lead_rotation_log,
--    duplicate_lead_attempts); lead_id on follow_ups/employee_activity_site_visits
--    is set NULL.
DO $$
DECLARE
  v_leads int;
BEGIN
  SELECT count(*) INTO v_leads FROM public.leads;
  DELETE FROM public.leads;
  RAISE NOTICE 'Leads deleted: %', v_leads;
END
$$;

-- 3) Delete every auth user EXCEPT the owner(s).
--    user_profiles.id -> auth.users(id) ON DELETE CASCADE, so non-owner profiles
--    are removed too; team_members linked to deleted profiles cascade as well.
--    Other tables that reference user_profiles use ON DELETE SET NULL (harmless).
DO $$
DECLARE
  v_before int;
  v_kept   int;
BEGIN
  SELECT count(*) INTO v_before FROM auth.users;
  SELECT count(*) INTO v_kept
    FROM auth.users
    WHERE id IN (SELECT id FROM public.user_profiles WHERE role = 'owner');
  DELETE FROM auth.users
    WHERE id NOT IN (SELECT id FROM public.user_profiles WHERE role = 'owner');
  RAISE NOTICE 'Auth users before: %, kept (owner): %, deleted: %',
    v_before, v_kept, (v_before - v_kept);
END
$$;

COMMIT;

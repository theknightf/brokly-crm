-- Keep auth.users.raw_user_meta_data.full_name in step with public.user_profiles.full_name.
--
-- public.user_profiles is the single source of truth for a user's display name. The JWT / auth
-- user_metadata copy was only written at sign-up, so after a rename it kept the OLD name (and any
-- code or token reading it showed stale data). This trigger pushes every later change forward.
--
-- SECURITY DEFINER because the app role cannot write auth.users; search_path is pinned.
-- One direction only (profile -> auth), so there is no trigger loop: handle_new_user() copies
-- metadata -> profile only on INSERT into auth.users.

CREATE OR REPLACE FUNCTION public.sync_profile_name_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    UPDATE auth.users
       SET raw_user_meta_data =
             COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', NEW.full_name)
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_name_to_auth ON public.user_profiles;
CREATE TRIGGER trg_sync_profile_name_to_auth
  AFTER UPDATE OF full_name ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_name_to_auth();

-- Optional one-off backfill for names that already drifted (NOT run automatically; review first):
--   UPDATE auth.users u
--      SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', p.full_name)
--     FROM public.user_profiles p
--    WHERE p.id = u.id AND p.full_name IS NOT NULL
--      AND COALESCE(u.raw_user_meta_data ->> 'full_name', '') <> p.full_name;

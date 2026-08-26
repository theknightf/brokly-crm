-- Hard-delete a user (auth.users row + cascading user_profiles). Runs as the DB
-- owner via SECURITY DEFINER so it bypasses GoTrue's admin API, which can 500
-- on some accounts. EXECUTE is restricted to the service_role so it cannot be
-- called directly by ordinary authenticated users through PostgREST.
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO service_role;

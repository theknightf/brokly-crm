-- 'it' is a privileged role: only an owner may grant it (same rule as admin / admin manager), and it may be created
-- by the service role. Patches the live function bodies in place.
DO $$
DECLARE d text; n text;
BEGIN
  FOR n IN SELECT unnest(ARRAY['handle_new_user','prevent_privilege_escalation'])
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=n;
    IF d IS NULL THEN RAISE EXCEPTION 'function % not found', n; END IF;
    d := replace(d, '''admin'',''limited_admin'',''broker''', '''admin'',''limited_admin'',''it'',''broker''');
    d := replace(d, 'IF NEW.role IN (''admin'',''limited_admin'',''owner'') THEN', 'IF NEW.role IN (''admin'',''limited_admin'',''it'',''owner'') THEN');
    d := replace(d, 'AND NEW.role IN (''admin'',''limited_admin'') AND NOT v_actor_is_owner', 'AND NEW.role IN (''admin'',''limited_admin'',''it'') AND NOT v_actor_is_owner');
    d := replace(d, 'IF OLD.role NOT IN (''admin'',''limited_admin'') THEN', 'IF OLD.role NOT IN (''admin'',''limited_admin'',''it'') THEN');
    IF position('''it''' in d) = 0 THEN RAISE EXCEPTION 'no change made to %', n; END IF;
    EXECUTE d;
  END LOOP;
END $$;

-- Performance-only: wrap row-independent functions in RLS policies as scalar sub-selects so Postgres
-- evaluates them ONCE per statement (InitPlan) instead of once per row.
--
-- Why: is_admin_or_owner_v2() reads public.user_profiles; called per row from the policies of ~25
-- tables it produced ~97M sequential scans of user_profiles and made every API call slow
-- (/rest/v1/* averaging 5-12s, statement timeouts, "Load failed" in the browser).
--
-- Only auth.uid(), is_admin_or_owner_v2() and get_current_user_team_id() are touched. All three are
-- STABLE (constant inside one statement), so access rules are unchanged. Policies that already wrap them
-- are left as they are.
DO $$
DECLARE
  p record;
  q text;
  w text;
  stmt text;
  fn text;
  fns text[] := ARRAY['auth.uid()', 'is_admin_or_owner_v2()', 'get_current_user_team_id()'];
  changed int := 0;
  i int;

  -- Rewrites one expression; wrapped occurrences are protected with a marker first.
  -- (nested helper implemented inline below via a loop)
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    q := p.qual;
    w := p.with_check;
    FOR i IN 1 .. array_length(fns, 1) LOOP
      fn := fns[i];
      IF q IS NOT NULL THEN
        q := replace(q, '( SELECT ' || fn, '(@@W' || i || '@@');
        q := replace(q, '(SELECT ' || fn, '(@@W' || i || '@@');
        q := replace(q, 'public.' || fn, fn);
        q := replace(q, fn, '(SELECT ' || fn || ')');
        q := replace(q, '(@@W' || i || '@@', '( SELECT ' || fn);
      END IF;
      IF w IS NOT NULL THEN
        w := replace(w, '( SELECT ' || fn, '(@@W' || i || '@@');
        w := replace(w, '(SELECT ' || fn, '(@@W' || i || '@@');
        w := replace(w, 'public.' || fn, fn);
        w := replace(w, fn, '(SELECT ' || fn || ')');
        w := replace(w, '(@@W' || i || '@@', '( SELECT ' || fn);
      END IF;
    END LOOP;

    IF q IS DISTINCT FROM p.qual OR w IS DISTINCT FROM p.with_check THEN
      stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      IF q IS NOT NULL AND q IS DISTINCT FROM p.qual THEN
        stmt := stmt || ' USING (' || q || ')';
      END IF;
      IF w IS NOT NULL AND w IS DISTINCT FROM p.with_check THEN
        stmt := stmt || ' WITH CHECK (' || w || ')';
      END IF;
      EXECUTE stmt;
      changed := changed + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'policies rewritten: %', changed;
END $$;

-- limited_admin = admin in every hard-coded role list (functions and policies). Patches the live definitions in place.
DO $$
DECLARE d text; n text; r record; q text; w text; sql text;
BEGIN
  FOR n IN SELECT unnest(ARRAY['is_duplicate_reviewer','is_lead_manager','require_note_for_stage_change','sales_performance','sales_performance_v2',
                               'duplicate_leads_route_flagged','leads_route_duplicate_before_insert','handle_new_user','prevent_privilege_escalation'])
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=n;
    IF d IS NULL THEN RAISE EXCEPTION 'function % not found', n; END IF;
    d := replace(d, '''owner_admin'', ''owneradmin'')', '''owner_admin'', ''owneradmin'', ''limited_admin'')');
    d := replace(d, 'IF v_role IN (''owner'', ''admin'') THEN', 'IF v_role IN (''owner'', ''admin'', ''limited_admin'') THEN');
    d := replace(d, 'not in (''owner'', ''admin'')', 'not in (''owner'', ''admin'', ''limited_admin'')');
    d := replace(d, 'role::text IN (''owner'', ''admin'')', 'role::text IN (''owner'', ''admin'', ''limited_admin'')');
    d := replace(d, 'role::text in (''owner'', ''admin'')', 'role::text in (''owner'', ''admin'', ''limited_admin'')');
    d := replace(d, '''admin'',''broker'',''branch_manager'',''team_leader''', '''admin'',''limited_admin'',''broker'',''branch_manager'',''team_leader''');
    d := replace(d, 'IF NEW.role = ''admin'' OR NEW.role = ''owner'' THEN', 'IF NEW.role IN (''admin'',''limited_admin'',''owner'') THEN');
    d := replace(d, 'AND NEW.role = ''admin'' AND NOT v_actor_is_owner', 'AND NEW.role IN (''admin'',''limited_admin'') AND NOT v_actor_is_owner');
    d := replace(d, 'IF OLD.role <> ''admin'' THEN', 'IF OLD.role NOT IN (''admin'',''limited_admin'') THEN');
    IF position('limited_admin' in d) = 0 THEN RAISE EXCEPTION 'no change made to %', n; END IF;
    EXECUTE d;
  END LOOP;
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public' AND
     ((tablename='user_profiles' AND policyname='admins_manage_profiles') OR (tablename='lead_sources' AND policyname='lead_sources_write')
      OR (tablename='import_logs' AND policyname IN ('import_logs_select_authorized','import_logs_update_authenticated')))
  LOOP
    q := replace(replace(r.qual, '''owner''::user_role]', '''owner''::user_role, ''limited_admin''::user_role]'), '''owner''::text, ''admin''::text,', '''owner''::text, ''admin''::text, ''limited_admin''::text,');
    w := r.with_check;
    IF w IS NOT NULL THEN
      w := replace(replace(w, '''owner''::user_role]', '''owner''::user_role, ''limited_admin''::user_role]'), '''owner''::text, ''admin''::text,', '''owner''::text, ''admin''::text, ''limited_admin''::text,');
    END IF;
    IF q IS NOT DISTINCT FROM r.qual AND w IS NOT DISTINCT FROM r.with_check THEN RAISE EXCEPTION 'policy % unchanged', r.policyname; END IF;
    sql := format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, q);
    IF w IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', w); END IF;
    EXECUTE sql;
  END LOOP;
END $$;

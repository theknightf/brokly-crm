-- Every written note counts as an action, including notes written from the call dialog and several notes on the
-- same customer at the same time (no 2-minute de-duplication).
DO $$
DECLARE d text; n text; before_len int;
BEGIN
  FOR n IN SELECT unnest(ARRAY['period_leaderboard','sales_performance_leads'])
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=n;
    IF d IS NULL THEN RAISE EXCEPTION 'function % not found', n; END IF;
    d := replace(d, 'public.is_hand_typed_note(', 'public.is_written_comment(');
    IF n = 'period_leaderboard' THEN
      before_len := length(d);
      d := regexp_replace(d, '\s+AND NOT EXISTS \(.*?public\.is_written_comment\(pc\.body\)\)', '');
    END IF;
    EXECUTE d;
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.is_hand_typed_note(text);

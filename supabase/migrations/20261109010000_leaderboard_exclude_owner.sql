-- Owners are not ranked: leave them out of every leaderboard (daily, period and team views all read period_leaderboard).
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.period_leaderboard(date,date)'::regprocedure);
  d := replace(d, 'WHERE u.is_active = true', $r$WHERE u.is_active = true AND u.role::text <> 'owner'$r$);
  IF position($r$u.role::text <> 'owner'$r$ in d) = 0 THEN RAISE EXCEPTION 'period_leaderboard definition did not match'; END IF;
  EXECUTE d;
END $$;

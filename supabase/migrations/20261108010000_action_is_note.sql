-- "Actions" on the leaderboards = the notes an agent writes (calls and status updates stay separate numbers).
-- daily_leaderboard and team_overview read period_leaderboard, so changing it here fixes all three.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.period_leaderboard(date,date)'::regprocedure);
  d := replace(d, 'r.status_updates AS total_actions', 'r.notes AS total_actions');
  EXECUTE d;
END $$;

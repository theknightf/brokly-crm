-- Actions = written notes, but several notes by the same agent on the same lead within 2 minutes of each other count as ONE
-- (a note that has an earlier written note from the same agent on the same lead in the previous 2 minutes is not counted again).
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.period_leaderboard(date,date)'::regprocedure);
  d := replace(
    d,
    $a$count(*) FILTER (WHERE a.action_type = 'NOTE' AND EXISTS (SELECT 1 FROM public.lead_comments lc WHERE lc.id::text = a.source_id AND public.is_written_comment(lc.body)))::int AS notes$a$,
    $b$count(*) FILTER (WHERE a.action_type = 'NOTE'
                       AND EXISTS (SELECT 1 FROM public.lead_comments lc WHERE lc.id::text = a.source_id AND public.is_written_comment(lc.body))
                       AND NOT EXISTS (
                         SELECT 1 FROM public.user_actions p
                         JOIN public.lead_comments pc ON pc.id::text = p.source_id
                         WHERE p.user_id = a.user_id AND p.lead_id IS NOT DISTINCT FROM a.lead_id AND p.action_type = 'NOTE'
                           AND (p.created_at < a.created_at OR (p.created_at = a.created_at AND p.id < a.id))
                           AND p.created_at >= a.created_at - interval '2 minutes'
                           AND public.is_written_comment(pc.body)))::int AS notes$b$
  );
  IF position('NOT EXISTS (' in d) = 0 OR position('interval ''2 minutes''' in d) = 0 THEN RAISE EXCEPTION 'period_leaderboard definition did not match'; END IF;
  EXECUTE d;
END $$;

-- "Actions" = notes a person wrote. Call logs and automatic entries never count:
--   * "[Device Call Sync …]" lines (written by the phone sync)
--   * "[Call • outcome • Ns]" / "[WhatsApp • …]" wrappers with no text, or with the app's placeholder "Call outcome logged"
-- A call wrapper that carries text the agent typed ("[Call • Not Interested • 40s] غير مهتمه") still counts as that written note.
CREATE OR REPLACE FUNCTION public.is_written_comment(p_body text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p_body IS NULL OR btrim(p_body) = '' THEN false
    WHEN p_body ~* '^\s*\[Device Call Sync' THEN false
    WHEN p_body ~* '^\s*\[(Call|WhatsApp)\s*•[^\]]*\]' THEN
      coalesce(nullif(btrim(regexp_replace(p_body, '^\s*\[[^\]]*\]\s*', '')), ''), 'Call outcome logged') <> 'Call outcome logged'
    ELSE true
  END
$f$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.period_leaderboard(date,date)'::regprocedure);
  d := replace(
    d,
    $a$count(*) FILTER (WHERE a.action_type = 'NOTE')::int AS notes$a$,
    $b$count(*) FILTER (WHERE a.action_type = 'NOTE' AND EXISTS (SELECT 1 FROM public.lead_comments lc WHERE lc.id::text = a.source_id AND public.is_written_comment(lc.body)))::int AS notes$b$
  );
  IF position('is_written_comment' in d) = 0 THEN RAISE EXCEPTION 'period_leaderboard definition did not match'; END IF;
  EXECUTE d;
END $$;

-- One-time backfill (Aya only, approved by the owner on 2026-11-09).
-- The Flutter "quick note" wrote into leads.notes ("[YYYY-MM-DD HH:MM:SS] text") but its lead_comments insert used a
-- non-existent column, so these notes never counted as actions. This copies Aya's quick notes into lead_comments with
-- their ORIGINAL time (Cairo), so they count on the right day. A note is attributed to Aya only when she worked on that
-- lead that same day (activity_log). Re-running inserts nothing (duplicate guard).
-- Side-effect triggers are paused for the insert so the leads are not marked as "acted on today".
BEGIN;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_lead_action_on_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_touch_lead_on_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_log_comment;

WITH lines AS (
  SELECT l.id AS lead_id, m[1] AS ts, btrim(m[2]) AS body
  FROM public.leads l, regexp_matches(l.notes, '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (?!\[)([^\n]*)', 'g') m
), mine AS (
  SELECT DISTINCT entity_id AS lid, (created_at AT TIME ZONE 'Africa/Cairo')::date AS d
  FROM public.activity_log
  WHERE user_id = '5e27ce5e-a6e0-40b7-9ed1-1dbdce984e53' AND entity_type = 'lead'
), cand AS (
  SELECT x.lead_id, x.body, (x.ts::timestamp AT TIME ZONE 'Africa/Cairo') AS created_at
  FROM lines x JOIN mine m ON m.lid = x.lead_id::text AND m.d = x.ts::date
  WHERE x.body <> ''
)
INSERT INTO public.lead_comments (lead_id, user_id, body, created_at)
SELECT c.lead_id, '5e27ce5e-a6e0-40b7-9ed1-1dbdce984e53'::uuid, c.body, c.created_at
FROM cand c
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_comments e
  WHERE e.lead_id = c.lead_id AND e.body = c.body AND abs(extract(epoch FROM e.created_at - c.created_at)) < 120
);

ALTER TABLE public.lead_comments ENABLE TRIGGER trg_lead_action_on_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_touch_lead_on_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_log_comment;
COMMIT;

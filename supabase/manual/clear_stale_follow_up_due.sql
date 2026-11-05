-- ONE-TIME cleanup (do NOT run as a recurring job). Not in supabase/migrations on purpose, so a `db push`
-- can never apply it by accident: it changes real lead data and is run once, after review.
--
-- Clears leads.follow_up_due for leads that were only stamped by the old DEFAULT CURRENT_DATE:
-- no call log, no logged action (user_actions) and no comment.
--
-- Review the counts first:
--   SELECT count(*) FROM public.leads l
--   WHERE l.follow_up_due IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.call_logs c WHERE c.lead_id = l.id OR c.entity_id = l.id::text)
--     AND NOT EXISTS (SELECT 1 FROM public.user_actions a WHERE a.lead_id = l.id)
--     AND NOT EXISTS (SELECT 1 FROM public.lead_comments lc WHERE lc.lead_id = l.id);

BEGIN;

-- These user triggers would otherwise treat the cleanup as a real edit: touch_lead_action_on_lead_update
-- stamps last_action_at = now(), leads_updated_at moves updated_at (the leaderboard counts deals by it) and
-- log_lead_change writes one activity row per lead. Disabled only for this transaction.
ALTER TABLE public.leads DISABLE TRIGGER trg_lead_action_on_lead;
ALTER TABLE public.leads DISABLE TRIGGER leads_updated_at;
ALTER TABLE public.leads DISABLE TRIGGER trg_log_lead;

CREATE TEMP TABLE cleared_leads ON COMMIT DROP AS
SELECT l.id
FROM public.leads l
WHERE l.follow_up_due IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.call_logs c WHERE c.lead_id = l.id OR c.entity_id = l.id::text)
  AND NOT EXISTS (SELECT 1 FROM public.user_actions a WHERE a.lead_id = l.id)
  AND NOT EXISTS (SELECT 1 FROM public.lead_comments lc WHERE lc.lead_id = l.id);

UPDATE public.leads SET follow_up_due = NULL WHERE id IN (SELECT id FROM cleared_leads);

-- Optional (only if you want the auto-created tasks gone from the follow-ups list too): cancel the still-open
-- follow_ups rows that were generated from those stale dates.
-- UPDATE public.follow_ups SET follow_up_status = 'Cancelled', updated_at = now()
-- WHERE lead_id IN (SELECT id FROM cleared_leads) AND follow_up_status::text NOT IN ('Completed', 'Cancelled');

ALTER TABLE public.leads ENABLE TRIGGER trg_lead_action_on_lead;
ALTER TABLE public.leads ENABLE TRIGGER leads_updated_at;
ALTER TABLE public.leads ENABLE TRIGGER trg_log_lead;

COMMIT;

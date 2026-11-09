-- One-time backfill (yassmen only, approved by the owner on 2026-11-09).
-- The website's call dialog saved the typed note in call_logs.notes only, so it never became a lead comment and never
-- counted as an action. This copies yassmen's written call notes into lead_comments with the original call time.
-- Re-running inserts nothing. Side-effect triggers are paused so leads are not marked as touched today.
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_lead_action_on_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_touch_lead_on_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_log_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_clear_due_follow_up_on_note;
INSERT INTO public.lead_comments (lead_id, user_id, body, created_at)
SELECT coalesce(c.lead_id, nullif(c.entity_id,'')::uuid), c.user_id,
       '[Call • ' || coalesce(nullif(btrim(c.outcome),''),'Call') || ' • ' || coalesce(c.duration_seconds,0) || 's] ' || btrim(c.notes), c.created_at
FROM public.call_logs c
WHERE c.user_id = (SELECT id FROM public.user_profiles WHERE full_name = 'yassmen')
  AND nullif(btrim(c.notes),'') IS NOT NULL AND btrim(c.notes) NOT IN ('Call outcome logged','Auto-synced from phone call log')
  AND coalesce(c.lead_id, nullif(c.entity_id,'')::uuid) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.lead_comments m WHERE m.lead_id = coalesce(c.lead_id, nullif(c.entity_id,'')::uuid) AND m.user_id = c.user_id AND m.body ILIKE '%' || btrim(c.notes) || '%');
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_lead_action_on_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_touch_lead_on_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_log_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_clear_due_follow_up_on_note;

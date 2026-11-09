-- One-time backfill for ALL sales users (everyone except owners), approved by the owner on 2026-11-09.
-- Notes typed in the website's call dialog were saved in call_logs.notes only, so they never became lead comments and
-- never counted as actions. Copies those written call notes into lead_comments with the original call time.
-- Re-running inserts nothing (duplicate guard). Side-effect triggers are paused so leads are not marked as touched today.
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_lead_action_on_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_touch_lead_on_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_log_comment;
ALTER TABLE public.lead_comments DISABLE TRIGGER trg_clear_due_follow_up_on_note;
INSERT INTO public.lead_comments (lead_id, user_id, body, created_at)
SELECT coalesce(c.lead_id, CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN c.entity_id::uuid END), c.user_id,
       '[Call • ' || coalesce(nullif(btrim(c.outcome),''),'Call') || ' • ' || coalesce(c.duration_seconds,0) || 's] ' || btrim(c.notes), c.created_at
FROM public.call_logs c JOIN public.user_profiles p ON p.id = c.user_id
WHERE p.role::text <> 'owner'
  AND nullif(btrim(c.notes),'') IS NOT NULL AND btrim(c.notes) NOT IN ('Call outcome logged','Auto-synced from phone call log')
  AND coalesce(c.lead_id, CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN c.entity_id::uuid END) IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = coalesce(c.lead_id, CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN c.entity_id::uuid END)) -- skip calls of deleted leads
  AND NOT EXISTS (SELECT 1 FROM public.lead_comments m WHERE m.lead_id = coalesce(c.lead_id, CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN c.entity_id::uuid END) AND m.user_id = c.user_id AND m.body ILIKE '%' || btrim(c.notes) || '%');
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_lead_action_on_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_touch_lead_on_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_log_comment;
ALTER TABLE public.lead_comments ENABLE TRIGGER trg_clear_due_follow_up_on_note;

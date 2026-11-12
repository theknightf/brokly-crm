-- Backfill: assign date + lead history from the data that already exists. Past priority and next-action-date
-- changes were never recorded, so they cannot be rebuilt. Bookkeeping triggers are paused so nothing else changes
-- (updated_at, last action, activity log).

ALTER TABLE public.leads DISABLE TRIGGER leads_updated_at;
ALTER TABLE public.leads DISABLE TRIGGER trg_log_lead;
ALTER TABLE public.leads DISABLE TRIGGER trg_lead_action_on_lead;

-- Assign date: when the current owner was put on the lead; leads without an owner keep NULL.
UPDATE public.leads l
   SET assigned_at = COALESCE(
     (SELECT max(la.assigned_at) FROM public.lead_assignees la WHERE la.lead_id = l.id AND la.user_id = l.assigned_to),
     l.created_at)
 WHERE l.assigned_to IS NOT NULL AND l.assigned_at IS NULL;

ALTER TABLE public.leads ENABLE TRIGGER leads_updated_at;
ALTER TABLE public.leads ENABLE TRIGGER trg_log_lead;
ALTER TABLE public.leads ENABLE TRIGGER trg_lead_action_on_lead;

-- Events written live since the triggers were created are kept; history is only taken from before that moment.
DO $$
DECLARE
  v_cut timestamptz;
BEGIN
  SELECT COALESCE(min(created_at), now()) INTO v_cut FROM public.lead_events WHERE type <> 'created';

  -- created
  INSERT INTO public.lead_events (lead_id, actor_id, type, new_value, created_at)
  SELECT l.id, up.id, 'created', NULL, l.created_at
  FROM public.leads l
  LEFT JOIN public.user_profiles up ON up.id = l.created_by
  WHERE NOT EXISTS (SELECT 1 FROM public.lead_events e WHERE e.lead_id = l.id AND e.type = 'created');

  -- stage changes (recorded with old -> new since August)
  INSERT INTO public.lead_events (lead_id, actor_id, type, old_value, new_value, created_at)
  SELECT a.lead_id, up.id, 'stage', a.payload->>'old_status', a.payload->>'new_status', a.created_at
  FROM public.user_actions a
  JOIN public.leads l ON l.id = a.lead_id
  LEFT JOIN public.user_profiles up ON up.id = a.user_id
  WHERE a.action_type = 'STATUS_CHANGE' AND a.created_at < v_cut
    AND a.payload->>'new_status' IS NOT NULL
    AND (a.payload->>'old_status') IS DISTINCT FROM (a.payload->>'new_status');

  -- assignments logged as "old_uuid -> new_uuid"
  INSERT INTO public.lead_events (lead_id, actor_id, type, old_value, new_value, created_at)
  SELECT l.id, up.id, 'assigned',
         NULLIF(btrim(split_part(al.meta, '->', 1)), ''),
         NULLIF(btrim(split_part(al.meta, '->', 2)), ''),
         al.created_at
  FROM public.activity_log al
  JOIN public.leads l ON l.id::text = al.entity_id
  LEFT JOIN public.user_profiles up ON up.id = al.user_id
  WHERE al.entity_type = 'lead' AND al.action_type = 'Lead Assigned' AND al.created_at < v_cut
    AND al.meta ~ '^([0-9a-f-]{36})? ?-> ?([0-9a-f-]{36})?$'
    AND NULLIF(btrim(split_part(al.meta, '->', 2)), '') IS NOT NULL;

  -- current owner when no assignment was logged
  INSERT INTO public.lead_events (lead_id, actor_id, type, new_value, created_at)
  SELECT l.id, up.id, 'assigned', l.assigned_to::text, l.assigned_at
  FROM public.leads l
  LEFT JOIN public.lead_assignees la ON la.lead_id = l.id AND la.user_id = l.assigned_to
  LEFT JOIN public.user_profiles up ON up.id = la.assigned_by
  WHERE l.assigned_to IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.lead_events e WHERE e.lead_id = l.id AND e.type = 'assigned');

  -- notes a person wrote
  INSERT INTO public.lead_events (lead_id, actor_id, type, ref_id, created_at)
  SELECT c.lead_id, up.id, 'note', c.id, c.created_at
  FROM public.lead_comments c
  JOIN public.leads l ON l.id = c.lead_id
  LEFT JOIN public.user_profiles up ON up.id = c.user_id
  WHERE public.is_written_comment(c.body) AND c.created_at < v_cut
    AND NOT EXISTS (SELECT 1 FROM public.lead_events e WHERE e.ref_id = c.id AND e.type = 'note');
END $$;

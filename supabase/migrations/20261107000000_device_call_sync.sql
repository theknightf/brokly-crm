-- Android device call-log sync (applied). Reuses public.call_logs; see the notes below.
--
-- What already exists and is reused (no new table):
--   public.call_logs  user_id (= the agent), entity_type/entity_id (+ lead_id), contact_phone, channel,
--                     direction, duration_seconds, outcome, notes, client_ref (UNIQUE), created_at (= call start)
--   RLS: insert only as yourself; select own / admin-owner / team leader; update own / admin-owner
--   AFTER INSERT triggers already update the lead's last_action_at/last_activity_at, write activity_log and
--   user_actions, so reports/dashboards/leaderboards pick synced calls up with no extra work.
--
-- Mapping of the requested fields onto the existing columns:
--   agent_id -> user_id | phone -> contact_phone | started_at -> created_at | source -> NEW column

-- 1) Where a row came from (manual log vs device sync). Constant default => metadata-only, no table rewrite.
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_source_check CHECK (source IN ('manual', 'device_sync'));

-- 2) Dedupe: the same agent + number + start time can exist once for device-synced calls.
--    Partial on purpose: manual logs are never constrained. (Current data has 0 duplicate groups.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_device_sync_unique
  ON public.call_logs (user_id, contact_phone, created_at)
  WHERE source = 'device_sync';

-- 3) Batch upload entry point. SECURITY INVOKER: it runs as the signed-in agent, so row-level security applies
--    to everything it reads (only leads this agent can see) and writes (user_id must be auth.uid()).
--    Defence in depth for the privacy rule: a call whose number matches no visible lead is DROPPED here even if a
--    client sent it, so numbers that are not leads can never be stored. Already-synced calls are skipped by
--    ON CONFLICT DO NOTHING (the new index and the existing UNIQUE client_ref).
--    Input:  [{"phone":"+201005015545","direction":"incoming|outgoing|missed",
--              "started_at":"2026-11-07T09:30:00Z","duration_seconds":42}, ...]   (max 500 per call)
--    Output: {"received":n,"matched":n,"inserted":n,"leads":n}
CREATE OR REPLACE FUNCTION public.sync_device_calls(p_calls jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_received int;
  v_matched int;
  v_inserted int;
  v_leads int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_calls IS NULL OR jsonb_typeof(p_calls) <> 'array' OR jsonb_array_length(p_calls) > 500 THEN
    RAISE EXCEPTION 'invalid batch' USING ERRCODE = '22023';
  END IF;
  v_received := jsonb_array_length(p_calls);

  -- One statement (no temp table): matched is used for both the count and the insert.
  WITH incoming AS (
    SELECT c->>'phone' AS phone,
           regexp_replace(c->>'phone', '\D', '', 'g') AS digits,
           lower(c->>'direction') AS direction,
           (c->>'started_at')::timestamptz AS started_at,
           GREATEST(COALESCE((c->>'duration_seconds')::int, 0), 0) AS duration
    FROM jsonb_array_elements(p_calls) c
    WHERE (c->>'phone') ~ '^\+[1-9][0-9]{7,14}$'
      AND lower(c->>'direction') IN ('incoming', 'outgoing', 'missed')
      AND (c->>'started_at') IS NOT NULL
  )
  , matched AS (
  SELECT i.*, l.id AS lead_id, l.name AS lead_name
  FROM incoming i
  JOIN LATERAL (
    -- leads.phone_normalized holds the national number without the leading 0 (e.g. 1005015545):
    -- the last 10 digits of the E.164 number. Prefer the lead assigned to this agent, then the newest.
    SELECT ld.id, ld.name
    FROM public.leads ld
    WHERE ld.phone_normalized = right(i.digits, 10)
    ORDER BY (ld.assigned_to = v_uid) DESC NULLS LAST, ld.created_at DESC
    LIMIT 1
  ) l ON true
  ),
  ins AS (
    INSERT INTO public.call_logs
      (user_id, entity_type, entity_id, lead_id, contact_name, contact_phone, channel, direction,
       duration_seconds, outcome, notes, client_ref, created_at, source)
    SELECT v_uid, 'lead', m.lead_id::text, m.lead_id,
           m.lead_name,                                   -- the lead's name from the CRM, never a device contact name
           m.phone, 'Call', m.direction, m.duration,
           CASE WHEN m.direction = 'missed' OR m.duration = 0 THEN 'No Answer' ELSE 'Answered' END,
           'Auto-synced from phone call log',
           'dev-' || (extract(epoch FROM m.started_at) * 1000)::bigint || '-' || m.digits,
           m.started_at, 'device_sync'
    FROM matched m
    -- Skip a call the agent already has: the post-call popup's auto-capture or a manual log of the same call
    -- (manual rows are stamped with the SAVE time, i.e. after the call ended).
    WHERE NOT EXISTS (
      SELECT 1 FROM public.call_logs c
      WHERE c.user_id = v_uid
        AND (c.lead_id = m.lead_id OR c.entity_id = m.lead_id::text)
        AND c.created_at BETWEEN m.started_at - interval '90 seconds'
                             AND m.started_at + (m.duration + 600) * interval '1 second'
    )
    ON CONFLICT DO NOTHING
    RETURNING lead_id
  )
  SELECT (SELECT count(*) FROM matched), count(*), count(DISTINCT lead_id)
    INTO v_matched, v_inserted, v_leads FROM ins;

  RETURN jsonb_build_object('received', v_received, 'matched', v_matched,
                            'inserted', v_inserted, 'leads', v_leads);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_device_calls(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_device_calls(jsonb) TO authenticated;

-- No RLS policy is changed. The existing policies already give: agent inserts/reads own calls, admins/owners
-- read all, team leaders read their team, agents/admins update (to add notes/outcome afterwards).

-- 4) OPTIONAL (needs your OK, not required for the feature): touch_lead_action_on_call() stamps the lead's
--    last_action_at with now(). For an import of old calls that would make a lead look "actioned just now".
--    This would use the call's own time for device_sync rows:
--
-- CREATE OR REPLACE FUNCTION public.touch_lead_action_on_call() ...
--   last_action_at = CASE WHEN NEW.source = 'device_sync'
--                         THEN GREATEST(COALESCE(leads.last_action_at, NEW.created_at), NEW.created_at)
--                         ELSE now() END

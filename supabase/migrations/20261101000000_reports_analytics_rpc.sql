-- ============================================================
-- Reports > Analytics: server-side aggregation (RPC) for the call analytics dashboard
-- ============================================================
-- NOT APPLIED automatically. Additive only: new functions + IF NOT EXISTS indexes.
-- Every function is SECURITY INVOKER, so RLS applies to the caller: admins see all calls and
-- leads, everyone else only what they are already allowed to see.
--
-- Definitions used by these reports (change them here, in one place):
--   * Lead of a call      = call_logs.lead_id, else call_logs.entity_id when it is a uuid.
--   * Result bucket       = no_answer : No Answer / No Answer At All / Busy / No Reply
--                           closed    : Closed Number / Wrong Phone / Wrong Number
--                           answered  : everything else (the customer picked up)
--   * Is Cold Call        = the lead's CURRENT stage is 'Cold Calls' (there is no cold-call flag).
--   * Assign date         = latest lead_assignees.assigned_at, else the lead's creation date.
--   * Leads / Assign From = leads the agent CURRENTLY owns. "Assign From" are the ones that were
--                           received through a reassignment (activity_log 'Lead Assigned', old -> new);
--                           "Leads" are the rest. Total = Leads + Assign From = all owned leads.
--   * Calls by hour       = calls divided by the number of distinct hours that had at least one call.
--   * Dates are interpreted in Africa/Cairo.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON public.call_logs (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_lead_assigned
  ON public.activity_log (entity_id) WHERE action_type = 'Lead Assigned';
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads (assigned_to) WHERE assigned_to IS NOT NULL;

-- ── Every call with its lead and the shared report filters applied ─────────
-- p keys (all optional): assignFrom, assignTo, actionFrom, actionTo, createdFrom, createdTo (YYYY-MM-DD),
--                        source, channel, isCold ('yes'|'no'), createdBy (uuid), userId (uuid)
CREATE OR REPLACE FUNCTION public.report_calls_scope(p jsonb)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  lead_id uuid,
  lead_name text,
  phone text,
  direction text,
  channel text,
  outcome text,
  duration_seconds integer,
  created_at timestamptz,
  bucket text,
  source text,
  is_cold boolean,
  lead_stage text,
  assigned_to uuid
)
LANGUAGE sql
STABLE
AS $$
  WITH f AS (
    SELECT
      NULLIF(p->>'assignFrom', '')::date  AS assign_from,
      NULLIF(p->>'assignTo', '')::date    AS assign_to,
      NULLIF(p->>'actionFrom', '')::date  AS action_from,
      NULLIF(p->>'actionTo', '')::date    AS action_to,
      NULLIF(p->>'createdFrom', '')::date AS created_from,
      NULLIF(p->>'createdTo', '')::date   AS created_to,
      NULLIF(p->>'source', '')            AS source,
      NULLIF(p->>'channel', '')           AS channel,
      NULLIF(p->>'isCold', '')            AS is_cold,
      NULLIF(p->>'createdBy', '')::uuid   AS created_by,
      NULLIF(p->>'userId', '')::uuid      AS user_id
  )
  SELECT
    c.id,
    c.user_id,
    l.id,
    l.name::text,
    COALESCE(NULLIF(l.phone, ''), c.contact_phone)::text,
    c.direction::text,
    c.channel::text,
    c.outcome::text,
    COALESCE(c.duration_seconds, 0)::integer,
    c.created_at,
    CASE
      WHEN c.outcome IN ('No Answer', 'No Answer At All', 'Busy', 'No Reply') THEN 'no_answer'
      WHEN c.outcome IN ('Closed Number', 'Wrong Phone', 'Wrong Number') THEN 'closed'
      ELSE 'answered'
    END,
    l.source::text,
    (l.crm_status = 'Cold Calls'),
    l.crm_status::text,
    l.assigned_to
  FROM public.call_logs c
  CROSS JOIN f
  LEFT JOIN public.leads l
    ON l.id = COALESCE(
         c.lead_id,
         CASE WHEN c.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN c.entity_id::uuid END
       )
  WHERE (f.user_id IS NULL OR c.user_id = f.user_id)
    AND (f.action_from IS NULL OR c.created_at >= (f.action_from::timestamp AT TIME ZONE 'Africa/Cairo'))
    AND (f.action_to   IS NULL OR c.created_at <  ((f.action_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo'))
    AND (f.channel IS NULL OR c.channel = f.channel)
    -- lead-level filters need a matching lead
    AND (
      (f.assign_from IS NULL AND f.assign_to IS NULL AND f.created_from IS NULL AND f.created_to IS NULL
        AND f.source IS NULL AND f.is_cold IS NULL AND f.created_by IS NULL)
      OR (
        l.id IS NOT NULL
        AND (f.created_from IS NULL OR l.created_at >= (f.created_from::timestamp AT TIME ZONE 'Africa/Cairo'))
        AND (f.created_to   IS NULL OR l.created_at <  ((f.created_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo'))
        AND (f.source IS NULL OR l.source = f.source)
        AND (f.created_by IS NULL OR l.created_by = f.created_by)
        AND (f.is_cold IS NULL
             OR (f.is_cold = 'yes' AND l.crm_status = 'Cold Calls')
             OR (f.is_cold = 'no' AND l.crm_status IS DISTINCT FROM 'Cold Calls'))
        AND (
          (f.assign_from IS NULL AND f.assign_to IS NULL)
          OR (
            COALESCE((SELECT max(la.assigned_at) FROM public.lead_assignees la WHERE la.lead_id = l.id), l.created_at)
              >= COALESCE((f.assign_from::timestamp AT TIME ZONE 'Africa/Cairo'), '-infinity'::timestamptz)
            AND COALESCE((SELECT max(la.assigned_at) FROM public.lead_assignees la WHERE la.lead_id = l.id), l.created_at)
              < COALESCE(((f.assign_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo'), 'infinity'::timestamptz)
          )
        )
      )
    );
$$;

-- ── Totals, outcome / dial split and the timeline series ────────────────────
-- p_frame: day (hourly, today) | weekly (7 days) | monthly (30 days) | year (12 months)
CREATE OR REPLACE FUNCTION public.report_call_analytics(p jsonb, p_frame text DEFAULT 'weekly')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_local_now timestamp := (now() AT TIME ZONE 'Africa/Cairo');
  v_trunc text;
  v_step interval;
  v_fmt text;
  v_start timestamp;
  v_totals jsonb;
  v_timeline jsonb;
BEGIN
  IF p_frame = 'day' THEN
    v_trunc := 'hour'; v_step := interval '1 hour'; v_fmt := 'HH24:00';
    v_start := date_trunc('day', v_local_now);
  ELSIF p_frame = 'monthly' THEN
    v_trunc := 'day'; v_step := interval '1 day'; v_fmt := 'DD Mon';
    v_start := date_trunc('day', v_local_now) - interval '29 days';
  ELSIF p_frame = 'year' THEN
    v_trunc := 'month'; v_step := interval '1 month'; v_fmt := 'Mon YY';
    v_start := date_trunc('month', v_local_now) - interval '11 months';
  ELSE
    v_trunc := 'day'; v_step := interval '1 day'; v_fmt := 'Dy DD';
    v_start := date_trunc('day', v_local_now) - interval '6 days';
  END IF;

  SELECT jsonb_build_object(
    'totalCalls', count(*),
    'callsByHour', COALESCE(round(count(*)::numeric / NULLIF(count(DISTINCT date_trunc('hour', s.created_at)), 0), 3), 0),
    'answered', count(*) FILTER (WHERE s.bucket = 'answered'),
    'noAnswer', count(*) FILTER (WHERE s.bucket = 'no_answer'),
    'closed', count(*) FILTER (WHERE s.bucket = 'closed'),
    'incoming', count(*) FILTER (WHERE s.direction = 'incoming'),
    'outgoing', count(*) FILTER (WHERE s.direction IS DISTINCT FROM 'incoming')
  ) INTO v_totals
  FROM public.report_calls_scope(p) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('label', to_char(g.ts, v_fmt), 'calls', COALESCE(t.n, 0)) ORDER BY g.ts), '[]'::jsonb)
    INTO v_timeline
  FROM generate_series(v_start, date_trunc(v_trunc, v_local_now), v_step) AS g(ts)
  LEFT JOIN (
    SELECT date_trunc(v_trunc, s.created_at AT TIME ZONE 'Africa/Cairo') AS b, count(*) AS n
    FROM public.report_calls_scope(p) s
    WHERE (s.created_at AT TIME ZONE 'Africa/Cairo') >= v_start
    GROUP BY 1
  ) t ON t.b = g.ts;

  RETURN v_totals || jsonb_build_object('timeline', v_timeline);
END;
$$;

-- ── Calls log: search + sort + pagination in SQL ────────────────────────────
CREATE OR REPLACE FUNCTION public.report_calls_log(
  p jsonb,
  p_search text DEFAULT '',
  p_sort text DEFAULT 'at',
  p_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_col text;
  v_dir text := CASE WHEN lower(p_dir) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_search text := btrim(COALESCE(p_search, ''));
  v_digits text := regexp_replace(COALESCE(p_search, ''), '\D', '', 'g');
  v_total integer;
  v_rows jsonb;
BEGIN
  -- whitelist: the sort key never reaches the SQL text as typed
  v_col := CASE p_sort
    WHEN 'lead' THEN 'lower(coalesce(s.lead_name, ''''))'
    WHEN 'phone' THEN 's.phone'
    WHEN 'agent' THEN 'lower(coalesce(up.full_name, ''''))'
    WHEN 'direction' THEN 's.direction'
    WHEN 'outcome' THEN 's.bucket'
    WHEN 'duration' THEN 's.duration_seconds'
    ELSE 's.created_at'
  END;

  EXECUTE format($q$
    WITH s AS (
      SELECT s.*, up.full_name AS agent_name, up.avatar_url AS agent_avatar,
             (SELECT up2.full_name FROM public.user_profiles up2 WHERE up2.id = s.assigned_to) AS owner_name
      FROM public.report_calls_scope($1) s
      LEFT JOIN public.user_profiles up ON up.id = s.user_id
      WHERE ($2 = '' OR s.lead_name ILIKE '%%' || $2 || '%%'
             OR up.full_name ILIKE '%%' || $2 || '%%'
             OR ($3 <> '' AND regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%%' || $3 || '%%'))
    )
    SELECT (SELECT count(*) FROM s)::int,
           COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rn), '[]'::jsonb)
    FROM (
      SELECT row_number() OVER (ORDER BY %1$s %2$s, s.created_at DESC, s.id) AS rn,
             s.id, s.lead_id, s.lead_name, s.phone, s.direction, s.channel, s.outcome, s.bucket,
             s.duration_seconds, s.created_at, s.source, s.is_cold, s.lead_stage,
             s.user_id, s.agent_name, s.agent_avatar, s.owner_name
      FROM s
      LEFT JOIN public.user_profiles up ON up.id = s.user_id
      ORDER BY %1$s %2$s, s.created_at DESC, s.id
      LIMIT $4 OFFSET $5
    ) r
  $q$, v_col, v_dir)
  INTO v_total, v_rows
  USING p, v_search, v_digits, LEAST(GREATEST(COALESCE(p_limit, 25), 1), 5000), GREATEST(COALESCE(p_offset, 0), 0);

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- ── Assigned report + pipeline stages per agent (current snapshot) ──────────
CREATE OR REPLACE FUNCTION public.report_assigned(p jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH f AS (
    SELECT
      NULLIF(p->>'assignFrom', '')::date  AS assign_from,
      NULLIF(p->>'assignTo', '')::date    AS assign_to,
      NULLIF(p->>'createdFrom', '')::date AS created_from,
      NULLIF(p->>'createdTo', '')::date   AS created_to,
      NULLIF(p->>'source', '')            AS source,
      NULLIF(p->>'isCold', '')            AS is_cold,
      NULLIF(p->>'createdBy', '')::uuid   AS created_by
  ),
  owned AS (
    SELECT l.id, l.assigned_to, l.crm_status
    FROM public.leads l CROSS JOIN f
    WHERE l.assigned_to IS NOT NULL
      AND (f.created_from IS NULL OR l.created_at >= (f.created_from::timestamp AT TIME ZONE 'Africa/Cairo'))
      AND (f.created_to   IS NULL OR l.created_at <  ((f.created_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo'))
      AND (f.source IS NULL OR l.source = f.source)
      AND (f.created_by IS NULL OR l.created_by = f.created_by)
      AND (f.is_cold IS NULL
           OR (f.is_cold = 'yes' AND l.crm_status = 'Cold Calls')
           OR (f.is_cold = 'no' AND l.crm_status IS DISTINCT FROM 'Cold Calls'))
      AND (
        (f.assign_from IS NULL AND f.assign_to IS NULL)
        OR (
          COALESCE((SELECT max(la.assigned_at) FROM public.lead_assignees la WHERE la.lead_id = l.id), l.created_at)
            >= COALESCE((f.assign_from::timestamp AT TIME ZONE 'Africa/Cairo'), '-infinity'::timestamptz)
          AND COALESCE((SELECT max(la.assigned_at) FROM public.lead_assignees la WHERE la.lead_id = l.id), l.created_at)
            < COALESCE(((f.assign_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo'), 'infinity'::timestamptz)
        )
      )
  ),
  recv AS (
    SELECT o.*,
           EXISTS (
             SELECT 1 FROM public.activity_log a
             WHERE a.entity_type = 'lead' AND a.entity_id = o.id::text AND a.action_type = 'Lead Assigned'
               AND NULLIF(split_part(a.meta, ' -> ', 1), '') IS NOT NULL
               AND split_part(a.meta, ' -> ', 2) = o.assigned_to::text
           ) AS via_reassign
    FROM owned o
  ),
  per_agent AS (
    SELECT r.assigned_to AS agent_id,
           count(*) FILTER (WHERE NOT r.via_reassign) AS leads_assigned,
           count(*) FILTER (WHERE r.via_reassign) AS assign_from,
           count(*) AS total,
           count(*) FILTER (WHERE r.crm_status = 'Following Up') AS following_up,
           count(*) FILTER (WHERE r.crm_status = 'Follow Up After Meeting') AS following_up_after_meeting,
           count(*) FILTER (WHERE r.crm_status = 'Interested') AS interested,
           count(*) FILTER (WHERE r.crm_status = 'Meeting') AS meeting,
           count(*) FILTER (WHERE r.crm_status = 'Reschedule Meeting') AS reschedule_meeting,
           count(*) FILTER (WHERE r.crm_status = 'Reservation') AS reserved,
           count(*) FILTER (WHERE r.crm_status = 'Done Deal') AS closed_won
    FROM recv r
    GROUP BY r.assigned_to
  )
  SELECT jsonb_build_object(
    'teams', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name) FROM public.teams t), '[]'::jsonb),
    'agents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'agentId', pa.agent_id,
        'agentName', COALESCE(NULLIF(up.full_name, ''), up.email, 'Unknown'),
        'teamId', up.team_id,
        'teamName', COALESCE(t.name, 'No team'),
        'leadsAssigned', pa.leads_assigned,
        'assignFrom', pa.assign_from,
        'total', pa.total,
        'stages', jsonb_build_object(
          'following_up', pa.following_up,
          'following_up_after_meeting', pa.following_up_after_meeting,
          'interested', pa.interested,
          'meeting', pa.meeting,
          'reschedule_meeting', pa.reschedule_meeting,
          'reserved', pa.reserved,
          'closed_won', pa.closed_won
        )
      ) ORDER BY pa.total DESC)
      FROM per_agent pa
      LEFT JOIN public.user_profiles up ON up.id = pa.agent_id
      LEFT JOIN public.teams t ON t.id = up.team_id
    ), '[]'::jsonb)
  );
$$;

-- ── Options for the filter drawer ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'sources', COALESCE((SELECT jsonb_agg(s ORDER BY s) FROM (SELECT DISTINCT btrim(source) AS s FROM public.leads WHERE btrim(COALESCE(source, '')) <> '') x), '[]'::jsonb),
    'channels', COALESCE((SELECT jsonb_agg(c ORDER BY c) FROM (SELECT DISTINCT channel AS c FROM public.call_logs WHERE COALESCE(channel, '') <> '') x), '[]'::jsonb),
    'agents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', COALESCE(NULLIF(full_name, ''), email)) ORDER BY COALESCE(NULLIF(full_name, ''), email))
                        FROM public.user_profiles WHERE is_active IS NOT FALSE), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.report_calls_scope(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_call_analytics(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_calls_log(jsonb, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_assigned(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_filter_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_calls_scope(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_call_analytics(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_calls_log(jsonb, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_assigned(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_filter_options() TO authenticated;

NOTIFY pgrst, 'reload schema';

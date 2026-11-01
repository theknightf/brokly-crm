-- report_assigned(): add every pipeline stage (allStages: {crm_status: count}) and each agent's
-- total calls (same filters as the Calls Log). The original `stages` object is kept.
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
  ),
  stage_counts AS (
    SELECT r.assigned_to AS agent_id, COALESCE(NULLIF(r.crm_status, ''), 'No stage') AS stage, count(*) AS n
    FROM recv r
    GROUP BY 1, 2
  ),
  stage_json AS (
    SELECT agent_id, jsonb_object_agg(stage, n) AS m FROM stage_counts GROUP BY agent_id
  ),
  call_counts AS (
    SELECT s.user_id AS agent_id, count(*) AS n FROM public.report_calls_scope(p) s GROUP BY s.user_id
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
        'calls', COALESCE(cc.n, 0),
        'allStages', COALESCE(sj.m, '{}'::jsonb),
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
      LEFT JOIN stage_json sj ON sj.agent_id = pa.agent_id
      LEFT JOIN call_counts cc ON cc.agent_id = pa.agent_id
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.report_assigned(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- Leaderboard over a date range (Cairo calendar days, inclusive), aggregated server-side (SECURITY DEFINER) so
-- every rep sees the whole team without being limited by row-level security, and without PostgREST's
-- 1000-row cap. daily_leaderboard(date) becomes a thin wrapper so the web and mobile boards share one source.
CREATE OR REPLACE FUNCTION public.period_leaderboard(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, full_name text, role text,
  calls integer, answered_calls integer, answered_leads integer,
  status_updates integer, meetings integer, deals integer, notes integer,
  leads_added integer, leads_acted integer, total_actions integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH win AS (
    SELECT (f::timestamp AT TIME ZONE 'Africa/Cairo') AS s,
           ((t + 1)::timestamp AT TIME ZONE 'Africa/Cairo') AS e
    FROM (
      SELECT coalesce(p_from, (now() AT TIME ZONE 'Africa/Cairo')::date) AS f,
             coalesce(p_to, p_from, (now() AT TIME ZONE 'Africa/Cairo')::date) AS t
    ) x
  ),
  cl AS (
    SELECT c.user_id, c.outcome,
           public.is_answered_outcome(c.outcome, c.channel, c.duration_seconds) AS answered,
           coalesce(
             c.lead_id,
             CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN c.entity_id::uuid END
           ) AS lead_uuid
    FROM public.call_logs c, win
    WHERE c.created_at >= win.s AND c.created_at < win.e AND c.user_id IS NOT NULL
  ),
  call_agg AS (
    SELECT user_id,
           count(*)::int AS calls,
           count(*) FILTER (WHERE answered)::int AS answered_calls,
           count(DISTINCT lead_uuid) FILTER (WHERE answered)::int AS answered_leads,
           count(*) FILTER (WHERE outcome IN ('Meeting', 'Schedule Meeting', 'Site Visit'))::int AS meeting_calls
    FROM cl GROUP BY user_id
  ),
  ua AS (
    SELECT a.user_id,
           count(*) FILTER (WHERE a.action_type = 'STATUS_CHANGE')::int AS status_updates,
           count(*) FILTER (WHERE a.action_type = 'NOTE')::int AS notes
    FROM public.user_actions a, win
    WHERE a.created_at >= win.s AND a.created_at < win.e AND a.user_id IS NOT NULL
    GROUP BY a.user_id
  ),
  visits AS (
    SELECT v.user_id, count(*)::int AS n
    FROM public.site_visits v, win
    WHERE v.check_in_at >= win.s AND v.check_in_at < win.e AND v.user_id IS NOT NULL
    GROUP BY v.user_id
  ),
  deals AS (
    SELECT l.assigned_to AS user_id, count(*)::int AS n
    FROM public.leads l, win
    WHERE l.crm_status = 'Done Deal' AND l.updated_at >= win.s AND l.updated_at < win.e AND l.assigned_to IS NOT NULL
    GROUP BY l.assigned_to
  ),
  added AS (
    SELECT u AS user_id, count(DISTINCT id)::int AS n
    FROM (
      SELECT l.id, l.assigned_to AS u FROM public.leads l, win WHERE l.created_at >= win.s AND l.created_at < win.e
      UNION ALL
      SELECT l.id, l.created_by FROM public.leads l, win WHERE l.created_at >= win.s AND l.created_at < win.e
    ) q
    WHERE u IS NOT NULL GROUP BY u
  ),
  acted AS (
    SELECT l.last_action_by AS user_id, count(*)::int AS n
    FROM public.leads l, win
    WHERE l.last_action_at >= win.s AND l.last_action_at < win.e AND l.last_action_by IS NOT NULL
    GROUP BY l.last_action_by
  ),
  rows_ AS (
    SELECT u.id AS user_id,
           coalesce(nullif(trim(u.full_name), ''), u.email, 'User') AS full_name,
           u.role::text AS role,
           coalesce(ca.calls, 0) AS calls,
           coalesce(ca.answered_calls, 0) AS answered_calls,
           coalesce(ca.answered_leads, 0) AS answered_leads,
           coalesce(ua.status_updates, 0) AS status_updates,
           coalesce(ca.meeting_calls, 0) + coalesce(vs.n, 0) AS meetings,
           coalesce(d.n, 0) AS deals,
           coalesce(ua.notes, 0) AS notes,
           coalesce(ad.n, 0) AS leads_added,
           coalesce(ac.n, 0) AS leads_acted
    FROM public.user_profiles u
    LEFT JOIN call_agg ca ON ca.user_id = u.id
    LEFT JOIN ua ON ua.user_id = u.id
    LEFT JOIN visits vs ON vs.user_id = u.id
    LEFT JOIN deals d ON d.user_id = u.id
    LEFT JOIN added ad ON ad.user_id = u.id
    LEFT JOIN acted ac ON ac.user_id = u.id
    WHERE u.is_active = true
  )
  SELECT r.user_id, r.full_name, r.role, r.calls, r.answered_calls, r.answered_leads,
         r.status_updates, r.meetings, r.deals, r.notes, r.leads_added, r.leads_acted,
         (r.calls + r.status_updates + r.meetings + r.deals + r.notes) AS total_actions
  FROM rows_ r
  ORDER BY total_actions DESC, r.full_name;
$$;

CREATE OR REPLACE FUNCTION public.daily_leaderboard(p_date date DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, full_name text, role text,
  calls integer, answered_calls integer, answered_leads integer,
  status_updates integer, meetings integer, deals integer, notes integer, total_actions integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.full_name, p.role, p.calls, p.answered_calls, p.answered_leads,
         p.status_updates, p.meetings, p.deals, p.notes, p.total_actions
  FROM public.period_leaderboard(p_date, p_date) p;
$$;

REVOKE ALL ON FUNCTION public.period_leaderboard(date, date), public.daily_leaderboard(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.period_leaderboard(date, date), public.daily_leaderboard(date) TO authenticated;

-- 1) New leads no longer get an automatic follow-up date.
--    leads.follow_up_due is already nullable; its DEFAULT CURRENT_DATE stamped every new/assigned lead with
--    "today". trg_follow_up_from_lead (sync_follow_up_from_lead) only creates a follow_ups row when the lead
--    has a follow_up_due, so with a NULL default nothing is scheduled until an agent schedules it.
ALTER TABLE public.leads ALTER COLUMN follow_up_due DROP DEFAULT;

-- 2) "Answered" = a call (not WhatsApp/other channel) where the lead actually picked up.
--    Unanswered outcomes: no answer, busy, closed/wrong number, voicemail, cancelled, no reply.
--    Unknown outcomes fall back to the call duration (> 0 seconds = connected).
CREATE OR REPLACE FUNCTION public.is_answered_outcome(p_outcome text, p_channel text, p_duration integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_channel, 'call'))) = 'call'
     AND CASE
       WHEN lower(replace(trim(coalesce(p_outcome, '')), '_', ' ')) IN (
         'no answer', 'no answer at all', 'busy', 'closed number', 'wrong phone', 'wrong number',
         'voicemail', 'cancelled', 'canceled', 'no reply', 'whatsapp sent', 'whatsapp follow-up'
       ) THEN false
       WHEN lower(replace(trim(coalesce(p_outcome, '')), '_', ' ')) IN (
         'answered', 'completed', 'connected', 'reached', 'interested', 'follow-up', 'follow up', 'followup',
         'follow up after meeting', 'call back later', 'callback', 'meeting', 'schedule meeting',
         'site visit', 'not interested', 'won deal', 'done deal'
       ) THEN true
       ELSE coalesce(p_duration, 0) > 0
     END;
$$;

-- Per-lead answered stats (RLS of the caller applies, so a user only sees leads they can see).
CREATE OR REPLACE VIEW public.lead_answered_stats WITH (security_invoker = true) AS
SELECT lead_uuid AS lead_id,
       count(*)::int AS answered_calls,
       max(created_at) AS last_answered_at
FROM (
  SELECT c.created_at,
         coalesce(
           c.lead_id,
           CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN c.entity_id::uuid END
         ) AS lead_uuid
  FROM public.call_logs c
  WHERE public.is_answered_outcome(c.outcome, c.channel, c.duration_seconds)
) a
WHERE lead_uuid IS NOT NULL
GROUP BY lead_uuid;

GRANT SELECT ON public.lead_answered_stats TO authenticated;

-- 3) Answered counters per rep (aggregates only, so every rep can see the team numbers).
--    p_from / p_to are Cairo calendar dates (inclusive); NULL = all time.
CREATE OR REPLACE FUNCTION public.answered_summary(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(user_id uuid, answered_calls integer, answered_leads integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT x.user_id,
         count(*)::int AS answered_calls,
         count(DISTINCT x.lead_uuid)::int AS answered_leads
  FROM (
    SELECT c.user_id, c.created_at,
           coalesce(
             c.lead_id,
             CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN c.entity_id::uuid END
           ) AS lead_uuid
    FROM public.call_logs c
    WHERE c.user_id IS NOT NULL
      AND public.is_answered_outcome(c.outcome, c.channel, c.duration_seconds)
      AND (p_from IS NULL OR c.created_at >= (p_from::timestamp AT TIME ZONE 'Africa/Cairo'))
      AND (p_to IS NULL OR c.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo'))
  ) x
  GROUP BY x.user_id;
$$;

-- 4) Daily leaderboard computed in SQL.
--    Fixes: (a) "today" and the 00:00-24:00 window were UTC, so Cairo activity between 00:00 and 02:00/03:00
--    landed on the wrong day; (b) the old API read call_logs/user_actions/leads under the caller's RLS, so a
--    sales rep only ever saw their own rows and the board was empty/wrong; (c) PostgREST's 1000-row cap
--    silently truncated the counts. This function aggregates server-side with COALESCE on every metric.
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
  WITH win AS (
    SELECT (d::timestamp AT TIME ZONE 'Africa/Cairo') AS s,
           ((d + 1)::timestamp AT TIME ZONE 'Africa/Cairo') AS e
    FROM (SELECT coalesce(p_date, (now() AT TIME ZONE 'Africa/Cairo')::date) AS d) t
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
           coalesce(ua.notes, 0) AS notes
    FROM public.user_profiles u
    LEFT JOIN call_agg ca ON ca.user_id = u.id
    LEFT JOIN ua ON ua.user_id = u.id
    LEFT JOIN visits vs ON vs.user_id = u.id
    LEFT JOIN deals d ON d.user_id = u.id
    WHERE u.is_active = true
  )
  SELECT r.user_id, r.full_name, r.role, r.calls, r.answered_calls, r.answered_leads,
         r.status_updates, r.meetings, r.deals, r.notes,
         (r.calls + r.status_updates + r.meetings + r.deals + r.notes) AS total_actions
  FROM rows_ r
  ORDER BY total_actions DESC, r.full_name;
$$;

REVOKE ALL ON FUNCTION public.answered_summary(date, date), public.daily_leaderboard(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answered_summary(date, date), public.daily_leaderboard(date) TO authenticated;

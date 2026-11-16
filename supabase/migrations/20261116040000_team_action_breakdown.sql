-- Team leader home: what the team actually did in a period, grouped in SQL.
-- One row per (actor, event type, target value): stage moves carry the stage the lead was moved TO,
-- notes / next actions carry NULL. SECURITY INVOKER: lead_events RLS applies (leads the caller can see),
-- and actors are limited to the caller's team (my_visible_user_ids) plus the caller.
CREATE OR REPLACE FUNCTION public.team_action_breakdown(p_from date, p_to date, p_member uuid DEFAULT NULL)
RETURNS TABLE (actor_id uuid, type text, new_value text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH team AS (
    SELECT m.id FROM public.my_visible_user_ids() AS m(id)
    UNION SELECT auth.uid()
  )
  SELECT e.actor_id,
         e.type,
         CASE WHEN e.type = 'stage' THEN COALESCE(NULLIF(e.new_value, ''), '—') END,
         COUNT(*)::bigint
  FROM public.lead_events e
  WHERE e.created_at >= (p_from::timestamp AT TIME ZONE 'Africa/Cairo')
    AND e.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
    AND e.type IN ('stage', 'note', 'next_action')
    AND e.actor_id IN (SELECT id FROM team)
    AND (p_member IS NULL OR e.actor_id = p_member)
  GROUP BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public.team_action_breakdown(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_action_breakdown(date, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

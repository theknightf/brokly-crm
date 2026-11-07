-- Per-member numbers for a team leader's dashboard. Returns rows ONLY for the people the caller leads (plus the
-- caller), so a regular agent or an unrelated user gets an empty result. Same Cairo-day windows and metrics as
-- period_leaderboard().
CREATE OR REPLACE FUNCTION public.team_overview(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, full_name text, role text, is_self boolean,
  calls integer, answered_calls integer, answered_leads integer,
  status_updates integer, meetings integer, deals integer, notes integer, total_actions integer,
  last_call_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH members AS (
    SELECT m.id FROM public.my_visible_user_ids() AS m(id)
    UNION
    SELECT auth.uid() WHERE EXISTS (SELECT 1 FROM public.my_visible_user_ids())
  )
  SELECT p.user_id, p.full_name, p.role, (p.user_id = auth.uid()) AS is_self,
         p.calls, p.answered_calls, p.answered_leads, p.status_updates, p.meetings, p.deals, p.notes,
         p.total_actions,
         (SELECT max(c.created_at) FROM public.call_logs c WHERE c.user_id = p.user_id) AS last_call_at
  FROM public.period_leaderboard(p_from, p_to) p
  WHERE p.user_id IN (SELECT id FROM members)
  ORDER BY p.total_actions DESC, p.full_name;
$$;

REVOKE ALL ON FUNCTION public.team_overview(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_overview(date, date) TO authenticated;

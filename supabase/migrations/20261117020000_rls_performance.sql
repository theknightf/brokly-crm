-- Row-level-security performance. Same rows are visible to everyone; only HOW the rule is evaluated changes.
-- Measured as an agent (aya, 3.8k leads / ~2.5k call_logs / ~3.2k comments), before -> after, per query:
--   select count(*) from leads          42 ms -> 6 ms     (lead_visible_to_sales ran once per row with a SET clause)
--   select count(*) from call_logs      37 ms -> 1 ms     (is_my_team_member() ran once per row)
--   select count(*) from lead_comments  4578 ms -> fast   (can_access_lead() ran once per row)
-- Equivalence checked before applying, for all 15 non-admin users: identical visible leads and call_logs counts, and
-- can_access_lead(id) = (id in visible leads) for every one of the 2,057 leads that have comments.
-- Rollback: recreate lead_visible_to_sales with "SET search_path TO ''", and set the two policies back to
--   leaders_view_team_call_logs USING (is_my_team_member(user_id))  and  lead_comments_select USING (can_access_lead(lead_id)).

-- 1) leads: the RESTRICTIVE policy leads_hide_duplicates_select calls this per row. Without SET it is a plain inlinable
--    SQL function (it only uses builtins and the schema-qualified auth.uid()), so no per-row call overhead.
CREATE OR REPLACE FUNCTION public.lead_visible_to_sales(p_status text, p_is_duplicate boolean, p_assigned_to uuid, p_released_to uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(p_status, '') <> 'Duplicate Leads'
     AND (NOT COALESCE(p_is_duplicate, false)
          OR (p_released_to IS NOT NULL AND p_released_to = auth.uid() AND p_assigned_to = auth.uid()));
$function$;

-- 2) call_logs: team leaders see their team's calls. Same rule as is_my_team_member(user_id), but as one set per query.
CREATE OR REPLACE FUNCTION public.my_team_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tm_member.user_id
  FROM public.team_memberships tm_leader
  JOIN public.team_memberships tm_member ON tm_leader.team_id = tm_member.team_id
  WHERE tm_leader.user_id = auth.uid() AND tm_leader.is_leader = true;
$function$;
REVOKE ALL ON FUNCTION public.my_team_member_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_member_ids() TO authenticated, service_role;

ALTER POLICY leaders_view_team_call_logs ON public.call_logs
  USING (user_id IN (SELECT public.my_team_member_ids()));

-- 3) lead_comments: same trick already used for lead_events — reuse the leads SELECT policies once per query.
ALTER POLICY lead_comments_select ON public.lead_comments
  USING ((SELECT public.is_admin_or_owner_v2()) OR lead_id IN (SELECT l.id FROM public.leads l));

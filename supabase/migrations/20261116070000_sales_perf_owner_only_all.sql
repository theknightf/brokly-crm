-- Sales performance visibility: only the OWNER sees every sales person.
-- Before: owners AND admins saw everyone (is_admin_or_owner_v2).
-- Now:
--   owner        → everyone
--   admin        → people assigned to them (user_profiles.admin_id) + self
--   team leader  → their team (is_leader_of_assignee) + self
--   anyone else  → only self
-- Only used by sales_performance, sales_performance_v2 and sales_performance_leads.
CREATE OR REPLACE FUNCTION public.sales_perf_visible(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
           select 1 from public.user_profiles me
           where me.id = auth.uid()
             and coalesce(me.is_active, true)
             and lower(trim(me.role::text)) in ('owner', 'owner_admin', 'owneradmin')
         )
      or p_user = auth.uid()
      or public.is_leader_of_assignee(p_user)
      or public.is_admin_of_user(p_user);
$function$;

-- For the employee report: how many of the leads an employee owns have no note AND no call log on them
-- (a call log counts as work, same as a written note). Counts all leads currently assigned to him.
create or replace function public.employee_unworked_leads(p_user uuid)
returns table(total_leads bigint, unworked_leads bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (
      where not exists (select 1 from lead_comments c where c.lead_id = l.id)
        and not exists (select 1 from call_logs k where k.entity_id = l.id::text)
    )::bigint
  from leads l
  where l.assigned_to = p_user;
$$;
grant execute on function public.employee_unworked_leads(uuid) to authenticated;

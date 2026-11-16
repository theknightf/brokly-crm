-- Sales performance: "Assigned leads" undercounted.
-- It only counted lead_events of type 'assigned'. A lead INSERTED with an owner (imports, leads created already
-- assigned) only gets a 'created' event, so it never counted (e.g. Naglaa: 3 shown vs 342 leads assigned to her in
-- 7 days, 339 of them from imports today with a backdated created_at).
--
-- Now a lead counts as assigned to a person in the period when EITHER
--   * an 'assigned' event to that person happened in the period (keeps leads later reassigned away), OR
--   * the lead is currently theirs and its assigned_at falls in the period (covers inserts / imports),
-- counted once per lead. The drill-down list uses the same rule.

CREATE OR REPLACE FUNCTION public.sales_performance_v2(p_from date, p_to date)
RETURNS TABLE(user_id uuid, full_name text, role text, assigned integer, duplicates integer, calls integer, actions integer, late integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with win as (
    select (p_from::timestamp at time zone 'Africa/Cairo') s, ((p_to + 1)::timestamp at time zone 'Africa/Cairo') e
  ),
  people as (
    select u.id, coalesce(nullif(trim(u.full_name), ''), u.email, 'User') full_name, u.role::text role
    from user_profiles u
    where coalesce(u.is_active, true) and u.role::text not in ('owner', 'admin') and public.sales_perf_visible(u.id)
  ),
  asg as (
    select q.uid, count(distinct q.lead_id)::int n
    from (
      select e.new_value::uuid uid, e.lead_id
      from lead_events e, win
      where e.type = 'assigned' and e.created_at >= win.s and e.created_at < win.e and e.new_value ~* '^[0-9a-f-]{36}$'
      union
      select l.assigned_to, l.id
      from leads l, win
      where l.assigned_to is not null and l.assigned_at >= win.s and l.assigned_at < win.e
    ) q
    group by 1
  ),
  dup as (
    select coalesce(d.original_owner_id, o.assigned_to, o.created_by) uid, count(*)::int n
    from duplicate_leads d left join leads o on o.id = d.original_lead_id, win
    where d.created_at >= win.s and d.created_at < win.e
    group by 1
  ),
  -- Late = overdue right now: next action date before today (Cairo) on an open lead. Not tied to the date filter.
  lt as (
    select l.assigned_to uid, count(*)::int n
    from leads l
    where l.follow_up_due < (now() at time zone 'Africa/Cairo')::date
      and coalesce(l.crm_status, '') not in ('Done Deal','Won','Lost','Cancellation','Not Interested','Duplicate Leads','Wrong Number','Closed Number','Low Budget')
    group by 1
  ),
  lb as (select * from public.period_leaderboard(p_from, p_to))
  select p.id, p.full_name, p.role, coalesce(a.n, 0), coalesce(dd.n, 0), coalesce(lb.calls, 0), coalesce(lb.total_actions, 0), coalesce(lt.n, 0)
  from people p
  left join asg a on a.uid = p.id
  left join dup dd on dd.uid = p.id
  left join lb on lb.user_id = p.id
  left join lt on lt.uid = p.id
  order by p.full_name;
$function$;

CREATE OR REPLACE FUNCTION public.sales_performance_leads(p_user uuid, p_kind text, p_from date, p_to date)
RETURNS TABLE(lead_id uuid, name text, phone text, stage text, owner text, happened_at timestamp with time zone, detail text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  s timestamptz := (p_from::timestamp at time zone 'Africa/Cairo');
  e timestamptz := ((p_to + 1)::timestamp at time zone 'Africa/Cairo');
  by_calls boolean;
begin
  if not public.sales_perf_visible(p_user) then return; end if;
  select coalesce(actions_from_calls, false) into by_calls from user_profiles where id = p_user;

  if p_kind = 'assigned' then
    return query
      select l.id, l.name, l.phone, l.crm_status, ou.full_name, max(q.happened), null::text
      from (
        select ev.lead_id, ev.created_at as happened
        from lead_events ev
        where ev.type = 'assigned' and ev.new_value = p_user::text and ev.created_at >= s and ev.created_at < e
        union all
        select x.id, x.assigned_at
        from leads x
        where x.assigned_to = p_user and x.assigned_at >= s and x.assigned_at < e
      ) q
      join leads l on l.id = q.lead_id
      left join user_profiles ou on ou.id = l.assigned_to
      group by l.id, l.name, l.phone, l.crm_status, ou.full_name
      order by 6 desc;
  elsif p_kind = 'duplicates' then
    return query
      select o.id, coalesce(d.attempted_data->>'name', o.name), coalesce(d.attempted_data->>'phone', o.phone), o.crm_status,
             au.full_name, d.created_at, 'Duplicate of: ' || coalesce(o.name, '-') || ' (' || d.status || ')'
      from duplicate_leads d
      left join leads o on o.id = d.original_lead_id
      left join user_profiles au on au.id = d.attempted_by
      where d.created_at >= s and d.created_at < e and coalesce(d.original_owner_id, o.assigned_to, o.created_by) = p_user
      order by d.created_at desc;
  elsif p_kind = 'late' then
    return query
      select l.id, l.name, l.phone, l.crm_status, ou.full_name, (l.follow_up_due::timestamp at time zone 'Africa/Cairo'),
             ((now() at time zone 'Africa/Cairo')::date - l.follow_up_due)::text || ' day(s) late'
      from leads l
      left join user_profiles ou on ou.id = l.assigned_to
      where l.assigned_to = p_user and l.follow_up_due < (now() at time zone 'Africa/Cairo')::date
        and coalesce(l.crm_status, '') not in ('Done Deal','Won','Lost','Cancellation','Not Interested','Duplicate Leads','Wrong Number','Closed Number','Low Budget')
      order by l.follow_up_due;
  elsif p_kind = 'calls' or (p_kind = 'actions' and by_calls) then
    return query
      select l.id, l.name, l.phone, l.crm_status, ou.full_name, max(c.created_at), count(*)::text || ' call(s)'
      from call_logs c
      join leads l on l.id = coalesce(c.lead_id, case when c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then c.entity_id::uuid end)
      left join user_profiles ou on ou.id = l.assigned_to
      where c.user_id = p_user and lower(c.channel) = 'call' and c.created_at >= s and c.created_at < e
      group by l.id, l.name, l.phone, l.crm_status, ou.full_name
      order by 6 desc;
  elsif p_kind = 'actions' then
    return query
      select l.id, l.name, l.phone, l.crm_status, ou.full_name, max(lc.created_at), count(*)::text || ' note(s)'
      from lead_comments lc
      join leads l on l.id = lc.lead_id
      left join user_profiles ou on ou.id = l.assigned_to
      where lc.user_id = p_user and lc.created_at >= s and lc.created_at < e and public.is_written_comment(lc.body)
      group by l.id, l.name, l.phone, l.crm_status, ou.full_name
      order by 6 desc;
  end if;
end;
$function$;

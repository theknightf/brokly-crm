-- Weekly agents report (read-only).
-- SECURITY INVOKER: every row it reads goes through the caller's RLS, so an agent sees only
-- themselves, a team leader only their team, an admin/owner everyone.
-- Days are Cairo days. "Overdue" = next action date before today on a lead whose stage is still open.
create or replace function public.weekly_agents_report(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
closed(s) as (
  select unnest(array['Done Deal','Won','Lost','Cancellation','Not Interested','Duplicate Leads',
                      'Wrong Number','Closed Number','Low Budget'])
),
today as (select (now() at time zone 'Africa/Cairo')::date as d),
rng as (
  select (p_from::timestamp at time zone 'Africa/Cairo') as t0,
         ((p_to + 1)::timestamp at time zone 'Africa/Cairo') as t1
),
agents as (
  select p.id, p.full_name, p.role::text as role, p.team_id
  from user_profiles p
  where coalesce(p.is_active, true)
    and lower(p.role::text) in ('agent','team_leader','senior_agent','telecaller','broker')
    and (is_admin_or_owner_v2() or p.id = auth.uid() or is_leader_of_assignee(p.id) or is_admin_of_user(p.id))
),
l as (
  select x.id, x.name, x.assigned_to, coalesce(x.crm_status, 'Fresh Leads') as stage, x.follow_up_due,
         x.last_action_at, x.assigned_at, x.priority,
         coalesce(x.crm_status, '') in (select s from closed) as is_closed
  from leads x
  join agents a on a.id = x.assigned_to
),
ev as (
  select e.actor_id, e.lead_id, e.type, e.new_value, (e.created_at at time zone 'Africa/Cairo')::date as d
  from lead_events e, rng
  where e.created_at >= rng.t0 and e.created_at < rng.t1
    and e.type in ('stage','note','next_action')
    and e.actor_id in (select id from agents)
),
calls as (
  select c.user_id, (c.created_at at time zone 'Africa/Cairo')::date as d
  from call_logs c, rng
  where c.created_at >= rng.t0 and c.created_at < rng.t1
    and c.user_id in (select id from agents)
),
days as (select gs::date as d from generate_series(p_from, p_to, interval '1 day') gs)
select jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'today', (select d from today),
  'agents', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'name', a.full_name,
        'role', a.role,
        'team', (select t.name from teams t where t.id = a.team_id),
        'daily', (
          select jsonb_agg(jsonb_build_object(
            'day', dd.d,
            'stage', (select count(*) from ev where ev.actor_id = a.id and ev.d = dd.d and ev.type = 'stage'),
            'notes', (select count(*) from ev where ev.actor_id = a.id and ev.d = dd.d and ev.type = 'note'),
            'nextAction', (select count(*) from ev where ev.actor_id = a.id and ev.d = dd.d and ev.type = 'next_action'),
            'calls', (select count(*) from calls c where c.user_id = a.id and c.d = dd.d),
            'leads', (select count(distinct ev.lead_id) from ev where ev.actor_id = a.id and ev.d = dd.d)
          ) order by dd.d)
          from days dd
        ),
        'leadsTouched', (select count(distinct ev.lead_id) from ev where ev.actor_id = a.id),
        'stagesNow', coalesce((
          select jsonb_object_agg(s.stage, s.n) from (
            select stage, count(*) as n from l where l.assigned_to = a.id group by stage
          ) s), '{}'::jsonb),
        'movedTo', coalesce((
          select jsonb_object_agg(m.new_value, m.n) from (
            select coalesce(new_value, '—') as new_value, count(*) as n
            from ev where ev.actor_id = a.id and ev.type = 'stage' group by 1
          ) m), '{}'::jsonb),
        'totalLeads', (select count(*) from l where l.assigned_to = a.id),
        'openLeads', (select count(*) from l where l.assigned_to = a.id and not l.is_closed),
        'newAssigned', (select count(*) from l, rng where l.assigned_to = a.id
                          and l.assigned_at >= rng.t0 and l.assigned_at < rng.t1),
        'overdue', (select count(*) from l, today where l.assigned_to = a.id and not l.is_closed
                      and l.follow_up_due < today.d),
        'dueToday', (select count(*) from l, today where l.assigned_to = a.id and not l.is_closed
                       and l.follow_up_due = today.d),
        'dueNext7', (select count(*) from l, today where l.assigned_to = a.id and not l.is_closed
                       and l.follow_up_due > today.d and l.follow_up_due <= today.d + 7),
        'noNextAction', (select count(*) from l where l.assigned_to = a.id and not l.is_closed
                           and l.follow_up_due is null),
        'untouched', (select count(*) from l, rng where l.assigned_to = a.id and not l.is_closed
                        and (l.last_action_at is null or l.last_action_at < rng.t0)),
        'overdueList', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', o.id, 'name', o.name, 'stage', o.stage, 'due', o.follow_up_due,
                   'daysLate', (select d from today) - o.follow_up_due, 'lastAction', o.last_action_at)
                 order by o.rk, o.follow_up_due, o.name)
          from (
            select l.*, case l.stage when 'Meeting' then 1 when 'Interested' then 2 when 'Following Up' then 3 else 4 end as rk
            from l, today where l.assigned_to = a.id and not l.is_closed and l.follow_up_due < today.d
            order by rk, l.follow_up_due limit 150
          ) o), '[]'::jsonb),
        'hotList', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', h.id, 'name', h.name, 'stage', h.stage, 'due', h.follow_up_due,
                   'lastAction', h.last_action_at, 'priority', h.priority)
                 order by h.rk, h.follow_up_due nulls last)
          from (
            select l.*, case l.stage when 'Meeting' then 1 when 'Interested' then 2 else 3 end as rk
            from l where l.assigned_to = a.id and not l.is_closed
              and l.stage in ('Meeting','Interested','Following Up')
            order by rk, l.follow_up_due nulls last limit 100
          ) h), '[]'::jsonb)
      ) order by a.full_name)
    from agents a
  ), '[]'::jsonb)
);
$$;

revoke all on function public.weekly_agents_report(date, date) from public, anon;
grant execute on function public.weekly_agents_report(date, date) to authenticated;

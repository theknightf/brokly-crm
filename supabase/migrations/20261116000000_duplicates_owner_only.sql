-- APPLIED 2026-11-16 as Supabase migration `duplicates_owner_only` in an ADDITIVE form:
--   * new SELECT/UPDATE policies duplicate_leads_owner_select / _owner_update (original_owner_id = auth.uid()),
--     added next to the existing reviewer policies instead of dropping them (permissive policies OR together)
--   * index idx_duplicate_leads_owner, function leads_route_duplicate_before_insert, trigger trg_aa_leads_route_duplicate
--   * NOT applied: the original_lead_id FK change (still ON DELETE CASCADE) — drops are blocked from the tool.
-- The draft below is the original reviewed version.

-- DRAFT FOR REVIEW — not applied yet.
-- Duplicate leads: never inserted into `leads`; stored in `duplicate_leads`; visible only to the
-- owner of the original lead (and admins/managers).
--
-- One source of truth: a BEFORE INSERT trigger on `leads` that runs FIRST. When the phone already
-- exists it records the attempt in duplicate_leads and returns NULL, so the row is silently not
-- inserted. This covers every entry path (web form, Flutter app, sheet import, /api routes,
-- webhooks, SQL) without changing how they insert.

begin;

-- 1) Columns the spec asks for, as readable aliases of the existing ones
--    (attempted_by = entered_by, original_owner_id = owner_id, attempted_data = submitted data).
--    original_lead_id becomes nullable so a duplicate survives if the original lead is deleted.
alter table public.duplicate_leads alter column original_lead_id drop not null;
alter table public.duplicate_leads drop constraint if exists duplicate_leads_original_lead_id_fkey;
alter table public.duplicate_leads
  add constraint duplicate_leads_original_lead_id_fkey
  foreign key (original_lead_id) references public.leads(id) on delete set null;

create index if not exists idx_duplicate_leads_owner on public.duplicate_leads (original_owner_id, created_at desc);
-- (idx_duplicate_leads_original on original_lead_id already exists)

-- 2) RLS: owner of the original lead, or admin/owner/manager (existing is_duplicate_reviewer()).
drop policy if exists duplicate_leads_select on public.duplicate_leads;
create policy duplicate_leads_select on public.duplicate_leads
  for select to authenticated
  using (original_owner_id = (select auth.uid()) or (select public.is_duplicate_reviewer()));

drop policy if exists duplicate_leads_update on public.duplicate_leads;
create policy duplicate_leads_update on public.duplicate_leads
  for update to authenticated
  using (original_owner_id = (select auth.uid()) or (select public.is_duplicate_reviewer()));
-- INSERT stays as is (only the SECURITY DEFINER trigger/RPC writes rows); no DELETE policy.

-- 3) The gate.
create or replace function public.leads_route_duplicate_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(new.phone);
  v_orig  record;
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_data  jsonb;
begin
  -- "Keep both" resolution and admin tools insert on purpose.
  if coalesce(current_setting('brokly.dup_separate', true), '') = '1' then
    return new;
  end if;
  if char_length(coalesce(v_phone, '')) < 8 then
    return new;
  end if;

  select l.id, coalesce(l.assigned_to, l.created_by) as owner_id, l.created_by
    into v_orig
  from public.leads l
  where l.phone_normalized = v_phone
    and coalesce(l.is_duplicate, false) = false
  order by l.created_at asc, l.id asc
  limit 1;

  if not found then
    return new;                       -- not a duplicate: insert normally
  end if;

  v_data := to_jsonb(new) - 'phone_normalized';

  perform set_config('brokly.dup_rpc', '1', true);
  insert into public.duplicate_leads
    (original_lead_id, original_owner_id, original_added_by, attempted_by, attempted_data, match_type, source)
  values
    (v_orig.id, v_orig.owner_id, v_orig.created_by, v_actor, v_data, 'phone', 'attempt')
  on conflict (original_lead_id, attempted_by) where status = 'pending' and duplicate_lead_id is null
  do update set attempted_data  = excluded.attempted_data,
                attempt_count   = public.duplicate_leads.attempt_count + 1,
                last_attempt_at = now();

  -- Tell the owner (in-app); the existing toast/bell picks it up.
  if v_orig.owner_id is not null then
    insert into public.notifications (user_id, title, message, reference_link, channel)
    values (v_orig.owner_id, 'Duplicate lead needs review',
            'A lead that already exists was entered again: ' || coalesce(nullif(new.name, ''), new.phone),
            '/duplicates', 'in_app');
  end if;

  return null;                        -- do NOT insert into leads
end;
$$;

-- Runs before every other BEFORE INSERT trigger on leads (triggers fire in name order).
drop trigger if exists trg_aa_leads_route_duplicate on public.leads;
create trigger trg_aa_leads_route_duplicate
  before insert on public.leads
  for each row execute function public.leads_route_duplicate_before_insert();

commit;

-- NOT included (needs your decision — see the plan):
--  * the 214 legacy duplicate rows that already sit in `leads` (is_duplicate = true)
--  * changing a lead's phone to an existing number (UPDATE path, today handled by leads_flag_duplicate)

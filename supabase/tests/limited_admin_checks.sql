-- Manual check: run in the SQL editor. Everything is rolled back by the final RAISE; read the RESULTS line.
-- Expected: direct delete rows=0 (or DENIED); soft delete DENIED x2; bulk delete rows=0; rpc merge DENIED;
-- limited_admin normal update rows=1; ADMIN rpc merge ok; ADMIN bulk delete rows=2.
do $$
declare own uuid; adm uuid; la uuid; lead_a uuid; lead_b uuid; lead_c uuid; dupid uuid; res text := ''; n int;
begin
  select id into own from user_profiles where role::text='owner' limit 1;
  select id into adm from user_profiles where role::text='admin' limit 1;
  select id into la from user_profiles where role::text='agent' and is_active limit 1;
  update user_profiles set role='limited_admin' where id=la;
  perform set_config('brokly.dup_separate','1',true);
  insert into leads(name,phone,created_by,assigned_to) values ('LA test A','01055500001',own,own) returning id into lead_a;
  insert into leads(name,phone,created_by,assigned_to) values ('LA test B','01055500001',own,own) returning id into lead_b;
  insert into leads(name,phone,created_by,assigned_to) values ('LA test C','01055500003',own,own) returning id into lead_c;
  perform set_config('brokly.dup_separate','0',true);
  insert into duplicate_leads(original_lead_id, attempted_by, attempted_data, match_type, source, duplicate_lead_id)
    values (lead_a, own, jsonb_build_object('phone','01055500001','id',lead_b), 'phone','existing', lead_b) returning id into dupid;
  perform set_config('request.jwt.claim.sub', la::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub',la,'role','authenticated')::text, true);
  set local role authenticated;
  begin delete from leads where id=lead_a; get diagnostics n = row_count; res := res||'direct delete: rows='||n||E'\n'; exception when others then res := res||'direct delete: DENIED ('||sqlerrm||E')\n'; end;
  begin update leads set merged_into=lead_a where id=lead_b; res := res||'soft delete merged_into: ALLOWED'||E'\n'; exception when others then res := res||'soft delete merged_into: DENIED'||E'\n'; end;
  begin update leads set crm_status='Duplicate Leads' where id=lead_c; res := res||'soft delete stage: ALLOWED'||E'\n'; exception when others then res := res||'soft delete stage: DENIED'||E'\n'; end;
  begin delete from leads where id in (lead_a, lead_b, lead_c); get diagnostics n = row_count; res := res||'bulk delete: rows='||n||E'\n'; exception when others then res := res||'bulk delete: DENIED'||E'\n'; end;
  begin perform resolve_duplicate_lead(dupid,'merge'); res := res||'rpc merge/delete: ALLOWED'||E'\n'; exception when others then res := res||'rpc merge/delete: DENIED ('||sqlerrm||E')\n'; end;
  begin update leads set notes='ok' where id=lead_c; get diagnostics n = row_count; res := res||'limited_admin normal update: rows='||n||E'\n'; exception when others then res := res||'limited_admin normal update: DENIED '||sqlerrm||E'\n'; end;
  reset role;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform resolve_duplicate_lead(dupid,'merge'); res := res||'ADMIN rpc merge: ok'||E'\n'; exception when others then res := res||'ADMIN rpc merge: '||sqlerrm||E'\n'; end;
  begin delete from leads where id in (lead_a, lead_c); get diagnostics n = row_count; res := res||'ADMIN bulk delete: rows='||n||E'\n'; exception when others then res := res||'ADMIN bulk delete: DENIED '||sqlerrm||E'\n'; end;
  reset role;
  raise exception E'RESULTS\n%', res;
end $$;

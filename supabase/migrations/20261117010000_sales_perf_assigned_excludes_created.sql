-- Sales performance: "Assigned leads" no longer includes leads the person created themselves.
-- A lead inserted with its creator as owner gets assigned_at = now(), so it was counted as "assigned" by the
-- assigned_at branch added in 20261116060000. Those leads now show only in the "Created leads" column.
-- Rule: a lead counts as assigned only when its owner is not the person who created it (created_by is null or someone
-- else), via the assigned_at branch. 'assigned' events (someone assigned/reassigned it to them) are unchanged.
-- Applied to both the count (sales_performance_v2) and the click-through list (sales_performance_leads) so they match.
-- The functions are patched in place, so their other logic and execute rights stay exactly as they are.

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.sales_performance_v2(date,date)'::regprocedure);
  IF position('where l.assigned_to is not null and l.assigned_at >= win.s and l.assigned_at < win.e' IN d) = 0 THEN
    RAISE EXCEPTION 'sales_performance_v2: expected assigned_at branch not found';
  END IF;
  d := replace(d,
    'where l.assigned_to is not null and l.assigned_at >= win.s and l.assigned_at < win.e',
    'where l.assigned_to is not null and l.assigned_at >= win.s and l.assigned_at < win.e and l.created_by is distinct from l.assigned_to');
  EXECUTE d;

  d := pg_get_functiondef('public.sales_performance_leads(uuid,text,date,date)'::regprocedure);
  IF position('where x.assigned_to = p_user and x.assigned_at >= s and x.assigned_at < e' IN d) = 0 THEN
    RAISE EXCEPTION 'sales_performance_leads: expected assigned_at branch not found';
  END IF;
  d := replace(d,
    'where x.assigned_to = p_user and x.assigned_at >= s and x.assigned_at < e',
    'where x.assigned_to = p_user and x.assigned_at >= s and x.assigned_at < e and x.created_by is distinct from x.assigned_to');
  EXECUTE d;
END $$;

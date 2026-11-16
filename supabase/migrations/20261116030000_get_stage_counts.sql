-- Home dashboard: lead counts per pipeline stage AND per source, computed in SQL.
-- The dashboard used to fetch lead rows and count them in the browser, which silently stopped at PostgREST's
-- 1000-row limit ("1000 active leads" while the stage cards showed 1,472).
--
-- SECURITY INVOKER: the caller's leads RLS applies, so every user sees exactly the leads they can open —
-- the same rows as the leads list and lead_status_counts_filtered().
-- Stage resolution matches lead_status_counts_filtered(): crm_status, else lead_status, else 'Fresh Leads'.
CREATE OR REPLACE FUNCTION public.get_stage_counts()
RETURNS TABLE (kind text, key text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 'stage'::text AS kind,
         COALESCE(NULLIF(l.crm_status::text, ''), NULLIF(l.lead_status::text, ''), 'Fresh Leads') AS key,
         COUNT(*)::bigint
  FROM public.leads l
  GROUP BY 2
  UNION ALL
  SELECT 'source'::text,
         COALESCE(NULLIF(btrim(l.source::text), ''), 'Unknown'),
         COUNT(*)::bigint
  FROM public.leads l
  GROUP BY 2;
$$;

REVOKE ALL ON FUNCTION public.get_stage_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_counts() TO authenticated;

NOTIFY pgrst, 'reload schema';

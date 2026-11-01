-- Revenue summed in SQL instead of shipping every Done Deal row to the browser (PostgREST also caps at 1000 rows).
-- SECURITY INVOKER: RLS still decides which leads each user's total includes.
CREATE OR REPLACE FUNCTION public.deal_revenue()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(COALESCE(NULLIF(final_price, 0), total_price, 0)), 0)
  FROM public.leads
  WHERE crm_status IN ('Done Deal', 'Won');
$$;

REVOKE ALL ON FUNCTION public.deal_revenue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deal_revenue() TO authenticated;

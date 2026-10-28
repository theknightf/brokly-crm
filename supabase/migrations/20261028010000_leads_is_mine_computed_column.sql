-- Computed column for PostgREST: "this lead is mine" = assigned to me OR I am
-- one of its lead_assignees. The app used to fetch every lead id the user is
-- assigned to and put them all in the request URL (id.in.(...)); with ~1000
-- assignments the URL exceeded the gateway limit and the leads list failed with
-- 400 Bad Request. Filtering with `or=(is_mine.eq.true)` keeps the URL tiny.
-- SECURITY INVOKER: RLS on leads / lead_assignees still applies to the caller.
CREATE OR REPLACE FUNCTION public.is_mine(l public.leads)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(l.assigned_to = auth.uid(), false)
      OR EXISTS (
        SELECT 1 FROM public.lead_assignees la
        WHERE la.lead_id = l.id AND la.user_id = auth.uid()
      );
$$;

GRANT EXECUTE ON FUNCTION public.is_mine(public.leads) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Advisor follow-up for the duplicate-leads change.
-- get_lead_kpi_counts (unused by the apps) answered lead counts per stage to anyone, even signed out.
REVOKE EXECUTE ON FUNCTION public.get_lead_kpi_counts(uuid, uuid[], timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_lead_kpi_counts(uuid, uuid[], timestamptz, timestamptz) FROM anon, public;
-- Trigger-only functions do not need to be callable over the API (triggers fire regardless of grants).
REVOKE EXECUTE ON FUNCTION public.leads_flag_duplicate() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.leads_duplicate_release() FROM anon, authenticated, public;
-- Signed-out callers have nothing to probe.
REVOKE EXECUTE ON FUNCTION public.lead_exists(text, text) FROM anon, public;

-- Duplicates page: a light index (id + the ORIGINAL lead's source) of the duplicates in a status, used by the Source
-- filter and "Select all". Reviewers only (owner / admin / limited_admin).
CREATE OR REPLACE FUNCTION public.duplicate_leads_index(p_status text DEFAULT 'pending')
RETURNS TABLE (id uuid, created_at timestamptz, lead_source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF NOT public.is_duplicate_reviewer() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT d.id, d.created_at, COALESCE(NULLIF(trim(l.source), ''), '')::text
    FROM public.duplicate_leads d
    LEFT JOIN public.leads l ON l.id = d.original_lead_id
    WHERE p_status = 'all' OR d.status = p_status
    ORDER BY d.created_at DESC, d.id;
END;
$f$;
REVOKE ALL ON FUNCTION public.duplicate_leads_index(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_leads_index(text) TO authenticated;

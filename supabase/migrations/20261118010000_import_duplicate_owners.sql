-- For Import History: for each phone found as a duplicate in a sheet, who owned the existing lead FIRST
-- (earliest 'assigned' event, else the creator) and who owns it NOW (assigned_to, else creator).
-- Called only by the role-gated import-history API with the service key.
CREATE OR REPLACE FUNCTION public.import_duplicate_owners(p_phones text[])
RETURNS TABLE (phone_key text, lead_id uuid, lead_name text, stage text, added_on date,
               first_owner text, current_owner text, created_by_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  WITH want AS (SELECT DISTINCT public.normalize_phone(p) AS k FROM unnest(p_phones) p WHERE p IS NOT NULL),
  hit AS (
    SELECT DISTINCT ON (w.k) w.k, l.id, l.name, l.crm_status, l.created_at, l.created_by, l.assigned_to
    FROM want w JOIN public.leads l ON public.normalize_phone(l.phone) = w.k
    WHERE coalesce(l.is_duplicate, false) = false
    ORDER BY w.k, l.created_at ASC
  )
  SELECT h.k, h.id, h.name, h.crm_status, h.created_at::date,
    coalesce(fo.full_name, cb.full_name),
    coalesce(co.full_name, cb.full_name),
    cb.full_name
  FROM hit h
  LEFT JOIN LATERAL (
    SELECT e.new_value FROM public.lead_events e
    WHERE e.lead_id = h.id AND e.type = 'assigned' AND e.new_value ~* '^[0-9a-f-]{36}$'
    ORDER BY e.created_at ASC LIMIT 1) fe ON true
  LEFT JOIN public.user_profiles fo ON fo.id::text = fe.new_value
  LEFT JOIN public.user_profiles co ON co.id = h.assigned_to
  LEFT JOIN public.user_profiles cb ON cb.id = h.created_by;
$f$;
REVOKE ALL ON FUNCTION public.import_duplicate_owners(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_duplicate_owners(text[]) TO service_role;

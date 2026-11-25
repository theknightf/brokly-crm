-- Import History: "who had the original lead first". The person who merely ADDED the lead (an owner/admin who
-- uploaded it and then assigned it away) is not the first owner. First owner = the first real salesperson it was
-- assigned to (earliest 'assigned' event to a non-owner/admin user); if there is no such event the lead was never
-- moved, so the first owner is whoever holds it now; creator is the last resort.
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
    coalesce(fo.full_name, fo_any.full_name, co.full_name, cb.full_name),
    coalesce(co.full_name, cb.full_name),
    cb.full_name
  FROM hit h
  LEFT JOIN LATERAL (
    SELECT u.full_name FROM public.lead_events e
    JOIN public.user_profiles u ON e.new_value ~* '^[0-9a-f-]{36}$' AND u.id::text = e.new_value
    WHERE e.lead_id = h.id AND e.type = 'assigned' AND u.role::text NOT IN ('owner','admin','limited_admin')
    ORDER BY e.created_at ASC LIMIT 1) fo ON true
  LEFT JOIN LATERAL (
    SELECT u.full_name FROM public.lead_events e
    JOIN public.user_profiles u ON e.new_value ~* '^[0-9a-f-]{36}$' AND u.id::text = e.new_value
    WHERE e.lead_id = h.id AND e.type = 'assigned'
    ORDER BY e.created_at ASC LIMIT 1) fo_any ON true
  LEFT JOIN public.user_profiles co ON co.id = h.assigned_to
  LEFT JOIN public.user_profiles cb ON cb.id = h.created_by;
$f$;
REVOKE ALL ON FUNCTION public.import_duplicate_owners(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_duplicate_owners(text[]) TO service_role;

-- Stage counts use the same search rules as the leads list (see src/lib/leadSearch.ts):
--  * a phone-like query matches phone_normalized ("+20 100 123 4567" finds 01001234567)
--  * several words must ALL appear somewhere in name / email / phone / location / project / agent
--  * NULL-safe: a lead with an empty column must not pass for a word it does not contain
CREATE OR REPLACE FUNCTION public.lead_status_counts_filtered(p_search text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_project text DEFAULT NULL::text, p_property_type text DEFAULT NULL::text, p_only_mine boolean DEFAULT false, p_member_ids uuid[] DEFAULT NULL::uuid[], p_owner_ids uuid[] DEFAULT NULL::uuid[], p_agent_text text DEFAULT NULL::text)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT btrim(coalesce(p_search, '')) AS raw,
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '^0020', ''), '^20(?=\d{10})', ''), '^0', '') AS digits,
           (btrim(coalesce(p_search, '')) ~ '^[0-9[:space:]+().-]+$'
            AND length(regexp_replace(coalesce(p_search, ''), '\D', '', 'g')) >= 3) AS is_phone
  ), words AS (
    SELECT w FROM q, regexp_split_to_table(regexp_replace(q.raw, '[,()"\]', ' ', 'g'), '\s+') AS w WHERE w <> '' LIMIT 5
  )
  SELECT COALESCE(NULLIF(l.crm_status::text, ''), NULLIF(l.lead_status::text, ''), 'Fresh Leads') AS status, COUNT(*)::bigint
  FROM public.leads l, q
  WHERE (NOT COALESCE(p_only_mine, false) OR l.is_mine)
    AND (p_member_ids IS NULL
         OR l.assigned_to = ANY (p_member_ids)
         OR l.created_by  = ANY (p_member_ids))
    AND (p_source IS NULL OR p_source = '' OR l.source::text = p_source)
    AND (p_project IS NULL OR p_project = '' OR l.project::text = p_project)
    AND (p_property_type IS NULL OR p_property_type = '' OR l.property_type::text = p_property_type)
    AND (q.raw = ''
         OR (q.is_phone AND q.digits <> '' AND (l.phone_normalized ILIKE '%' || q.digits || '%' OR l.phone ILIKE '%' || q.raw || '%'))
         OR (NOT q.is_phone AND NOT EXISTS (
              SELECT 1 FROM words
              WHERE (l.name ILIKE '%' || words.w || '%'
                      OR l.email ILIKE '%' || words.w || '%'
                      OR l.phone ILIKE '%' || words.w || '%'
                      OR l.location ILIKE '%' || words.w || '%'
                      OR l.project ILIKE '%' || words.w || '%'
                      OR l.agent ILIKE '%' || words.w || '%'
                      OR (words.w ~ '^\d{4,}$' AND l.phone_normalized ILIKE '%' || regexp_replace(regexp_replace(words.w, '^0020', ''), '^0', '') || '%')) IS NOT TRUE)))
    AND (p_owner_ids IS NULL
         OR l.assigned_to = ANY (p_owner_ids)
         OR EXISTS (SELECT 1 FROM public.lead_assignees la
                    WHERE la.lead_id = l.id AND la.user_id = ANY (p_owner_ids))
         OR (l.assigned_to IS NULL AND p_agent_text IS NOT NULL AND l.agent ILIKE '%' || p_agent_text || '%'))
  GROUP BY 1;
$function$;

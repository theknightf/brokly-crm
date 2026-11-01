-- Per-stage lead counts for the Leads Management stage tabs, computed in SQL.
--
-- Before: the client downloaded every lead (crm_status, lead_status) page by page and counted in
-- JavaScript, on every load and filter change. Now one GROUP BY returns one row per stage.
--
-- SECURITY INVOKER: RLS on public.leads applies to the caller exactly as for a normal select.
-- The role scoping the app adds on top of RLS is passed in explicitly:
--   p_only_mine   -> sales agents: only leads that are theirs (is_mine)
--   p_member_ids  -> team leaders: leads assigned to / created by these users
--   neither       -> admins: everything RLS allows
-- Filters mirror applyLeadFilters() in crmService.ts for the simple cases; the client falls back to
-- the old path for the filters that are not expressible here (activity/call date filters, etc.).

CREATE INDEX IF NOT EXISTS idx_leads_crm_status ON public.leads (crm_status);

CREATE OR REPLACE FUNCTION public.lead_status_counts_filtered(
  p_search        text    DEFAULT NULL,
  p_source        text    DEFAULT NULL,
  p_project       text    DEFAULT NULL,
  p_property_type text    DEFAULT NULL,
  p_only_mine     boolean DEFAULT false,
  p_member_ids    uuid[]  DEFAULT NULL,
  p_owner_ids     uuid[]  DEFAULT NULL,
  p_agent_text    text    DEFAULT NULL
)
RETURNS TABLE (status text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(l.crm_status::text, ''), NULLIF(l.lead_status::text, ''), 'Fresh Leads') AS status, COUNT(*)::bigint
  FROM public.leads l
  WHERE (NOT COALESCE(p_only_mine, false) OR l.is_mine)
    AND (p_member_ids IS NULL
         OR l.assigned_to = ANY (p_member_ids)
         OR l.created_by  = ANY (p_member_ids))
    AND (p_source IS NULL OR p_source = '' OR l.source::text = p_source)
    AND (p_project IS NULL OR p_project = '' OR l.project::text = p_project)
    AND (p_property_type IS NULL OR p_property_type = '' OR l.property_type::text = p_property_type)
    AND (p_search IS NULL OR btrim(p_search) = ''
         OR l.name     ILIKE '%' || btrim(p_search) || '%'
         OR l.email    ILIKE '%' || btrim(p_search) || '%'
         OR l.phone    ILIKE '%' || btrim(p_search) || '%'
         OR l.location ILIKE '%' || btrim(p_search) || '%')
    -- Owner filter: the real owner (assigned_to / co-assignee); the legacy `agent` text only
    -- counts for leads that have no owner at all.
    AND (p_owner_ids IS NULL
         OR l.assigned_to = ANY (p_owner_ids)
         OR EXISTS (SELECT 1 FROM public.lead_assignees la
                    WHERE la.lead_id = l.id AND la.user_id = ANY (p_owner_ids))
         OR (l.assigned_to IS NULL AND p_agent_text IS NOT NULL AND l.agent ILIKE '%' || p_agent_text || '%'))
  GROUP BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.lead_status_counts_filtered(text, text, text, text, boolean, uuid[], uuid[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';

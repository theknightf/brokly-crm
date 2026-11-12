-- Phone lead list: sort/filter by next action date per agent, and each card's last note in one call per page.

CREATE INDEX IF NOT EXISTS idx_leads_assigned_follow_up_due ON public.leads (assigned_to, follow_up_due);

-- Last written note (time + one-line preview) for a page of leads. SECURITY INVOKER: the caller's RLS on
-- lead_comments applies, so nobody gets a preview of a lead they cannot see.
CREATE OR REPLACE FUNCTION public.lead_last_notes(p_ids uuid[])
RETURNS TABLE (lead_id uuid, last_note_at timestamptz, preview text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT DISTINCT ON (c.lead_id)
         c.lead_id,
         c.created_at,
         left(
           btrim(regexp_replace(split_part(regexp_replace(c.body, '^\s*\[[^\]]*\]\s*', ''), E'\n', 1), '\s+', ' ', 'g')),
           90
         )
  FROM public.lead_comments c
  WHERE c.lead_id = ANY (p_ids)
    AND public.is_written_comment(c.body)
  ORDER BY c.lead_id, c.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_last_notes(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_last_notes(uuid[]) TO authenticated;

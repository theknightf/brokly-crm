-- Latest call per lead (for the "last call" line on the mobile lead card). security_invoker: the caller's RLS decides
-- which calls they can see, exactly like reading call_logs directly.
CREATE OR REPLACE VIEW public.lead_last_call WITH (security_invoker = true) AS
SELECT DISTINCT ON (lid)
       lid AS lead_id, created_at, outcome, duration_seconds, direction, source
FROM (
  SELECT coalesce(
           c.lead_id,
           CASE WHEN c.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN c.entity_id::uuid END
         ) AS lid,
         c.created_at, c.outcome, c.duration_seconds, c.direction, c.source
  FROM public.call_logs c
  WHERE lower(c.channel) = 'call'
) x
WHERE lid IS NOT NULL
ORDER BY lid, created_at DESC;

GRANT SELECT ON public.lead_last_call TO authenticated;

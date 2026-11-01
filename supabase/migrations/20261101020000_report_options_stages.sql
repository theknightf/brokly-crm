-- report_filter_options(): also return every configured pipeline stage / status
-- (admin_settings pipelineStages + statuses, active), so the Funnel Matrix shows all of them.
CREATE OR REPLACE FUNCTION public.report_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'sources', COALESCE((SELECT jsonb_agg(s ORDER BY s) FROM (SELECT DISTINCT btrim(source) AS s FROM public.leads WHERE btrim(COALESCE(source, '')) <> '') x), '[]'::jsonb),
    'channels', COALESCE((SELECT jsonb_agg(c ORDER BY c) FROM (SELECT DISTINCT channel AS c FROM public.call_logs WHERE COALESCE(channel, '') <> '') x), '[]'::jsonb),
    'agents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', COALESCE(NULLIF(full_name, ''), email)) ORDER BY COALESCE(NULLIF(full_name, ''), email))
                        FROM public.user_profiles WHERE is_active IS NOT FALSE), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(n ORDER BY n) FROM (
                SELECT DISTINCT btrim(name) AS n FROM public.admin_settings
                WHERE category IN ('pipelineStages', 'statuses') AND is_active IS NOT FALSE AND btrim(COALESCE(name, '')) <> ''
              ) x), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.report_filter_options() TO authenticated;
NOTIFY pgrst, 'reload schema';

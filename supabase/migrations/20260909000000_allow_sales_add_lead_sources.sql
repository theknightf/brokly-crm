-- Allow all active authenticated users (sales, team leaders, managers, admins, owners) to insert lead sources
DROP POLICY IF EXISTS lead_sources_insert ON public.lead_sources;
CREATE POLICY lead_sources_insert ON public.lead_sources FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_active = true)
);

-- Keep update/delete restricted to admins and owners
DROP POLICY IF EXISTS lead_sources_write ON public.lead_sources;
CREATE POLICY lead_sources_write ON public.lead_sources FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin','owner') AND is_active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin','owner') AND is_active = true)
);

-- Dedicated lead_sources per spec: dynamic source management
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_sources_active ON public.lead_sources(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lead_sources_name ON public.lead_sources(lower(name));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_lead_sources_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_lead_sources_updated_at ON public.lead_sources;
CREATE TRIGGER trg_lead_sources_updated_at BEFORE UPDATE ON public.lead_sources
FOR EACH ROW EXECUTE FUNCTION public.set_lead_sources_updated_at();

-- RLS: authenticated read active, admin/owner write
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_sources_select ON public.lead_sources;
CREATE POLICY lead_sources_select ON public.lead_sources FOR SELECT USING (true);
DROP POLICY IF EXISTS lead_sources_write ON public.lead_sources;
CREATE POLICY lead_sources_write ON public.lead_sources FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin','owner') AND is_active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin','owner') AND is_active = true)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_sources TO authenticated;

-- Backfill from admin_settings leadSources if present, then from distinct leads.source
INSERT INTO public.lead_sources (name, is_active)
SELECT DISTINCT name, COALESCE(is_active, true) FROM public.admin_settings WHERE category = 'leadSources' AND name IS NOT NULL AND trim(name) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.lead_sources (name)
SELECT DISTINCT trim(source) FROM public.leads WHERE source IS NOT NULL AND trim(source) <> ''
ON CONFLICT (name) DO NOTHING;

-- Ensure default fallback source exists
INSERT INTO public.lead_sources (name) VALUES ('Other') ON CONFLICT (name) DO NOTHING;

-- Add FK to leads (nullable for graceful existing data)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lead_source_id ON public.leads(lead_source_id);

-- Backfill existing leads.lead_source_id from text source
UPDATE public.leads l SET lead_source_id = s.id
FROM public.lead_sources s
WHERE l.lead_source_id IS NULL AND lower(trim(l.source)) = lower(s.name);

-- Keep text source column for display, but FK is source of truth going forward
NOTIFY pgrst, 'reload schema';

-- ONE list of lead sources for the whole site: public.lead_sources.
-- Before: the Admin > Lead Sources tab edited admin_settings (category 'leadSources'), while forms, import and the phone app
-- read lead_sources, and the leads filter merged both plus hard-coded names. The two tables disagreed, and 124 leads had a
-- source text but no lead_source_id.
--
-- This migration:
--  1) adds to lead_sources the 6 names that only existed in the Admin tab (kept active/inactive as the admin had them) and
--     the 2 names leads already use but the table lacked ('Facebook Ads', 'Meta Ads' - added INACTIVE, so they stay
--     filterable for the leads that carry them but are not offered for new leads). Nothing is merged or deleted.
--  2) links every lead whose source text matches a lead_sources name to that row (lead_source_id), quietly: triggers are
--     skipped, so no activity log rows and no last-action / updated_at changes.
--  3) leads_sync_source(): from now on source text and lead_source_id stay in step. Picking an id sets the name; typing a name
--     that matches a source (any case/spacing) sets the canonical name + id. A free-text source that is not in the table
--     (e.g. an import with a new channel) is left as typed.
--  4) rename_lead_source(): renaming a source also renames it on its leads, without touching updated_at or the activity log
--     (the two triggers that would are switched off inside the transaction only).
-- The admin_settings 'leadSources' rows are left in place but nothing reads them any more.

SET LOCAL session_replication_role = replica;

INSERT INTO public.lead_sources (name, is_active)
SELECT btrim(a.name), a.is_active
FROM public.admin_settings a
WHERE a.category = 'leadSources' AND btrim(a.name) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.lead_sources s WHERE lower(btrim(s.name)) = lower(btrim(a.name)));

INSERT INTO public.lead_sources (name, is_active)
SELECT min(btrim(l.source)), false
FROM public.leads l
WHERE btrim(coalesce(l.source, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.lead_sources s WHERE lower(btrim(s.name)) = lower(btrim(l.source)))
GROUP BY lower(btrim(l.source));

UPDATE public.leads l SET lead_source_id = s.id
FROM public.lead_sources s
WHERE l.lead_source_id IS NULL AND l.source IS NOT NULL AND lower(btrim(s.name)) = lower(btrim(l.source));

RESET session_replication_role;

-- No two sources that differ only by case/spacing.
CREATE UNIQUE INDEX IF NOT EXISTS lead_sources_name_ci_uniq ON public.lead_sources (lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.leads_sync_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE s record;
BEGIN
  IF NEW.lead_source_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.lead_source_id IS DISTINCT FROM OLD.lead_source_id) THEN
    SELECT id, name INTO s FROM public.lead_sources WHERE id = NEW.lead_source_id;
    IF FOUND THEN NEW.source := s.name; RETURN NEW; END IF;
  END IF;
  IF btrim(coalesce(NEW.source, '')) <> '' AND (TG_OP = 'INSERT' OR NEW.source IS DISTINCT FROM OLD.source OR NEW.lead_source_id IS NULL) THEN
    SELECT id, name INTO s FROM public.lead_sources WHERE lower(btrim(name)) = lower(btrim(NEW.source)) ORDER BY is_active DESC LIMIT 1;
    IF FOUND THEN NEW.lead_source_id := s.id; NEW.source := s.name; END IF;
  END IF;
  RETURN NEW;
END
$f$;

DROP TRIGGER IF EXISTS trg_aa_leads_sync_source ON public.leads;
CREATE TRIGGER trg_aa_leads_sync_source
  BEFORE INSERT OR UPDATE OF source, lead_source_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_sync_source();

CREATE OR REPLACE FUNCTION public.rename_lead_source(p_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN RAISE EXCEPTION 'not allowed'; END IF;
  p_name := btrim(p_name);
  IF p_name IS NULL OR length(p_name) < 2 THEN RAISE EXCEPTION 'name required'; END IF;
  IF EXISTS (SELECT 1 FROM public.lead_sources WHERE id <> p_id AND lower(btrim(name)) = lower(p_name)) THEN
    RAISE EXCEPTION 'Source name already exists';
  END IF;
  UPDATE public.lead_sources SET name = p_name WHERE id = p_id;
  -- Quiet bulk rename: these two triggers would otherwise log a "Lead Updated" row and move updated_at on every lead
  -- (updated_at feeds the deals count). The change is transactional, so the triggers are back on at commit.
  ALTER TABLE public.leads DISABLE TRIGGER trg_log_lead;
  ALTER TABLE public.leads DISABLE TRIGGER leads_updated_at;
  UPDATE public.leads SET source = p_name WHERE lead_source_id = p_id AND source IS DISTINCT FROM p_name;
  ALTER TABLE public.leads ENABLE TRIGGER trg_log_lead;
  ALTER TABLE public.leads ENABLE TRIGGER leads_updated_at;
END
$f$;
REVOKE ALL ON FUNCTION public.rename_lead_source(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_lead_source(uuid, text) TO authenticated, service_role;

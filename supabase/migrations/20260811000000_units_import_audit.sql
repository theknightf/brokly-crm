-- ============================================================
-- Brokly CRM - Units, Unit Files, Import Columns & Activity Audit
-- Migration: 20260811000000_units_import_audit.sql
--
-- Builds on existing tables (never duplicates them):
--   1. units         -> units belonging to a project (type, area, floor,
--                       price, payment plan ...). RLS mirrors projects
--                       (any authenticated user may CRUD — same as projects).
--   2. leads         -> new "unit" + "interest_level" columns so Excel
--                       imports and the Leads UI can carry this data.
--   3. storage       -> "unit-files" bucket for unit pictures / PDFs +
--                       policies (authenticated upload/read; private unless
--                       signed URL).
--   4. activity_log  -> enhanced log_lead_change trigger: also records
--                       assignment/reassignment + crm_status changes with
--                       prev -> new values in meta.
--   5. admin_settings-> seeded "workLocation" entry (lat/lng/radius) used
--                       by the attendance radius check.
-- ============================================================

-- ─── 1. LEAD EXTRA COLUMNS (import + filters) ──────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS interest_level TEXT DEFAULT '';

-- ─── 2. UNITS TABLE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',            -- unit number / name, e.g. "14B" / "Apartment 12"
  unit_type TEXT DEFAULT '',                -- 1BHK / 2BHK / Villa / Commercial ...
  area SMALLINT DEFAULT 0,                  -- m²
  floor INTEGER DEFAULT 0,
  price NUMERIC(14,2) DEFAULT 0,            -- unit price (EGP)
  payment_plan TEXT DEFAULT '',             -- e.g. "10% down / 6 years / 12 instalments"
  down_payment_pct NUMERIC(5,2) DEFAULT 0,
  installment_years SMALLINT DEFAULT 0,
  installment_frequency SMALLINT DEFAULT 12, -- 12 / 4 / 2 / 1
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_units_project ON public.units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_name ON public.units(name);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Mirrors projects' RLS: any authenticated user may manage units.
DROP POLICY IF EXISTS "authenticated_manage_units" ON public.units;
CREATE POLICY "authenticated_manage_units"
  ON public.units FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 3. UNIT FILES (pictures / PDFs) ────────────────────────────────────────

-- Storage bucket for unit attachments. Idempotent.
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('unit-files', 'unit-files', false,
        ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_upload_unit_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_upload_unit_files" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = ''unit-files'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_read_unit_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_read_unit_files" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = ''unit-files'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_update_unit_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_update_unit_files" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = ''unit-files'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_delete_unit_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_delete_unit_files" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = ''unit-files'')';
  END IF;
END $$;

-- File metadata rows linked to a unit.
CREATE TABLE IF NOT EXISTS public.unit_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT DEFAULT '',
  size_bytes BIGINT DEFAULT 0,
  kind TEXT DEFAULT 'image',               -- 'image' | 'pdf' | 'document'
  uploaded_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unit_files_unit ON public.unit_files(unit_id);

ALTER TABLE public.unit_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_unit_files" ON public.unit_files;
CREATE POLICY "authenticated_manage_unit_files"
  ON public.unit_files FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 4. ENHANCED ACTIVITY LOGGING FOR LEADS ─────────────────────────────────
-- Records: Lead Added / Lead Updated / Lead Status Updated (crm_status) /
-- Lead Assigned / Lead Reassigned, each with prev -> new in meta.

CREATE OR REPLACE FUNCTION public.log_lead_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (v_user, 'Lead Added', 'lead', NEW.id::text, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Assigned', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.assigned_to::text,'') || ' -> ' || COALESCE(NEW.assigned_to::text,''));
    ELSIF OLD.crm_status IS DISTINCT FROM NEW.crm_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.crm_status::text,'') || ' -> ' || COALESCE(NEW.crm_status::text,''));
    ELSIF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (v_user, 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.lead_status::text,'') || ' -> ' || COALESCE(NEW.lead_status::text,''));
    ELSE
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
      VALUES (v_user, 'Lead Updated', 'lead', NEW.id::text, NEW.name);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (v_user, 'Lead Deleted', 'lead', OLD.id::text, OLD.name);
  END IF;
  RETURN NULL;
END;
$$;

-- ─── 5. WORK LOCATION CONFIG (attendance radius) ────────────────────────────
-- Seeded with a sensible default. Admin can edit via the Attendance tab or
-- settings panel; the attendance API reads this to enforce the radius.

INSERT INTO public.admin_settings (category, name, color, sort_order, is_active)
SELECT 'workLocation', 'default',
       '{"lat":30.0444,"lng":31.2357,"radius_m":800,"label":"Company office (default)"}', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_settings WHERE category = 'workLocation' AND name = 'default'
);

GRANT SELECT, INSERT, UPDATE ON public.units, public.unit_files TO authenticated;
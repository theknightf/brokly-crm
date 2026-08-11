-- ============================================================
-- 20260813000000 — Lead Edit, Lead IDs, Units/Projects media,
-- Recommended Units, Bulk messaging, Site visit types,
-- Reservation/Done Deal + call_logs upsert fix.
--
-- Features:
--   1. leads: user-facing LEAD-XXXXXX number (sequence + trigger +
--      backfill), lead rating / priority / team / CS agent,
--      optional unit + payment-plan snapshot, reservation & deal fields.
--   2. units: status (Available / Reserved / Sold) + cover image_path.
--   3. projects: cover image_path, location, full description,
--      developer description, payment plan summary.
--   4. lead_recommended_units (calculator "Add to Lead").
--   5. message_logs (bulk email / SMS receipts).
--   6. site_visits: visit_type (In-person / Online / Phone),
--      meeting_link, platform.
--   7. call_logs: replace the PARTIAL unique index on client_ref with a
--      plain unique index (partial indexes cannot be used as an
--      ON CONFLICT arbiter → 42P10 → 500 on every save) + add the
--      missing UPDATE policy (upsert performs an implicit UPDATE that
--      RLS blocked).
--   8. storage: "project-images" bucket (mirrors unit-files).
-- ============================================================

-- ─── 1. LEADS — LEAD NUMBER + EDIT PROFILE ────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_number TEXT,
  ADD COLUMN IF NOT EXISTS lead_rating TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS team TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cs_agent TEXT DEFAULT '';

-- Optional unit + payment-plan snapshot. The lead keeps its own copy so
-- later edits to the source unit never rewrite historical deal data.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_area NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS down_payment NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS down_payment_pct NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_frequency SMALLINT DEFAULT 12,
  ADD COLUMN IF NOT EXISTS payment_start_date DATE,
  ADD COLUMN IF NOT EXISTS reservation_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_fees NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Not Started';

-- Reservation / Done Deal fields.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS reservation_date DATE,
  ADD COLUMN IF NOT EXISTS closing_date DATE,
  ADD COLUMN IF NOT EXISTS final_price NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission NUMERIC(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_unit_id ON public.leads(unit_id);

-- Lead number: unique (NULLs allowed → partial unique index is fine here,
-- it is never used as an upsert arbiter).
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_lead_number
  ON public.leads (lead_number) WHERE lead_number IS NOT NULL;

-- Sequence + BEFORE INSERT trigger so new leads (incl. imports) always get
-- a sequential LEAD-XXXXXX number.
CREATE SEQUENCE IF NOT EXISTS public.leads_lead_number_seq START 1;

CREATE OR REPLACE FUNCTION public.assign_lead_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lead_number IS NULL OR NEW.lead_number = '' THEN
    NEW.lead_number := 'LEAD-' || lpad(
      nextval('public.leads_lead_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_assign_lead_number ON public.leads;
CREATE TRIGGER trg_leads_assign_lead_number
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assign_lead_number();

-- Backfill existing rows in creation order and fast-forward the sequence.
UPDATE public.leads SET lead_number = 'LEAD-' || lpad(s.seq::text, 6, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS seq
  FROM public.leads
  WHERE lead_number IS NULL
) s
WHERE public.leads.id = s.id;

SELECT setval(
  'public.leads_lead_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(lead_number, '[^0-9]', '', 'g'), '')::bigint), 0)
       FROM public.leads),
    0
  ) + 1,
  false
);

-- ─── 2. UNITS — STATUS + COVER IMAGE ──────────────────────────────────────

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available', -- Available | Reserved | Sold
  ADD COLUMN IF NOT EXISTS image_path TEXT DEFAULT '';

-- ─── 3. PROJECTS — MEDIA + LOCATION + LONG DESCRIPTIONS ───────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS image_path TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS developer_description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_plan_summary TEXT DEFAULT '';

-- ─── 4. LEAD RECOMMENDED UNITS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_recommended_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lead_recommended_units_lead_unit_key UNIQUE (lead_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_recommended_units_lead
  ON public.lead_recommended_units(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_recommended_units_unit
  ON public.lead_recommended_units(unit_id);

ALTER TABLE public.lead_recommended_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_lead_recommended_units"
  ON public.lead_recommended_units;
CREATE POLICY "authenticated_manage_lead_recommended_units"
  ON public.lead_recommended_units FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.lead_recommended_units TO authenticated;

-- ─── 5. MESSAGE LOGS (BULK EMAIL / SMS) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'email',        -- 'email' | 'sms'
  entity_type TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  recipient_name TEXT DEFAULT '',
  recipient_phone TEXT DEFAULT '',
  recipient_email TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'queued',                 -- 'queued' | 'sent' | 'failed'
  error TEXT DEFAULT '',
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_logs_entity
  ON public.message_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_created
  ON public.message_logs(created_at);

ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_logs_select" ON public.message_logs;
CREATE POLICY "message_logs_select"
  ON public.message_logs FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2() OR created_by = auth.uid());

DROP POLICY IF EXISTS "message_logs_insert" ON public.message_logs;
CREATE POLICY "message_logs_insert"
  ON public.message_logs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

GRANT SELECT, INSERT ON public.message_logs TO authenticated;

-- ─── 6. SITE VISITS — VISIT TYPE ──────────────────────────────────────────

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS visit_type TEXT DEFAULT 'In-person', -- In-person | Online | Phone
  ADD COLUMN IF NOT EXISTS meeting_link TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT '';

-- ─── 7. CALL LOGS — UPSERT FIX ────────────────────────────────────────────

-- The old partial index cannot be used as an ON CONFLICT arbiter
-- (42P10 → route fell back through its error checks → 500 on every save).
DROP INDEX IF EXISTS public.idx_call_logs_client_ref;

-- Plain unique index: Postgres treats NULLs as distinct so rows without a
-- client_ref are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_client_ref_unique
  ON public.call_logs (client_ref);

-- Upsert-on-conflict performs an implicit UPDATE; without an UPDATE policy
-- RLS silently blocked it even after the index fix.
DROP POLICY IF EXISTS "users_update_call_logs" ON public.call_logs;
CREATE POLICY "users_update_call_logs"
  ON public.call_logs FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner_v2() OR user_id = auth.uid())
  WITH CHECK (public.is_admin_or_owner_v2() OR user_id = auth.uid());

-- ─── 8. STORAGE — PROJECT IMAGES BUCKET ───────────────────────────────────

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('project-images', 'project-images', false,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_upload_project_images'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_upload_project_images" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = ''project-images'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_read_project_images'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_read_project_images" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = ''project-images'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_update_project_images'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_update_project_images" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = ''project-images'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_delete_project_images'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_delete_project_images" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = ''project-images'')';
  END IF;
END $$;

-- Allow duplicate leads ingestion without hard uniqueness blockers and route duplicates to Duplicate Center
DROP INDEX IF EXISTS public.idx_leads_phone_normalized_unique;
DROP INDEX IF EXISTS public.idx_leads_email_normalized_unique;

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized_lookup ON public.leads (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_email_normalized_lookup ON public.leads (email_normalized);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_to_duplicate_center_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_is_duplicate ON public.leads (is_duplicate) WHERE is_duplicate = true;
CREATE INDEX IF NOT EXISTS idx_leads_duplicate_of_lead_id ON public.leads (duplicate_of_lead_id) WHERE duplicate_of_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.detect_duplicate_lead_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_digits text;
  v_phone_tail text;
  v_email text;
  v_match_id uuid;
  v_match_name text;
BEGIN
  v_phone_digits := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
  v_phone_tail := CASE WHEN length(v_phone_digits) >= 8 THEN right(v_phone_digits, 10) ELSE '' END;
  v_email := lower(trim(COALESCE(NEW.email, '')));

  IF v_phone_tail <> '' THEN
    SELECT id, name INTO v_match_id, v_match_name
    FROM public.leads
    WHERE length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) >= 8
      AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = v_phone_tail
      AND COALESCE(notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_match_id IS NULL AND v_email <> '' AND position('@' in v_email) > 1 THEN
    SELECT id, name INTO v_match_id, v_match_name
    FROM public.leads
    WHERE lower(trim(COALESCE(email, ''))) = v_email
      AND COALESCE(notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_match_id IS NOT NULL THEN
    NEW.is_duplicate := true;
    NEW.duplicate_of_lead_id := v_match_id;
    NEW.routed_to_duplicate_center_at := COALESCE(NEW.routed_to_duplicate_center_at, now());
    NEW.crm_status := 'Duplicate Leads';
    NEW.lead_status := 'Lost';
    IF COALESCE(NEW.notes, '') NOT LIKE '%[Pending Review / Duplicate%' THEN
      NEW.notes := trim(both E'\n ' FROM COALESCE(NEW.notes, '') || E'\n[Pending Review / Duplicate of #' || left(v_match_id::text, 8) || ' (' || COALESCE(v_match_name, 'Existing Lead') || ')]');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.route_duplicate_lead_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NEW.is_duplicate IS TRUE AND NEW.duplicate_of_lead_id IS NOT NULL THEN
    v_actor := COALESCE(NEW.created_by, NEW.assigned_to, auth.uid());

    IF NOT EXISTS (
      SELECT 1 FROM public.duplicate_lead_attempts
      WHERE attempted_lead_id = NEW.id
    ) THEN
      INSERT INTO public.duplicate_lead_attempts (
        matched_lead_id,
        attempted_lead_id,
        attempted_phone,
        attempted_by,
        status,
        note
      ) VALUES (
        NEW.duplicate_of_lead_id,
        NEW.id,
        COALESCE(NEW.phone, NEW.email, ''),
        v_actor,
        'flagged',
        'Auto-routed to Duplicate Center on ingestion'
      );
    END IF;

    INSERT INTO public.activity_log (
      user_id,
      action_type,
      entity_type,
      entity_id,
      detail
    ) VALUES (
      v_actor,
      'Duplicate Routed to Center',
      'lead',
      NEW.id::text,
      'Duplicate lead "' || COALESCE(NEW.name, 'Unnamed') || '" (' || COALESCE(NEW.phone, NEW.email, '—') || ') matched original lead #' || left(NEW.duplicate_of_lead_id::text, 8) || ' and was routed to Duplicate Center.'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_duplicate_lead_before_insert ON public.leads;
CREATE TRIGGER trg_detect_duplicate_lead_before_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_duplicate_lead_before_insert();

DROP TRIGGER IF EXISTS trg_route_duplicate_lead_after_insert ON public.leads;
CREATE TRIGGER trg_route_duplicate_lead_after_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.route_duplicate_lead_after_insert();

-- High-speed composite indexes for zero-lag dashboard and leads queries
CREATE INDEX IF NOT EXISTS idx_leads_crm_status_created_at
  ON public.leads (crm_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_status_created
  ON public.leads (assigned_to, crm_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_created_by_created_at
  ON public.leads (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_last_action_at
  ON public.leads (last_action_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_call_logs_entity_created
  ON public.call_logs (entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_user_created
  ON public.call_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_action_type_created
  ON public.activity_log (action_type, created_at DESC);

-- Two-way Realtime publication for Web <-> Mobile stage synchronization
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.call_logs REPLICA IDENTITY FULL;
ALTER TABLE public.follow_ups REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'follow_ups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
  END IF;
END $$;

INSERT INTO public.admin_settings (category, name, is_active, color, sort_order)
SELECT 'statuses', 'Follow Up After Meeting', true, '#F59E0B', 75
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_settings WHERE category = 'statuses' AND lower(name) = 'follow up after meeting'
);

INSERT INTO public.admin_settings (category, name, is_active, color, sort_order)
SELECT 'statuses', 'Meeting', true, '#8B5CF6', 70
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_settings WHERE category = 'statuses' AND lower(name) = 'meeting'
);

INSERT INTO public.admin_settings (category, name, is_active, color, sort_order)
SELECT 'statuses', 'No Answer At All', true, '#EF4444', 55
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_settings WHERE category = 'statuses' AND lower(name) = 'no answer at all'
);


-- ============================================================
-- Brokly CRM - Duplicate leads: BLOCK + owner review (web / PWA)
-- Migration: 20261028000000_duplicate_leads_review.sql
-- ============================================================
-- * New table public.duplicate_leads: one row per (original lead, attempting
--   user) while status = 'pending'. Re-adding the same duplicate updates that
--   row (attempt_count++) instead of creating another one.
-- * check_and_record_duplicates(rows jsonb): SECURITY DEFINER, so it sees ALL
--   leads whatever the caller's RLS says. Matches on normalize_phone() and,
--   when present, e-mail. Records the attempt, notifies the original owner and
--   returns ONLY {idx, duplicate} per row (never who owns the original).
-- * merge_duplicate_lead() / dismiss_duplicate_lead(): resolve a pending row.
--   Merge never changes assigned_to / created_by of the original lead.
-- * RLS: the current owner of the original lead and owner/admin/manager can
--   read + update. The attempting user can insert but has no SELECT access.
-- The legacy "mark, never block" trigger on public.leads and the admin
-- Duplicate Center (duplicate_lead_attempts) are left untouched: they remain
-- a backstop for inserts that do not go through the web/PWA check (e.g. the
-- Flutter app) and keep serving historical rows.
-- ─────────────────────────────────────────────────────────────

-- 1. Table ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.duplicate_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  original_lead_id  uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  original_owner_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  original_added_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  attempted_by      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  attempted_data    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'merged', 'dismissed')),
  resolved_by       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  match_type        text NOT NULL DEFAULT 'phone' CHECK (match_type IN ('phone', 'email')),
  attempt_count     integer NOT NULL DEFAULT 1,
  last_attempt_at   timestamptz NOT NULL DEFAULT now(),
  resolution        jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duplicate_leads_pending_per_user
  ON public.duplicate_leads (original_lead_id, attempted_by)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_duplicate_leads_owner_status
  ON public.duplicate_leads (original_owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_leads_original
  ON public.duplicate_leads (original_lead_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_leads_status_created
  ON public.duplicate_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email_lower
  ON public.leads (lower(trim(COALESCE(email, ''))));

-- 2. Helpers (SECURITY DEFINER so policies never recurse into leads RLS) ------
CREATE OR REPLACE FUNCTION public.is_duplicate_reviewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND lower(regexp_replace(COALESCE(role::text, ''), '[\s-]+', '_', 'g'))
          IN ('owner', 'admin', 'manager', 'owner_admin', 'owneradmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_lead_owner(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = p_lead_id
      AND COALESCE(l.assigned_to, l.created_by) = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_duplicate_reviewer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lead_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_duplicate_reviewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lead_owner(uuid) TO authenticated;

-- 3. Triggers: never trust client-supplied owner / status ---------------------
CREATE OR REPLACE FUNCTION public.duplicate_leads_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l record;
  v_phone text;
  v_email text;
BEGIN
  SELECT id, created_by, COALESCE(assigned_to, created_by) AS owner_id,
         phone_normalized, lower(trim(COALESCE(email, ''))) AS email_l
    INTO l
  FROM public.leads WHERE id = NEW.original_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'original lead not found' USING ERRCODE = '23503';
  END IF;

  v_phone := public.normalize_phone(NEW.attempted_data->>'phone');
  v_email := lower(trim(COALESCE(NEW.attempted_data->>'email', '')));
  IF NOT (
    (char_length(v_phone) >= 8 AND v_phone = l.phone_normalized)
    OR (v_email <> '' AND v_email = l.email_l)
  ) THEN
    RAISE EXCEPTION 'attempted data does not match the original lead' USING ERRCODE = '23514';
  END IF;

  NEW.original_owner_id := l.owner_id;
  NEW.original_added_by := l.created_by;
  NEW.status := 'pending';
  NEW.resolved_by := NULL;
  NEW.resolved_at := NULL;
  NEW.resolution := NULL;
  IF auth.uid() IS NOT NULL THEN NEW.attempted_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_duplicate_leads_before_insert ON public.duplicate_leads;
CREATE TRIGGER trg_duplicate_leads_before_insert
  BEFORE INSERT ON public.duplicate_leads
  FOR EACH ROW EXECUTE FUNCTION public.duplicate_leads_before_insert();

-- Direct table updates may only dismiss a pending row. Everything else
-- (attempted_data, owners, 'merged') goes through the RPCs below.
CREATE OR REPLACE FUNCTION public.duplicate_leads_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR COALESCE(current_setting('brokly.dup_rpc', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.original_lead_id := OLD.original_lead_id;
  NEW.original_owner_id := OLD.original_owner_id;
  NEW.original_added_by := OLD.original_added_by;
  NEW.attempted_by := OLD.attempted_by;
  NEW.attempted_data := OLD.attempted_data;
  NEW.match_type := OLD.match_type;
  NEW.attempt_count := OLD.attempt_count;
  NEW.last_attempt_at := OLD.last_attempt_at;
  NEW.resolution := OLD.resolution;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' OR NEW.status <> 'dismissed' THEN
      RAISE EXCEPTION 'use merge_duplicate_lead() / dismiss_duplicate_lead()' USING ERRCODE = '42501';
    END IF;
    NEW.resolved_by := auth.uid();
    NEW.resolved_at := now();
  ELSE
    NEW.resolved_by := OLD.resolved_by;
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_duplicate_leads_guard_update ON public.duplicate_leads;
CREATE TRIGGER trg_duplicate_leads_guard_update
  BEFORE UPDATE ON public.duplicate_leads
  FOR EACH ROW EXECUTE FUNCTION public.duplicate_leads_guard_update();

-- 4. RLS ---------------------------------------------------------------------
ALTER TABLE public.duplicate_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duplicate_leads_select ON public.duplicate_leads;
CREATE POLICY duplicate_leads_select ON public.duplicate_leads
  FOR SELECT TO authenticated
  USING (public.is_duplicate_reviewer() OR public.is_lead_owner(original_lead_id));

DROP POLICY IF EXISTS duplicate_leads_update ON public.duplicate_leads;
CREATE POLICY duplicate_leads_update ON public.duplicate_leads
  FOR UPDATE TO authenticated
  USING (public.is_duplicate_reviewer() OR public.is_lead_owner(original_lead_id))
  WITH CHECK (public.is_duplicate_reviewer() OR public.is_lead_owner(original_lead_id));

-- The attempting user may insert (as themselves) but gets no SELECT unless
-- they also own the original / are a reviewer.
DROP POLICY IF EXISTS duplicate_leads_insert ON public.duplicate_leads;
CREATE POLICY duplicate_leads_insert ON public.duplicate_leads
  FOR INSERT TO authenticated
  WITH CHECK (attempted_by = auth.uid() AND status = 'pending');

REVOKE ALL ON public.duplicate_leads FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.duplicate_leads TO authenticated;

-- 5. Check + record (server-side only; called from the Next.js API) ----------
-- p_rows: [{name, phone, email, source, notes, project, ...}, ...]
-- Returns {
--   results: [{idx, duplicate}],            -- safe to show to the adder
--   owners:  [{owner_id, adder_name, count, sample}]  -- server-only, for push
-- }
CREATE OR REPLACE FUNCTION public.check_and_record_duplicates(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_item jsonb;
  v_idx int;
  v_phone text;
  v_email text;
  v_clean jsonb;
  v_orig record;
  v_results jsonb := '[]'::jsonb;
  v_owners jsonb := '{}'::jsonb;
  v_notify jsonb := '[]'::jsonb;
  v_inserted boolean;
  v_label text;
  v_key text;
  v_cur jsonb;
  o record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'too many rows (max 5000)' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), email, 'A user') INTO v_actor_name
  FROM public.user_profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'A user');

  PERFORM set_config('brokly.dup_rpc', '1', true);

  FOR v_item, v_idx IN
    SELECT e.value, (e.ordinality - 1)::int
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(value, ordinality)
  LOOP
    v_phone := public.normalize_phone(v_item->>'phone');
    IF char_length(v_phone) < 8 THEN v_phone := ''; END IF;
    v_email := lower(trim(COALESCE(v_item->>'email', '')));
    IF position('@' in v_email) <= 1 THEN v_email := ''; END IF;

    IF v_phone = '' AND v_email = '' THEN
      v_results := v_results || jsonb_build_object('idx', v_idx, 'duplicate', false);
      CONTINUE;
    END IF;

    SELECT l.id,
           COALESCE(l.assigned_to, l.created_by) AS owner_id,
           CASE WHEN v_phone <> '' AND l.phone_normalized = v_phone THEN 'phone' ELSE 'email' END AS match_type
      INTO v_orig
    FROM public.leads l
    WHERE ((v_phone <> '' AND l.phone_normalized = v_phone)
        OR (v_email <> '' AND lower(trim(COALESCE(l.email, ''))) = v_email))
      AND l.is_duplicate IS NOT TRUE
      AND COALESCE(l.notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
    ORDER BY (CASE WHEN v_phone <> '' AND l.phone_normalized = v_phone THEN 0 ELSE 1 END),
             l.created_at ASC, l.id ASC
    LIMIT 1;

    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_object('idx', v_idx, 'duplicate', false);
      CONTINUE;
    END IF;

    v_results := v_results || jsonb_build_object('idx', v_idx, 'duplicate', true);

    -- Re-adding your own lead is blocked, but there is nobody to review it.
    IF v_orig.owner_id IS NOT DISTINCT FROM v_actor THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(jsonb_object_agg(k.key, k.value), '{}'::jsonb) INTO v_clean
    FROM jsonb_each(v_item) AS k(key, value)
    WHERE left(k.key, 1) <> '_' AND k.value <> 'null'::jsonb;

    INSERT INTO public.duplicate_leads
      (original_lead_id, original_owner_id, attempted_by, attempted_data, match_type)
    VALUES
      (v_orig.id, v_orig.owner_id, v_actor, v_clean, v_orig.match_type)
    ON CONFLICT (original_lead_id, attempted_by) WHERE status = 'pending'
    DO UPDATE SET attempted_data  = EXCLUDED.attempted_data,
                  match_type      = EXCLUDED.match_type,
                  attempt_count   = public.duplicate_leads.attempt_count + 1,
                  last_attempt_at = now()
    RETURNING (xmax = 0) INTO v_inserted;

    -- Only a brand-new pending row notifies; repeats just bump the counter.
    IF v_inserted AND v_orig.owner_id IS NOT NULL THEN
      v_label := COALESCE(NULLIF(v_item->>'name', ''), NULLIF(v_item->>'phone', ''), v_item->>'email', '');
      v_key := v_orig.owner_id::text;
      v_cur := COALESCE(v_owners -> v_key, jsonb_build_object('count', 0, 'sample', v_label));
      v_owners := jsonb_set(
        v_owners, ARRAY[v_key],
        jsonb_build_object('count', (v_cur->>'count')::int + 1, 'sample', v_cur->>'sample')
      );
    END IF;
  END LOOP;

  FOR o IN SELECT key AS owner_id, value AS info FROM jsonb_each(v_owners) LOOP
    INSERT INTO public.notifications (user_id, title, message, reference_link, channel)
    VALUES (
      o.owner_id::uuid,
      'Duplicate lead needs review',
      CASE WHEN (o.info->>'count')::int = 1
           THEN v_actor_name || ' tried to add a lead that already exists: ' || (o.info->>'sample')
           ELSE (o.info->>'count') || ' duplicate attempts on your leads from ' || v_actor_name
      END,
      '/duplicates',
      'in_app'
    );
    v_notify := v_notify || jsonb_build_object(
      'owner_id', o.owner_id,
      'adder_name', v_actor_name,
      'count', (o.info->>'count')::int,
      'sample', o.info->>'sample'
    );
  END LOOP;

  RETURN jsonb_build_object('results', v_results, 'owners', v_notify);
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_duplicates(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_record_duplicates(jsonb) TO authenticated;

-- 6. Merge ---------------------------------------------------------------------
-- p_choices: {"name":"new","email":"existing",...}; anything not "new" keeps the
-- existing value. Fields that are empty in the submission are never applied.
-- Ownership (assigned_to / created_by) is never touched.
CREATE OR REPLACE FUNCTION public.merge_duplicate_lead(
  p_id uuid,
  p_choices jsonb DEFAULT '{}'::jsonb,
  p_append_notes boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  d public.duplicate_leads%ROWTYPE;
  a jsonb;
  f text;
  v_upd jsonb := '{}'::jsonb;
  v_new_notes text;
  v_notes_added boolean := false;
  v_src_id uuid;
  v_keys text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  p_choices := COALESCE(p_choices, '{}'::jsonb);

  SELECT * INTO d FROM public.duplicate_leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duplicate record not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_duplicate_reviewer() OR public.is_lead_owner(d.original_lead_id)) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF d.status <> 'pending' THEN
    RAISE EXCEPTION 'duplicate already resolved' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.leads WHERE id = d.original_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'original lead no longer exists' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), email, 'A user') INTO v_actor_name
  FROM public.user_profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'A user');

  a := d.attempted_data;

  FOREACH f IN ARRAY ARRAY['name', 'phone', 'email', 'source', 'location', 'project',
                           'developer', 'property_type', 'unit'] LOOP
    IF p_choices->>f = 'new' AND NULLIF(trim(COALESCE(a->>f, '')), '') IS NOT NULL THEN
      v_upd := v_upd || jsonb_build_object(f, trim(a->>f));
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['budget_min', 'budget_max'] LOOP
    IF p_choices->>f = 'new'
       AND COALESCE(a->>f, '') ~ '^[0-9]+(\.[0-9]+)?$'
       AND (a->>f)::numeric > 0 THEN
      v_upd := v_upd || jsonb_build_object(f, (a->>f)::numeric);
    END IF;
  END LOOP;

  IF v_upd ? 'source' THEN
    SELECT id INTO v_src_id FROM public.lead_sources
    WHERE lower(name) = lower(v_upd->>'source') LIMIT 1;
  END IF;

  v_new_notes := NULLIF(trim(COALESCE(a->>'notes', '')), '');
  v_notes_added := p_append_notes AND v_new_notes IS NOT NULL;

  UPDATE public.leads l SET
    name           = COALESCE(v_upd->>'name', l.name),
    phone          = COALESCE(v_upd->>'phone', l.phone),
    email          = COALESCE(v_upd->>'email', l.email),
    source         = COALESCE(v_upd->>'source', l.source),
    lead_source_id = COALESCE(v_src_id, l.lead_source_id),
    location       = COALESCE(v_upd->>'location', l.location),
    project        = COALESCE(v_upd->>'project', l.project),
    developer      = COALESCE(v_upd->>'developer', l.developer),
    property_type  = COALESCE(v_upd->>'property_type', l.property_type),
    unit           = COALESCE(v_upd->>'unit', l.unit),
    budget_min     = COALESCE((v_upd->>'budget_min')::numeric, l.budget_min),
    budget_max     = COALESCE((v_upd->>'budget_max')::numeric, l.budget_max),
    notes          = CASE WHEN v_notes_added THEN
                       trim(both E'\n' FROM COALESCE(l.notes, '')
                         || E'\n\n[Merged from duplicate · ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
                         || ' · ' || v_actor_name || ']: ' || v_new_notes)
                     ELSE l.notes END,
    last_action_at = now(),
    last_action_by = v_actor
  WHERE l.id = d.original_lead_id;
  -- assigned_to / created_by are deliberately absent: ownership never changes.

  SELECT string_agg(k, ', ' ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_upd) AS k;

  PERFORM set_config('brokly.dup_rpc', '1', true);
  UPDATE public.duplicate_leads SET
    status = 'merged',
    resolved_by = v_actor,
    resolved_at = now(),
    resolution = jsonb_build_object(
      'fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(v_upd) AS k),
      'notes_appended', v_notes_added
    )
  WHERE id = d.id;

  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
  VALUES (
    v_actor,
    'Duplicate Merged',
    'lead',
    d.original_lead_id::text,
    'Duplicate attempt merged by ' || v_actor_name
      || CASE WHEN v_keys IS NULL THEN ' (kept existing values' ELSE ' (updated: ' || v_keys END
      || CASE WHEN v_notes_added THEN '; notes appended)' ELSE ')' END,
    jsonb_build_object('duplicate_id', d.id, 'fields', v_upd, 'notes_appended', v_notes_added)::text
  );

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', d.original_lead_id,
    'updated_fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(v_upd) AS k),
    'notes_appended', v_notes_added
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_lead(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_lead(uuid, jsonb, boolean) TO authenticated;

-- 7. Dismiss -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_duplicate_lead(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  d public.duplicate_leads%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO d FROM public.duplicate_leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duplicate record not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_duplicate_reviewer() OR public.is_lead_owner(d.original_lead_id)) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF d.status <> 'pending' THEN
    RAISE EXCEPTION 'duplicate already resolved' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), email, 'A user') INTO v_actor_name
  FROM public.user_profiles WHERE id = v_actor;

  PERFORM set_config('brokly.dup_rpc', '1', true);
  UPDATE public.duplicate_leads
     SET status = 'dismissed', resolved_by = v_actor, resolved_at = now()
   WHERE id = d.id;

  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
  VALUES (
    v_actor, 'Duplicate Dismissed', 'lead', d.original_lead_id::text,
    'Duplicate attempt dismissed by ' || COALESCE(v_actor_name, 'a user'),
    jsonb_build_object('duplicate_id', d.id)::text
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_duplicate_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_duplicate_lead(uuid) TO authenticated;

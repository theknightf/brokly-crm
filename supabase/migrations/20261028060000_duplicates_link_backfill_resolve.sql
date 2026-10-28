-- ============================================================
-- Duplicates: link to the real duplicate lead, route every flagged insert, scan
-- history, and add Merge / Separate / Dismiss for both kinds of entry.
-- ============================================================
-- A duplicate_leads row is either
--   source = 'attempt'  : someone tried to add it and it was blocked (no lead row), or
--   source = 'existing' : a lead row that already exists and matches an older lead
--                         (historical scan, or inserted by a path that bypasses the
--                         web check, e.g. the mobile app). duplicate_lead_id points at it.
-- Nothing is deleted or rewritten by the scan: the duplicate leads keep their notes,
-- source, assignee and history until an owner/admin resolves the entry.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.duplicate_leads
  ADD COLUMN IF NOT EXISTS duplicate_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.duplicate_leads
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'attempt';
ALTER TABLE public.duplicate_leads DROP CONSTRAINT IF EXISTS duplicate_leads_source_check;
ALTER TABLE public.duplicate_leads
  ADD CONSTRAINT duplicate_leads_source_check CHECK (source IN ('attempt', 'existing'));

ALTER TABLE public.duplicate_leads DROP CONSTRAINT IF EXISTS duplicate_leads_status_check;
ALTER TABLE public.duplicate_leads
  ADD CONSTRAINT duplicate_leads_status_check
  CHECK (status IN ('pending', 'merged', 'dismissed', 'separated'));

-- One pending ATTEMPT per (original lead, user); several existing duplicates may
-- share an original, but each existing lead is listed once.
DROP INDEX IF EXISTS public.uq_duplicate_leads_pending_per_user;
CREATE UNIQUE INDEX uq_duplicate_leads_pending_per_user
  ON public.duplicate_leads (original_lead_id, attempted_by)
  WHERE status = 'pending' AND duplicate_lead_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_duplicate_leads_existing_lead
  ON public.duplicate_leads (duplicate_lead_id)
  WHERE duplicate_lead_id IS NOT NULL;

-- Lead row -> the same attempted_data shape the web check stores.
CREATE OR REPLACE FUNCTION public.lead_to_attempt_json(l public.leads)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', l.name::text,
    'phone', NULLIF(l.phone::text, ''),
    'email', NULLIF(l.email::text, ''),
    'source', NULLIF(l.source::text, ''),
    'notes', NULLIF(l.notes::text, ''),
    'project', NULLIF(l.project::text, ''),
    'developer', NULLIF(l.developer::text, ''),
    'location', NULLIF(l.location::text, ''),
    'property_type', NULLIF(l.property_type::text, ''),
    'unit', NULLIF(l.unit::text, ''),
    'budget_min', NULLIF(l.budget_min, 0),
    'budget_max', NULLIF(l.budget_max, 0),
    'stage', NULLIF(l.crm_status::text, '')
  ));
$$;

-- ── Real-time routing for inserts that were flagged by trg_leads_flag_duplicate ──
CREATE OR REPLACE FUNCTION public.duplicate_leads_route_flagged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF COALESCE(current_setting('brokly.dup_separate', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_duplicate IS TRUE AND NEW.duplicate_of_lead_id IS NOT NULL THEN
    PERFORM set_config('brokly.dup_rpc', '1', true);
    INSERT INTO public.duplicate_leads
      (original_lead_id, attempted_by, attempted_data, match_type, source, duplicate_lead_id)
    VALUES
      (NEW.duplicate_of_lead_id, NEW.created_by, public.lead_to_attempt_json(NEW), 'phone', 'existing', NEW.id)
    ON CONFLICT DO NOTHING;

    SELECT COALESCE(assigned_to, created_by) INTO v_owner
    FROM public.leads WHERE id = NEW.duplicate_of_lead_id;
    IF v_owner IS NOT NULL AND v_owner IS DISTINCT FROM NEW.created_by THEN
      INSERT INTO public.notifications (user_id, title, message, reference_link, channel)
      VALUES (v_owner, 'Duplicate lead needs review',
              'A lead that already exists was added again: ' || COALESCE(NULLIF(NEW.name, ''), NEW.phone),
              '/duplicates', 'in_app');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_duplicate_leads_route_flagged ON public.leads;
CREATE TRIGGER trg_duplicate_leads_route_flagged
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.duplicate_leads_route_flagged();

-- ── Historical scan ─────────────────────────────────────────────────────────
-- 1) Leads already flagged by phone.
INSERT INTO public.duplicate_leads
  (created_at, original_lead_id, attempted_by, attempted_data, match_type, source, duplicate_lead_id, last_attempt_at)
SELECT d.created_at, d.duplicate_of_lead_id, d.created_by, public.lead_to_attempt_json(d),
       'phone', 'existing', d.id, d.created_at
FROM public.leads d
JOIN public.leads o ON o.id = d.duplicate_of_lead_id
WHERE d.is_duplicate IS TRUE
  AND NOT EXISTS (SELECT 1 FROM public.duplicate_leads x WHERE x.duplicate_lead_id = d.id)
ON CONFLICT DO NOTHING;

-- 2) Leads that share an e-mail with an older lead but were never flagged.
INSERT INTO public.duplicate_leads
  (created_at, original_lead_id, attempted_by, attempted_data, match_type, source, duplicate_lead_id, last_attempt_at)
SELECT d.created_at, o.id, d.created_by, public.lead_to_attempt_json(d),
       'email', 'existing', d.id, d.created_at
FROM public.leads d
JOIN LATERAL (
  SELECT x.id FROM public.leads x
  WHERE x.id <> d.id
    AND lower(trim(COALESCE(x.email, ''))) = lower(trim(d.email))
    AND (x.created_at < d.created_at OR (x.created_at = d.created_at AND x.id < d.id))
  ORDER BY x.created_at, x.id
  LIMIT 1
) o ON true
WHERE position('@' in COALESCE(d.email, '')) > 1
  AND d.is_duplicate IS NOT TRUE
  AND NOT EXISTS (SELECT 1 FROM public.duplicate_leads x WHERE x.duplicate_lead_id = d.id)
ON CONFLICT DO NOTHING;

-- ── Resolve: merge / separate / dismiss, for both kinds of entry ─────────────
CREATE OR REPLACE FUNCTION public.resolve_duplicate_lead(
  p_id uuid,
  p_action text,
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
  d public.duplicate_leads%ROWTYPE;
  a jsonb;
  v_res jsonb;
  v_lead uuid;
  v_agent text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_action NOT IN ('merge', 'separate', 'dismiss') THEN
    RAISE EXCEPTION 'unknown action' USING ERRCODE = '22023';
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

  IF p_action = 'dismiss' THEN
    RETURN public.dismiss_duplicate_lead(p_id);
  END IF;

  IF p_action = 'merge' THEN
    v_res := public.merge_duplicate_lead(p_id, p_choices, p_append_notes);
    IF d.duplicate_lead_id IS NOT NULL THEN
      -- Carry everything that belongs to the duplicate over to the original, then retire it.
      UPDATE public.call_logs SET entity_id = d.original_lead_id::text, lead_id = d.original_lead_id
        WHERE entity_id = d.duplicate_lead_id::text OR lead_id = d.duplicate_lead_id;
      UPDATE public.follow_ups SET lead_id = d.original_lead_id WHERE lead_id = d.duplicate_lead_id;
      UPDATE public.lead_comments SET lead_id = d.original_lead_id WHERE lead_id = d.duplicate_lead_id;
      UPDATE public.user_actions SET lead_id = d.original_lead_id WHERE lead_id = d.duplicate_lead_id;
      BEGIN
        DELETE FROM public.leads WHERE id = d.duplicate_lead_id;
      EXCEPTION WHEN foreign_key_violation THEN
        PERFORM set_config('brokly.dup_notify', '1', true);
        UPDATE public.leads
           SET crm_status = 'Duplicate Leads', is_duplicate = false, duplicate_of_lead_id = NULL,
               notes = '[ARCHIVED DUPLICATE] Merged into #' || left(d.original_lead_id::text, 8)
                       || E'\n' || COALESCE(notes, '')
         WHERE id = d.duplicate_lead_id;
      END;
    END IF;
    RETURN v_res;
  END IF;

  -- separate: keep both as independent leads.
  PERFORM set_config('brokly.dup_rpc', '1', true);
  PERFORM set_config('brokly.dup_notify', '1', true);
  IF d.duplicate_lead_id IS NOT NULL THEN
    UPDATE public.leads SET is_duplicate = false, duplicate_of_lead_id = NULL WHERE id = d.duplicate_lead_id;
    v_lead := d.duplicate_lead_id;
  ELSE
    a := d.attempted_data;
    SELECT COALESCE(NULLIF(full_name, ''), email) INTO v_agent FROM public.user_profiles WHERE id = d.attempted_by;
    PERFORM set_config('brokly.dup_separate', '1', true);
    INSERT INTO public.leads
      (name, phone, email, source, notes, project, developer, location, property_type, unit,
       budget_min, budget_max, crm_status, created_by, assigned_to, agent)
    VALUES
      (COALESCE(NULLIF(a->>'name', ''), a->>'phone', 'Lead'),
       COALESCE(a->>'phone', ''), COALESCE(a->>'email', ''), COALESCE(a->>'source', ''),
       COALESCE(a->>'notes', ''), COALESCE(a->>'project', ''), COALESCE(a->>'developer', ''),
       COALESCE(a->>'location', ''), COALESCE(a->>'property_type', ''), COALESCE(a->>'unit', ''),
       COALESCE((a->>'budget_min')::numeric, 0), COALESCE((a->>'budget_max')::numeric, 0),
       COALESCE(NULLIF(a->>'stage', ''), 'Fresh Leads'), d.attempted_by, d.attempted_by, COALESCE(v_agent, ''))
    RETURNING id INTO v_lead;
    UPDATE public.leads SET is_duplicate = false, duplicate_of_lead_id = NULL WHERE id = v_lead;
    PERFORM set_config('brokly.dup_separate', '0', true);
  END IF;

  UPDATE public.duplicate_leads
     SET status = 'separated', resolved_by = v_actor, resolved_at = now(),
         resolution = jsonb_build_object('lead_id', v_lead)
   WHERE id = d.id;

  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
  VALUES (v_actor, 'Duplicate Separated', 'lead', v_lead::text,
          'Duplicate kept as a separate lead', jsonb_build_object('duplicate_id', d.id)::text);

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_duplicate_lead(uuid, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_duplicate_lead(uuid, text, jsonb, boolean) TO authenticated;

-- ── check_and_record_duplicates(): same logic, ON CONFLICT now targets the new index ──
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
      AND COALESCE(l.notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
    ORDER BY l.is_duplicate ASC,
             (CASE WHEN v_phone <> '' AND l.phone_normalized = v_phone THEN 0 ELSE 1 END),
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
    ON CONFLICT (original_lead_id, attempted_by) WHERE status = 'pending' AND duplicate_lead_id IS NULL
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

NOTIFY pgrst, 'reload schema';

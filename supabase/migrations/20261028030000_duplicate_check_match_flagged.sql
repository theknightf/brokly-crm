-- Fix: a lead whose every copy is flagged is_duplicate (its original was deleted or
-- merged away) was invisible to the duplicate check, so a new copy was created.
-- Match any lead; prefer the un-flagged original, else the oldest copy.

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

CREATE OR REPLACE FUNCTION public.lead_exists(p_phone text, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE COALESCE(l.notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
      AND ((char_length(public.normalize_phone(p_phone)) >= 8 AND l.phone_normalized = public.normalize_phone(p_phone))
        OR (position('@' in lower(trim(COALESCE(p_email, '')))) > 1 AND lower(trim(COALESCE(l.email, ''))) = lower(trim(p_email))))
  );
$$;

NOTIFY pgrst, 'reload schema';

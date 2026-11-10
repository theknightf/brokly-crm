-- Sales users must not be able to tell that a number already exists (a duplicate they add is saved and
-- quietly moved to 'Duplicate Leads'). The two "does it exist?" helpers answer only owners/admins.

CREATE OR REPLACE FUNCTION public.lead_exists(p_phone text, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_admin_or_owner_v2() AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE COALESCE(l.notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
      AND ((char_length(public.normalize_phone(p_phone)) >= 8 AND l.phone_normalized = public.normalize_phone(p_phone))
        OR (position('@' in lower(trim(COALESCE(p_email, '')))) > 1 AND lower(trim(COALESCE(l.email, ''))) = lower(trim(p_email))))
  );
$$;

-- Old pre-insert check (no longer used by the website). For sales it now reports "not a duplicate" for
-- every row and records nothing, so the insert goes ahead and the database flags it.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.check_and_record_duplicates(jsonb)'::regprocedure) INTO v_def;
  IF position('brokly: sales get no duplicate answer' in v_def) = 0 THEN
    v_def := replace(
      v_def,
      E'  SELECT COALESCE(NULLIF(full_name, \'\'), email, \'A user\') INTO v_actor_name',
      E'  -- brokly: sales get no duplicate answer\n'
      || E'  IF NOT public.is_admin_or_owner_v2() THEN\n'
      || E'    SELECT COALESCE(jsonb_agg(jsonb_build_object(\'idx\', (e.ordinality - 1)::int, \'duplicate\', false)), \'[]\'::jsonb)\n'
      || E'      INTO v_results FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(value, ordinality);\n'
      || E'    RETURN jsonb_build_object(\'results\', v_results, \'owners\', \'[]\'::jsonb);\n'
      || E'  END IF;\n\n'
      || E'  SELECT COALESCE(NULLIF(full_name, \'\'), email, \'A user\') INTO v_actor_name'
    );
    IF position('brokly: sales get no duplicate answer' in v_def) = 0 THEN
      RAISE EXCEPTION 'could not patch check_and_record_duplicates';
    END IF;
    EXECUTE v_def;
  END IF;
END $$;

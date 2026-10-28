-- Read-only duplicate probe for the Add Lead drawer ("as you type" warning).
-- Unlike check_and_record_duplicates() it records nothing and notifies nobody; it
-- only answers "does a lead with this phone / e-mail already exist?" and never
-- says who owns it. SECURITY DEFINER so it also sees leads the caller cannot
-- read under RLS.
CREATE OR REPLACE FUNCTION public.lead_exists(p_phone text, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.is_duplicate IS NOT TRUE
      AND COALESCE(l.notes, '') NOT LIKE '%[ARCHIVED DUPLICATE]%'
      AND (
        (char_length(public.normalize_phone(p_phone)) >= 8
          AND l.phone_normalized = public.normalize_phone(p_phone))
        OR (position('@' in lower(trim(COALESCE(p_email, '')))) > 1
          AND lower(trim(COALESCE(l.email, ''))) = lower(trim(p_email)))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.lead_exists(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_exists(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

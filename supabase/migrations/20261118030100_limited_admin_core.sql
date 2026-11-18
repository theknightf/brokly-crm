-- B1. limited_admin passes every "is admin" check (74 policies and many functions call these two helpers).
CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_active = true
    AND lower(trim(BOTH FROM role::text)) IN ('admin','owner','owner_admin','owneradmin','limited_admin'));
$$;
CREATE OR REPLACE FUNCTION public.is_admin_or_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role::text IN ('admin','owner','limited_admin'));
$$;
CREATE OR REPLACE FUNCTION public.is_limited_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role::text = 'limited_admin');
$$;

-- B2. RLS: a RESTRICTIVE policy is ANDed with the 3 existing permissive DELETE policies, so it cannot be bypassed by them.
CREATE POLICY leads_no_delete_limited_admin ON public.leads AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_limited_admin());

-- B3. Hard guard (also stops SECURITY DEFINER RPCs such as resolve_duplicate_lead 'merge', which DELETEs leads,
--     because auth.uid() is still the caller).
CREATE OR REPLACE FUNCTION public.leads_block_limited_admin_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_limited_admin() THEN
    RAISE EXCEPTION 'limited_admin cannot delete leads' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER trg_00_limited_admin_no_delete BEFORE DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_block_limited_admin_delete();

-- B4. "Soft delete": leads has no deleted_at. The only columns that hide/retire a lead are merged_into and moving it to
--     'Duplicate Leads' (is_duplicate). Block limited_admin from setting them by hand. Named trg_00_ so it fires BEFORE the
--     automatic duplicate-flag triggers, which therefore keep working when a limited_admin edits a phone number.
CREATE OR REPLACE FUNCTION public.leads_block_limited_admin_hide() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_limited_admin() AND (
       (NEW.merged_into IS NOT NULL AND NEW.merged_into IS DISTINCT FROM OLD.merged_into)
    OR (NEW.is_duplicate IS TRUE AND OLD.is_duplicate IS DISTINCT FROM TRUE)
    OR (NEW.crm_status = 'Duplicate Leads' AND OLD.crm_status IS DISTINCT FROM 'Duplicate Leads')) THEN
    RAISE EXCEPTION 'limited_admin cannot hide or merge leads' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_00_limited_admin_no_hide BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_block_limited_admin_hide();


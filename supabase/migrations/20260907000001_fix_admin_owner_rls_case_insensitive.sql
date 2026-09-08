-- Fix: is_admin_or_owner_v2 case-insensitive + OWNER_ADMIN tolerant + is_active gate
-- Root cause: role stored as 'OWNER_ADMIN','Owner','ADMIN' from legacy rows & signup metadata.
-- Prior function used role IN ('admin','owner') case-sensitive → Owners/Admins silently degraded to employee RLS (assigned_to only) → global Not Interested under-count.
-- Also ensures get_lead_status_counts respects fixed RLS (SECURITY INVOKER).

CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND lower(trim(role)) IN ('admin','owner','owner_admin','owneradmin')
  );
$$;

-- Complement: normalize is_admin_of_user team helper already uses auth.uid() directly — keep as is.
-- Re-create get_lead_status_counts to clarify RLS note (no logic change, SECURITY INVOKER respects repaired helper)
CREATE OR REPLACE FUNCTION public.get_lead_status_counts()
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE(crm_status, lead_status::TEXT, 'Fresh Leads') AS status,
    COUNT(*)::BIGINT AS count
  FROM public.leads
  GROUP BY COALESCE(crm_status, lead_status::TEXT, 'Fresh Leads')
  ORDER BY 2 DESC;
$$;

NOTIFY pgrst, 'reload schema';

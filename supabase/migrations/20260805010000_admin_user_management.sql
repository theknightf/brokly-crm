-- ============================================================
-- Brokly CRM - Admin User Management + Lead Routing
-- Migration: 20260805010000_admin_user_management.sql
--
-- 1. Admin relationship (admin_id) on user_profiles
-- 2. Agent code field (agent_code) on user_profiles
-- 3. admin_id on leads (auto-routed from the creating user's admin)
-- 4. RLS: admins can see/manage leads of users they manage
-- 5. Performance indexes for the leads/follow-ups hot paths
-- ============================================================

-- ─── 1. SCHEMA: admin relationship + agent code ─────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS agent_code TEXT DEFAULT '';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- ─── 2. AUTO-ROUTE LEADS TO THE MANAGING ADMIN ───────────────────────────────
-- When a lead is created, the owning admin is copied from the creating user's
-- profile (falling back to the assignee's admin when there is no creator).

CREATE OR REPLACE FUNCTION public.set_lead_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_admin UUID;
BEGIN
  SELECT up.admin_id INTO owner_admin
  FROM public.user_profiles up
  WHERE up.id = COALESCE(NEW.created_by, NEW.assigned_to)
  LIMIT 1;
  NEW.admin_id := owner_admin;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_set_admin ON public.leads;
CREATE TRIGGER leads_set_admin
  BEFORE INSERT OR UPDATE OF created_by, assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_admin();

-- ─── 3. RLS HELPER: is the current user the managing admin of another user? ──

CREATE OR REPLACE FUNCTION public.is_admin_of_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = target_user_id
      AND up.admin_id = auth.uid()
  );
$$;

-- ─── 4. LEADS RLS: include the managing admin of the assignee / creator ──────

DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;
CREATE POLICY "leads_select_policy"
ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND public.is_admin_of_user(created_by)
  )
);

DROP POLICY IF EXISTS "leads_update_policy" ON public.leads;
CREATE POLICY "leads_update_policy"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND public.is_admin_of_user(created_by)
  )
)
WITH CHECK (true);

DROP POLICY IF EXISTS "leads_delete_policy" ON public.leads;
CREATE POLICY "leads_delete_policy"
ON public.leads FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR (
    assigned_to IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR public.is_leader_of_assignee(assigned_to)
      OR public.is_admin_of_user(assigned_to)
    )
  )
  OR (
    assigned_to IS NULL
    AND created_by = auth.uid()
  )
  OR (
    assigned_to IS NULL
    AND created_by IS NOT NULL
    AND public.is_admin_of_user(created_by)
  )
);

-- ─── 5. LEAD COMMENTS: mirror the admin relationship ─────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_lead(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = target_lead_id
      AND (
        public.is_admin_or_owner_v2()
        OR (
          l.assigned_to IS NOT NULL
          AND (
            l.assigned_to = auth.uid()
            OR public.is_leader_of_assignee(l.assigned_to)
            OR public.is_admin_of_user(l.assigned_to)
          )
        )
        OR (
          l.assigned_to IS NULL
          AND l.created_by IS NOT NULL
          AND (
            l.created_by = auth.uid()
            OR public.is_admin_of_user(l.created_by)
          )
        )
      )
  );
$$;

-- ─── 6. PERFORMANCE INDEXES ──────────────────────────────────────────────────
-- Hot query paths used by the leads list, dashboard, follow-ups and reports.

CREATE INDEX IF NOT EXISTS idx_user_profiles_admin_id ON public.user_profiles(admin_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_active ON public.user_profiles(role, is_active);
CREATE INDEX IF NOT EXISTS idx_user_profiles_agent_code ON public.user_profiles(agent_code);

CREATE INDEX IF NOT EXISTS idx_leads_admin_id ON public.leads(admin_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_property_type ON public.leads(property_type);
CREATE INDEX IF NOT EXISTS idx_leads_created_by_created_at ON public.leads(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_created_at ON public.leads(assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_admin_id_created_at ON public.leads(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status_created_at ON public.leads(crm_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_ups_created_by_due_date ON public.follow_ups(created_by, due_date);

CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_created ON public.lead_comments(lead_id, created_at);

-- ─── 7. SERVER-SIDE STATUS COUNTS (KPIBentoGrid) ──────────────────────────────
-- Aggregates status counts in the database so the dashboard never downloads the
-- full leads table. SECURITY INVOKER + RLS: each user only sees what they can
-- access via the leads SELECT policy.

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

-- ============================================================
-- Brokly CRM - Teams Feature + Settings Support
-- Migration: 20260804012000_teams_and_settings.sql
-- ============================================================

-- ─── 1. TEAMS TABLE ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  leader_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── 2. TEAM_MEMBERSHIPS JUNCTION TABLE ──────────────────────────────────────
-- Links users to teams with a role (leader or member)

CREATE TABLE IF NOT EXISTS public.team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  is_leader BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT team_memberships_unique UNIQUE (team_id, user_id)
);

-- ─── 3. ADD team_id TO user_profiles ─────────────────────────────────────────

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- ─── 4. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_teams_leader_id ON public.teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_id ON public.team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user_id ON public.team_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_team_id ON public.user_profiles(team_id);

-- ─── 5. FUNCTIONS ────────────────────────────────────────────────────────────

-- Returns the team_id of the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_current_user_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT team_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Returns true if the given user_id is in the same team as the current user
CREATE OR REPLACE FUNCTION public.is_same_team(other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up1
    JOIN public.user_profiles up2 ON up1.team_id = up2.team_id
    WHERE up1.id = auth.uid()
      AND up2.id = other_user_id
      AND up1.team_id IS NOT NULL
  );
$$;

-- Returns true if the current user is an admin or owner
CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'owner')
  );
$$;

-- ─── 6. ENABLE RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

-- ─── 7. RLS POLICIES ─────────────────────────────────────────────────────────

-- teams: all authenticated users can read; admins/owners can write
DROP POLICY IF EXISTS "authenticated_view_teams" ON public.teams;
CREATE POLICY "authenticated_view_teams"
ON public.teams FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "admins_manage_teams" ON public.teams;
CREATE POLICY "admins_manage_teams"
ON public.teams FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- team_memberships: all authenticated users can read; admins/owners can write
DROP POLICY IF EXISTS "authenticated_view_team_memberships" ON public.team_memberships;
CREATE POLICY "authenticated_view_team_memberships"
ON public.team_memberships FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "admins_manage_team_memberships" ON public.team_memberships;
CREATE POLICY "admins_manage_team_memberships"
ON public.team_memberships FOR ALL TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- leads: team members see each other's leads; admins see all
-- Drop old permissive policy first
DROP POLICY IF EXISTS "authenticated_manage_leads" ON public.leads;

CREATE POLICY "team_members_view_leads"
ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (
    public.get_current_user_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = public.leads.created_by
        AND up.team_id = public.get_current_user_team_id()
    )
  )
);

CREATE POLICY "team_members_insert_leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "team_members_update_leads"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (
    public.get_current_user_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = public.leads.created_by
        AND up.team_id = public.get_current_user_team_id()
    )
  )
)
WITH CHECK (true);

CREATE POLICY "team_members_delete_leads"
ON public.leads FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (
    public.get_current_user_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = public.leads.created_by
        AND up.team_id = public.get_current_user_team_id()
    )
  )
);

-- follow_ups: same team-level sharing
DROP POLICY IF EXISTS "authenticated_manage_follow_ups" ON public.follow_ups;

CREATE POLICY "team_members_view_follow_ups"
ON public.follow_ups FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (
    public.get_current_user_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = public.follow_ups.created_by
        AND up.team_id = public.get_current_user_team_id()
    )
  )
);

CREATE POLICY "team_members_insert_follow_ups"
ON public.follow_ups FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "team_members_update_follow_ups"
ON public.follow_ups FOR UPDATE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (
    public.get_current_user_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = public.follow_ups.created_by
        AND up.team_id = public.get_current_user_team_id()
    )
  )
)
WITH CHECK (true);

CREATE POLICY "team_members_delete_follow_ups"
ON public.follow_ups FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR created_by = auth.uid()
  OR (
    public.get_current_user_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = public.follow_ups.created_by
        AND up.team_id = public.get_current_user_team_id()
    )
  )
);

-- ─── 8. TRIGGERS ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS teams_updated_at ON public.teams;
CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

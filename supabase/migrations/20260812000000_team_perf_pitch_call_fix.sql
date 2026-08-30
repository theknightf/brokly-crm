-- ============================================================
-- Brokly CRM - Team performance, project pitch & call log fixes
-- Migration: 20260812000000_team_perf_pitch_call_fix.sql
--
-- 1. Projects: adds pitch fields (pitch_summary / why_buy / selling_points)
--    so the Call Recorder can show a dynamic project introduction.
-- 2. Call logs: adds client_ref (idempotency/deduplication) + project_name
--    and lets team leaders see the call logs of the members they lead.
-- 3. Team leader ratings: new team_leader_ratings table storing the
--    Owner/Admin/Manager evaluation per team + leader.
-- ============================================================

-- ─── 1. PROJECT PITCH FIELDS ─────────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS pitch_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS why_buy TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS selling_points TEXT DEFAULT '';

-- Seed sensible defaults for existing projects (only when the field is empty).
-- Content is generated from the project's own row (name/developer) — nothing
-- is hardcoded per project.
UPDATE public.projects p
SET
  pitch_summary = CASE
    WHEN COALESCE(p.pitch_summary, '') <> '' THEN p.pitch_summary
    ELSE COALESCE(d.name, 'the developer') || ' presents ' || p.name ||
         ', a new real estate development built for modern living. The project combines prime location,'
         || ' thoughtful design and flexible payment plans, making it a strong option for both living and investment.'
  END,
  why_buy = CASE
    WHEN COALESCE(p.why_buy, '') <> '' THEN p.why_buy
    ELSE 'Buying a unit in ' || p.name ||
         ' means owning property in a growing area with strong rental demand and long-term value appreciation.'
         || ' With a reputable developer and flexible installment plans, it is a safe and rewarding investment for your future.'
  END,
  selling_points = CASE
    WHEN COALESCE(p.selling_points, '') <> '' THEN p.selling_points
    ELSE 'Prime location and easy access to main roads.' || E'\n' ||
         'Trusted developer with proven delivery record.' || E'\n' ||
         'Flexible payment plans and low down payment.' || E'\n' ||
         'High rental demand and strong resale value.' || E'\n' ||
         'Modern amenities and green landscaped areas.'
  END
FROM public.developers d
WHERE d.id = p.developer_id;

-- ─── 2. CALL LOGS FIXES ──────────────────────────────────────────────────────

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS client_ref TEXT,
  ADD COLUMN IF NOT EXISTS project_name TEXT DEFAULT '';

-- Enforces idempotency: a retried save with the same client_ref can never
-- create a second row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_client_ref
  ON public.call_logs(client_ref) WHERE client_ref IS NOT NULL;

-- Team leaders can see the call logs of the members of the teams they lead.
DROP POLICY IF EXISTS "leaders_view_team_call_logs" ON public.call_logs;
CREATE POLICY "leaders_view_team_call_logs"
  ON public.call_logs FOR SELECT TO authenticated
  USING (public.is_my_team_member(user_id));

-- ─── 3. TEAM LEADER RATINGS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_leader_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  rating NUMERIC(3,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  rated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leader_ratings_team
  ON public.team_leader_ratings(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leader_ratings_leader
  ON public.team_leader_ratings(leader_id, created_at DESC);

ALTER TABLE public.team_leader_ratings ENABLE ROW LEVEL SECURITY;

-- Owners & admins read/write; the rated leader may read their own rating.
DROP POLICY IF EXISTS "admins_read_leader_ratings" ON public.team_leader_ratings;
CREATE POLICY "admins_read_leader_ratings"
  ON public.team_leader_ratings FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2() OR leader_id = auth.uid());

DROP POLICY IF EXISTS "admins_write_leader_ratings" ON public.team_leader_ratings;
CREATE POLICY "admins_write_leader_ratings"
  ON public.team_leader_ratings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "admins_update_leader_ratings" ON public.team_leader_ratings;
CREATE POLICY "admins_update_leader_ratings"
  ON public.team_leader_ratings FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner_v2())
  WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "admins_delete_leader_ratings" ON public.team_leader_ratings;
CREATE POLICY "admins_delete_leader_ratings"
  ON public.team_leader_ratings FOR DELETE TO authenticated
  USING (public.is_admin_or_owner_v2());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_leader_ratings TO authenticated;

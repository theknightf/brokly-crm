-- ============================================================
-- Brokly CRM - Role tasks + user-facing KPI/task visibility
-- Migration: 20260822000000_tasks_and_role_kpis.sql
--
-- Adds:
--   * `tasks` - simple role-assigned to-dos (title, note, due date,
--     priority, target role) created by owners/admins.
--   * `task_completions` - per-user completion of a role task so each
--     member tracks their own "done" state.
--   * Safety: grants for `kpi_targets` (created by an earlier migration
--     without table grants) so the authenticated role can read/write it.
--   * Safety: re-creates the admin/owner helper used by RLS.
--
-- Fully idempotent.
-- ============================================================

-- ─── 1. BASE GUARD (safe to redefine) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_or_owner_v2()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'owner')
  );
$$;

-- ─── 2. TASKS (role-assigned to-dos) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  target_role TEXT NOT NULL DEFAULT 'all',   -- all | broker | senior_agent | agent | telecaller | ...
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'Medium',   -- High | Medium | Low
  assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_role_due ON public.tasks(target_role, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON public.tasks(created_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
CREATE POLICY "tasks_read"
  ON public.tasks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tasks_admin" ON public.tasks;
CREATE POLICY "tasks_admin"
  ON public.tasks FOR ALL TO authenticated
  USING (public.is_admin_or_owner_v2())
  WITH CHECK (public.is_admin_or_owner_v2());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

-- ─── 3. TASK COMPLETIONS (per-user done state) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_completions (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_user ON public.task_completions(user_id);

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_completions_read" ON public.task_completions;
CREATE POLICY "task_completions_read"
  ON public.task_completions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "task_completions_insert" ON public.task_completions;
CREATE POLICY "task_completions_insert"
  ON public.task_completions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "task_completions_delete" ON public.task_completions;
CREATE POLICY "task_completions_delete"
  ON public.task_completions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

GRANT SELECT, INSERT, DELETE ON public.task_completions TO authenticated;

-- ─── 4. SAFETY: ensure kpi_targets has table grants ─────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_targets TO authenticated;
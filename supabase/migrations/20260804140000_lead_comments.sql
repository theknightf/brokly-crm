-- ============================================================
-- Brokly CRM - Lead Comments
-- Migration: 20260804140000_lead_comments.sql
-- ============================================================
-- Threaded comments on leads. Visibility mirrors lead SELECT RLS:
-- admin/owner, assignee, or team leader of the assignee.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON public.lead_comments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_user_id ON public.lead_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_created_at ON public.lead_comments(created_at);

ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;

-- Helper: can the current user see/interact with this lead?
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
          )
        )
        OR (
          l.assigned_to IS NULL
          AND l.created_by = auth.uid()
        )
      )
  );
$$;

DROP POLICY IF EXISTS "lead_comments_select" ON public.lead_comments;
CREATE POLICY "lead_comments_select"
ON public.lead_comments FOR SELECT TO authenticated
USING (public.can_access_lead(lead_id));

DROP POLICY IF EXISTS "lead_comments_insert" ON public.lead_comments;
CREATE POLICY "lead_comments_insert"
ON public.lead_comments FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_lead(lead_id)
);

DROP POLICY IF EXISTS "lead_comments_delete" ON public.lead_comments;
CREATE POLICY "lead_comments_delete"
ON public.lead_comments FOR DELETE TO authenticated
USING (
  public.is_admin_or_owner_v2()
  OR user_id = auth.uid()
);

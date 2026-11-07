-- History of bulk assignments: who assigned how many leads, to whom, into which stage, and what those leads looked like
-- (stage / source / previous owner breakdown) at that moment. Read and written by admins and owners only.
CREATE TABLE IF NOT EXISTS public.lead_assignment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by_name text,
  kind text NOT NULL CHECK (kind IN ('agents', 'team')),
  team_name text,
  stage text,
  lead_count integer NOT NULL CHECK (lead_count >= 0),
  lead_ids uuid[] NOT NULL DEFAULT '{}',
  assignees jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_stage jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_source jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_owner jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_batches_created ON public.lead_assignment_batches (created_at DESC);

ALTER TABLE public.lead_assignment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_assignment_batches ON public.lead_assignment_batches
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_or_owner_v2()));

CREATE POLICY admins_insert_assignment_batches ON public.lead_assignment_batches
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin_or_owner_v2()) AND created_by = (SELECT auth.uid()));

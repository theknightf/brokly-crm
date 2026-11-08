-- Audit trail for everything the AI assistant changes: who asked, what it did, which record, and the values before/after.
-- Written with the caller's own session (RLS): an agent can only record their own actions; owners/admins can read all.
CREATE TABLE IF NOT EXISTS public.assistant_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid NOT NULL,
  user_name    text,
  action       text NOT NULL,                 -- update_customer_status, assign_customer, log_call, ...
  entity_type  text NOT NULL DEFAULT 'lead',
  entity_id    text,
  entity_label text,                          -- customer name, for readable history
  before_value jsonb,
  after_value  jsonb,
  status       text NOT NULL DEFAULT 'success', -- success | failed
  summary      text,
  confirmed    boolean NOT NULL DEFAULT false   -- true when a human pressed Confirm on a preview
);

CREATE INDEX IF NOT EXISTS assistant_audit_log_created_idx ON public.assistant_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_audit_log_entity_idx ON public.assistant_audit_log (entity_id);

ALTER TABLE public.assistant_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_audit_insert_own ON public.assistant_audit_log;
CREATE POLICY assistant_audit_insert_own ON public.assistant_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS assistant_audit_select ON public.assistant_audit_log;
CREATE POLICY assistant_audit_select ON public.assistant_audit_log
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin_or_owner());

-- No UPDATE / DELETE policy: the trail is append-only for everyone using the API.

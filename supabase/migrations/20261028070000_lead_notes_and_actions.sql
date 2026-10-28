-- ============================================================
-- Employee / lead drawer: lead_notes + lead_actions (+ create_lead_action RPC)
-- ============================================================
-- NOT APPLIED automatically. Review, then run it in the Supabase SQL editor.
--
-- lead_notes    free-text notes about a lead, optionally tied to a call.
--               Author may edit/delete within 15 minutes; admin/owner any time.
-- lead_actions  planned or logged work on a lead (status update, follow-up call,
--               meeting, WhatsApp, offer). Upcoming = done_at IS NULL.
-- create_lead_action()  inserts the action and, for a status update, moves the
--               lead to the new stage in the SAME transaction.
-- Visibility (RLS): employees see what they wrote / what is assigned to them,
-- managers/admins see everything. Both tables are only writable through the
-- rules below; nothing is readable by anon.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_lead_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND lower(regexp_replace(COALESCE(role::text, ''), '[\s-]+', '_', 'g'))
          IN ('owner', 'admin', 'manager', 'owner_admin', 'owneradmin')
  );
$$;
REVOKE ALL ON FUNCTION public.is_lead_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lead_manager() TO authenticated;

-- ── lead_notes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  call_id    uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  author_id  uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead    ON public.lead_notes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_call    ON public.lead_notes (call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_notes_author  ON public.lead_notes (author_id, created_at DESC);

-- Only the text may change; ids/author/created_at are immutable. updated_at moves on edit,
-- the UI shows "edited" when updated_at is noticeably after created_at.
CREATE OR REPLACE FUNCTION public.lead_notes_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.lead_id := OLD.lead_id;
  NEW.author_id := OLD.author_id;
  NEW.created_at := OLD.created_at;
  NEW.call_id := OLD.call_id;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_notes_guard_update ON public.lead_notes;
CREATE TRIGGER trg_lead_notes_guard_update BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.lead_notes_guard_update();

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_notes_select ON public.lead_notes;
CREATE POLICY lead_notes_select ON public.lead_notes FOR SELECT TO authenticated
  USING (public.is_lead_manager() OR author_id = auth.uid());

DROP POLICY IF EXISTS lead_notes_insert ON public.lead_notes;
CREATE POLICY lead_notes_insert ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_access_lead(lead_id));

DROP POLICY IF EXISTS lead_notes_update ON public.lead_notes;
CREATE POLICY lead_notes_update ON public.lead_notes FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_owner_v2()
    OR (author_id = auth.uid() AND created_at > now() - interval '15 minutes')
  )
  WITH CHECK (public.is_admin_or_owner_v2() OR author_id = auth.uid());

DROP POLICY IF EXISTS lead_notes_delete ON public.lead_notes;
CREATE POLICY lead_notes_delete ON public.lead_notes FOR DELETE TO authenticated
  USING (
    public.is_admin_or_owner_v2()
    OR (author_id = auth.uid() AND created_at > now() - interval '15 minutes')
  );

REVOKE ALL ON public.lead_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;

-- ── lead_actions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  call_id     uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  type        text NOT NULL CHECK (type IN ('status_update', 'follow_up_call', 'meeting', 'send_whatsapp', 'send_offer')),
  status      text CHECK (status IN ('Interested', 'Follow-up', 'Meeting scheduled', 'Not interested',
                                     'Wrong number', 'Retry', 'Closed/Deal')),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  due_at      timestamptz,
  done_at     timestamptz,
  assignee_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by  uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_actions_lead     ON public.lead_actions (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_actions_call     ON public.lead_actions (call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_actions_assignee ON public.lead_actions (assignee_id, done_at);
CREATE INDEX IF NOT EXISTS idx_lead_actions_due      ON public.lead_actions (due_at) WHERE done_at IS NULL;

-- After creation only "done" may change (admins may change anything).
CREATE OR REPLACE FUNCTION public.lead_actions_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.is_admin_or_owner_v2() THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.lead_id := OLD.lead_id;
  NEW.call_id := OLD.call_id;
  NEW.type := OLD.type;
  NEW.status := OLD.status;
  NEW.note := OLD.note;
  NEW.due_at := OLD.due_at;
  NEW.assignee_id := OLD.assignee_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_actions_guard_update ON public.lead_actions;
CREATE TRIGGER trg_lead_actions_guard_update BEFORE UPDATE ON public.lead_actions
  FOR EACH ROW EXECUTE FUNCTION public.lead_actions_guard_update();

ALTER TABLE public.lead_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_actions_select ON public.lead_actions;
CREATE POLICY lead_actions_select ON public.lead_actions FOR SELECT TO authenticated
  USING (public.is_lead_manager() OR created_by = auth.uid() OR assignee_id = auth.uid());

DROP POLICY IF EXISTS lead_actions_insert ON public.lead_actions;
CREATE POLICY lead_actions_insert ON public.lead_actions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_access_lead(lead_id));

DROP POLICY IF EXISTS lead_actions_update ON public.lead_actions;
CREATE POLICY lead_actions_update ON public.lead_actions FOR UPDATE TO authenticated
  USING (public.is_lead_manager() OR created_by = auth.uid() OR assignee_id = auth.uid())
  WITH CHECK (public.is_lead_manager() OR created_by = auth.uid() OR assignee_id = auth.uid());

DROP POLICY IF EXISTS lead_actions_delete ON public.lead_actions;
CREATE POLICY lead_actions_delete ON public.lead_actions FOR DELETE TO authenticated
  USING (public.is_admin_or_owner_v2());

REVOKE ALL ON public.lead_actions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_actions TO authenticated;

-- ── create_lead_action(): insert + (status update) move the lead, atomically ──
CREATE OR REPLACE FUNCTION public.create_lead_action(
  p_lead_id uuid,
  p_call_id uuid,
  p_type text,
  p_status text,
  p_note text,
  p_due_at timestamptz,
  p_assignee_id uuid,
  p_new_crm_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.lead_actions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_call_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.call_logs WHERE id = p_call_id) THEN
    RAISE EXCEPTION 'call not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.lead_actions (lead_id, call_id, type, status, note, due_at, assignee_id, created_by)
  VALUES (p_lead_id, p_call_id, p_type, p_status, NULLIF(btrim(COALESCE(p_note, '')), ''),
          p_due_at, COALESCE(p_assignee_id, v_actor), v_actor)
  RETURNING * INTO v_row;

  -- Status updates are logged as done immediately and move the lead's current stage.
  IF p_type = 'status_update' THEN
    UPDATE public.lead_actions SET done_at = now() WHERE id = v_row.id RETURNING * INTO v_row;
    IF NULLIF(btrim(COALESCE(p_new_crm_status, '')), '') IS NOT NULL THEN
      UPDATE public.leads
         SET crm_status = p_new_crm_status,
             last_action_at = now(),
             last_action_by = v_actor
       WHERE id = p_lead_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.create_lead_action(uuid, uuid, text, text, text, timestamptz, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lead_action(uuid, uuid, text, text, text, timestamptz, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

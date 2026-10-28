-- ============================================================
-- user_actions: ONE validated log of what agents actually do, so every report /
-- leaderboard / counter reads the same numbers (no drift).
-- ============================================================
-- Action types: CALL, MEETING, NOTE, STATUS_CHANGE.
--   * calls_logs row                       -> CALL (MEETING for meeting / site-visit outcomes)
--   * lead_comments row                    -> NOTE
--   * site_visits row                      -> MEETING
--   * leads.crm_status changes             -> STATUS_CHANGE {old_status,new_status,changed_by,timestamp}
-- Rows are written by AFTER triggers, i.e. in the SAME transaction as the change
-- itself, and are idempotent (unique source key). Counters are derived from this
-- table (and the user_action_daily view), never stored, so they cannot drift.
-- The historical backfill at the bottom recomputes the past from the raw tables.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,
  lead_id      uuid,
  action_type  text NOT NULL CHECK (action_type IN ('CALL', 'MEETING', 'NOTE', 'STATUS_CHANGE')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_table text NOT NULL,
  source_id    text NOT NULL,
  UNIQUE (source_table, source_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_user_actions_user_created ON public.user_actions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_type_created ON public.user_actions (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_lead ON public.user_actions (lead_id) WHERE lead_id IS NOT NULL;

-- Same visibility as activity_log: admins/owners see everyone, others their own.
ALTER TABLE public.user_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_actions_select ON public.user_actions;
CREATE POLICY user_actions_select ON public.user_actions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2() OR user_id = auth.uid());
REVOKE ALL ON public.user_actions FROM anon, authenticated;
GRANT SELECT ON public.user_actions TO authenticated;

-- Per-user, per-day, per-type counters (always current: it is a view).
CREATE OR REPLACE VIEW public.user_action_daily
WITH (security_invoker = true) AS
SELECT user_id,
       (created_at AT TIME ZONE 'UTC')::date AS action_date,
       action_type,
       count(*)::int AS n
FROM public.user_actions
GROUP BY 1, 2, 3;
GRANT SELECT ON public.user_action_daily TO authenticated;

-- ── Triggers (same transaction as the source write) ──────────────────────────
CREATE OR REPLACE FUNCTION public.user_actions_from_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead uuid;
BEGIN
  IF NEW.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_lead := NEW.entity_id::uuid;
  ELSE
    v_lead := NEW.lead_id;
  END IF;
  INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
  VALUES (
    COALESCE(NEW.created_at, now()), NEW.user_id, v_lead,
    CASE WHEN NEW.outcome IN ('Meeting', 'Schedule Meeting', 'Site Visit') THEN 'MEETING' ELSE 'CALL' END,
    jsonb_build_object('outcome', NEW.outcome, 'duration_seconds', NEW.duration_seconds, 'is_valid', NEW.is_valid),
    'call_logs', NEW.id::text
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_actions_from_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
  VALUES (COALESCE(NEW.created_at, now()), NEW.user_id, NEW.lead_id, 'NOTE',
          jsonb_build_object('comment_id', NEW.id), 'lead_comments', NEW.id::text)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_actions_from_site_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
  VALUES (NEW.check_in_at, NEW.user_id, NEW.lead_id, 'MEETING',
          jsonb_build_object('site_visit_id', NEW.id), 'site_visits', NEW.id::text)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_actions_from_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := COALESCE(auth.uid(), NEW.last_action_by);
BEGIN
  INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
  VALUES (
    now(), v_actor, NEW.id, 'STATUS_CHANGE',
    jsonb_build_object('old_status', OLD.crm_status, 'new_status', NEW.crm_status,
                       'changed_by', v_actor, 'timestamp', now()),
    'leads', NEW.id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_actions_call ON public.call_logs;
CREATE TRIGGER trg_user_actions_call AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.user_actions_from_call();

DROP TRIGGER IF EXISTS trg_user_actions_note ON public.lead_comments;
CREATE TRIGGER trg_user_actions_note AFTER INSERT ON public.lead_comments
  FOR EACH ROW EXECUTE FUNCTION public.user_actions_from_note();

DROP TRIGGER IF EXISTS trg_user_actions_site_visit ON public.site_visits;
-- A site visit / meeting counts once it is checked in (scheduled-only rows have no check_in_at).
CREATE TRIGGER trg_user_actions_site_visit AFTER INSERT OR UPDATE OF check_in_at ON public.site_visits
  FOR EACH ROW WHEN (NEW.check_in_at IS NOT NULL)
  EXECUTE FUNCTION public.user_actions_from_site_visit();

DROP TRIGGER IF EXISTS trg_user_actions_status ON public.leads;
CREATE TRIGGER trg_user_actions_status AFTER UPDATE OF crm_status ON public.leads
  FOR EACH ROW WHEN (OLD.crm_status IS DISTINCT FROM NEW.crm_status)
  EXECUTE FUNCTION public.user_actions_from_status_change();

-- Fix: last_action_at was written with COALESCE(NEW.last_action_at, now()). NEW already
-- holds the OLD value, so after the first action it never moved again. Only keep the
-- caller's value when the caller really set one.
CREATE OR REPLACE FUNCTION public.touch_lead_action_on_lead_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (OLD.crm_status IS DISTINCT FROM NEW.crm_status)
     OR (OLD.lead_status IS DISTINCT FROM NEW.lead_status)
     OR (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     OR (OLD.follow_up_due IS DISTINCT FROM NEW.follow_up_due) THEN
    IF NEW.last_action_at IS NOT DISTINCT FROM OLD.last_action_at THEN
      NEW.last_action_at := now();
      NEW.last_action_by := COALESCE(auth.uid(), NEW.last_action_by);
    END IF;
    IF NEW.last_activity_at IS NOT DISTINCT FROM OLD.last_activity_at THEN
      NEW.last_activity_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Historical recalculation (idempotent: ON CONFLICT DO NOTHING) ────────────
INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
SELECT c.created_at, c.user_id,
       CASE WHEN c.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN c.entity_id::uuid ELSE c.lead_id END,
       CASE WHEN c.outcome IN ('Meeting', 'Schedule Meeting', 'Site Visit') THEN 'MEETING' ELSE 'CALL' END,
       jsonb_build_object('outcome', c.outcome, 'duration_seconds', c.duration_seconds, 'is_valid', c.is_valid, 'backfilled', true),
       'call_logs', c.id::text
FROM public.call_logs c
ON CONFLICT DO NOTHING;

INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
SELECT m.created_at, m.user_id, m.lead_id, 'NOTE',
       jsonb_build_object('comment_id', m.id, 'backfilled', true), 'lead_comments', m.id::text
FROM public.lead_comments m
ON CONFLICT DO NOTHING;

INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
SELECT v.check_in_at, v.user_id, v.lead_id, 'MEETING',
       jsonb_build_object('site_visit_id', v.id, 'backfilled', true), 'site_visits', v.id::text
FROM public.site_visits v
WHERE v.check_in_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- Past status changes were recorded in activity_log as 'Lead Status Updated' with
-- meta "old -> new".
INSERT INTO public.user_actions (created_at, user_id, lead_id, action_type, payload, source_table, source_id)
SELECT a.created_at, a.user_id,
       CASE WHEN a.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN a.entity_id::uuid END,
       'STATUS_CHANGE',
       jsonb_build_object(
         'old_status', NULLIF(trim(split_part(COALESCE(a.meta, ''), '->', 1)), ''),
         'new_status', NULLIF(trim(split_part(COALESCE(a.meta, ''), '->', 2)), ''),
         'changed_by', a.user_id, 'timestamp', a.created_at, 'backfilled', true),
       'activity_log', a.id::text
FROM public.activity_log a
WHERE a.action_type = 'Lead Status Updated'
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

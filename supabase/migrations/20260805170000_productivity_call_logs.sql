-- ============================================================
-- Brokly CRM - Call Logs + Enhanced Activity Triggers
-- Migration: 20260805170000_productivity_call_logs.sql
--
-- 1. Adds a dedicated call_logs table so every user call/site visit
--    is recorded and counts towards productivity analytics.
-- 2. Enhances the lead/follow-up triggers to detail status changes
--    (old -> new) so "update status" actions are searchable.
-- 3. Adds a helper to rank users for the productivity leaderboard.
-- ============================================================

-- ─── 1. CALL LOGS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'lead',            -- 'lead' | 'customer'
  entity_id TEXT DEFAULT '',                            -- lead id or customer id
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'Call',                 -- Call | Video Call | WhatsApp | Email | Site Visit | Meeting
  direction TEXT DEFAULT 'outgoing',                    -- outgoing | incoming
  duration_seconds INTEGER DEFAULT 0,                   -- call length
  outcome TEXT DEFAULT '',                              -- Reached / No Answer / Voicemail ...
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_logs_user_time
  ON public.call_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_created
  ON public.call_logs(created_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Users see own call logs; admins/owners see all (via service role reads too)
DROP POLICY IF EXISTS "users_own_call_logs" ON public.call_logs;
CREATE POLICY "users_own_call_logs"
  ON public.call_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_call_logs" ON public.call_logs;
CREATE POLICY "users_insert_call_logs"
  ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─── 2. LOG A CALL INTO activity_log ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_call_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
  VALUES (
    NEW.user_id,
    'Call Logged',
    NEW.entity_type,
    NEW.entity_id,
    COALESCE(NEW.contact_name, ''),
    NEW.channel || '|' || COALESCE(NEW.direction, '')
  );
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_call ON public.call_logs;
CREATE TRIGGER trg_log_call
  AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_call_added();

-- ─── 3. ENHANCE LEAD TRIGGER: record status changes --------------
-- Replaces log_lead_change to store OLD.status -> NEW.status in meta.

CREATE OR REPLACE FUNCTION public.log_lead_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (auth.uid(), 'Lead Added', 'lead', NEW.id::text, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta)
      VALUES (auth.uid(), 'Lead Status Updated', 'lead', NEW.id::text, NEW.name,
              COALESCE(OLD.lead_status::text,'') || ' -> ' || COALESCE(NEW.lead_status::text,''));
    ELSE
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
      VALUES (auth.uid(), 'Lead Updated', 'lead', NEW.id::text, NEW.name);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
    VALUES (auth.uid(), 'Lead Deleted', 'lead', OLD.id::text, OLD.name);
  END IF;
  RETURN NULL;
END;
$$;

-- ─── 4. LEADERBOARD SCORING HELPER ───────────────────────────────────────────
-- Weighted sum of activity for a date window. Used by the analytics API so the
-- ranking logic stays consistent between live scores and stored history.

CREATE OR REPLACE FUNCTION public.productivity_score(
  p_leads_created INTEGER,
  p_leads_updated INTEGER,
  p_calls INTEGER,
  p_actions INTEGER,
  p_active_seconds INTEGER
)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, (
    COALESCE(p_leads_created,0) * 40 +
    COALESCE(p_leads_updated,0) * 20 +
    COALESCE(p_calls,0) * 15 +
    COALESCE(p_actions,0) * 2 +
    COALESCE(p_active_seconds,0) / 120
  )::INTEGER);
$$;
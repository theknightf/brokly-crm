-- ============================================================================
-- Brokly — apply the MISSING productivity tables in ONE paste (run this once
-- in the Supabase SQL Editor: Dashboard → SQL Editor → New Query → paste → Run)
-- ============================================================================
-- What this adds:
--   1. activity_log  (feeds the in-app notification bell + assignment pings)
--   2. call_logs     (feeds the Call Logs dashboard/Reports — data collection)
--   3. The RLS + a trigger that mirrors each call into activity_log
--   4. Realtime on both tables (so the bell + reports refresh instantly)
-- It is safe to run more than once (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- -- 0) Helper used by the RLS policies (idempotent)
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

-- -- 1) activity_log ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  meta TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created ON public.activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_type_date ON public.activity_log(action_type, created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_activity_log" ON public.activity_log;
CREATE POLICY "read_activity_log"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2() OR user_id = auth.uid());

DROP POLICY IF EXISTS "write_activity_log" ON public.activity_log;
CREATE POLICY "write_activity_log"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- -- 2) call_logs ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'lead',
  entity_id TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'Call',
  direction TEXT DEFAULT 'outgoing',
  duration_seconds INTEGER DEFAULT 0,
  outcome TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_logs_created ON public.call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON public.call_logs(user_id, created_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_call_logs" ON public.call_logs;
CREATE POLICY "users_own_call_logs"
  ON public.call_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "users_insert_call_logs" ON public.call_logs;
CREATE POLICY "users_insert_call_logs"
  ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT SELECT, INSERT ON public.call_logs TO authenticated;

-- -- 3) Mirror each call into activity_log for productivity analytics ----------
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

-- -- 4) Realtime (so the notification bell + call log refresh instantly) ------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
END $$;

-- Done. You can now see call logs in Reports > Call activity and the Admin tab.
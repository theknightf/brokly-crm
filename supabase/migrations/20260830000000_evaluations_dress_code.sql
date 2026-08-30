-- ============================================================
-- Performance System: Evaluations (Dress Code) + 360 Integration
-- Migration: 20260830000000_evaluations_dress_code.sql
--
-- Wires Admin daily dress-code inputs to DB, feeds Leaderboard
-- engine (40/30/30) and Owner 360 profile via FK relations.
-- ============================================================

-- 1. Evaluations table (spec: Users -> Attendance/CallLogs/Evaluations)
CREATE TABLE IF NOT EXISTS public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  dress_code_rating SMALLINT NOT NULL CHECK (dress_code_rating BETWEEN 1 AND 5),
  notes TEXT DEFAULT '',
  behavioral_flags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, date, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluations_employee_date ON public.evaluations(employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator ON public.evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_date ON public.evaluations(date DESC);

-- Alias table for dress_code clarity (view)
CREATE OR REPLACE VIEW public.dress_code_evaluations AS SELECT * FROM public.evaluations;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_evaluations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_evaluations_updated_at ON public.evaluations;
CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.handle_evaluations_updated_at();

-- Mirror to activity_log for real-time Leaderboard refresh
CREATE OR REPLACE FUNCTION public.log_evaluation_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail)
  VALUES (NEW.employee_id, 'Dress Code Evaluated', 'evaluation', NEW.id::text, 'Rating ' || NEW.dress_code_rating || '/5');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_evaluation ON public.evaluations;
CREATE TRIGGER trg_log_evaluation
  AFTER INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.log_evaluation_activity();

-- RLS
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_select_all ON public.evaluations;
CREATE POLICY evaluations_select_all ON public.evaluations FOR SELECT USING (
  is_admin_or_owner_v2() OR employee_id = auth.uid() OR evaluator_id = auth.uid() OR is_same_team(employee_id)
);

DROP POLICY IF EXISTS evaluations_admin_insert ON public.evaluations;
CREATE POLICY evaluations_admin_insert ON public.evaluations FOR INSERT WITH CHECK (
  is_admin_or_owner_v2()
);

DROP POLICY IF EXISTS evaluations_admin_update ON public.evaluations;
CREATE POLICY evaluations_admin_update ON public.evaluations FOR UPDATE USING (is_admin_or_owner_v2()) WITH CHECK (is_admin_or_owner_v2());

DROP POLICY IF EXISTS evaluations_admin_delete ON public.evaluations;
CREATE POLICY evaluations_admin_delete ON public.evaluations FOR DELETE USING (is_admin_or_owner_v2());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO authenticated;

-- Helper: dress score 0-100 for a user in a date range
CREATE OR REPLACE FUNCTION public.dress_score_for_user(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE(ROUND(AVG(dress_code_rating) / 5.0 * 100)::INTEGER, 0)
  FROM public.evaluations
  WHERE employee_id = p_user_id AND date BETWEEN p_start AND p_end;
$$;

-- Helper: attendance score 0-100 (on-time % + hours)
CREATE OR REPLACE FUNCTION public.attendance_score_for_user(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS INTEGER LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total INTEGER; v_present INTEGER; v_late INTEGER; v_score INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.attendance WHERE user_id = p_user_id AND attendance_date BETWEEN p_start AND p_end;
  SELECT COUNT(*) INTO v_present FROM public.attendance WHERE user_id = p_user_id AND attendance_date BETWEEN p_start AND p_end AND check_in_time IS NOT NULL;
  SELECT COUNT(*) INTO v_late FROM public.attendance WHERE user_id = p_user_id AND attendance_date BETWEEN p_start AND p_end AND check_in_time::time > '12:30'::time;
  IF v_total = 0 AND v_present = 0 THEN RETURN 0; END IF;
  -- present ratio + punctuality
  v_score := GREATEST(0, LEAST(100, (COALESCE(v_present,0) * 100 / GREATEST(1, GREATEST(v_total, 22)))::int ));
  -- deduct late
  v_score := v_score - LEAST(30, COALESCE(v_late,0) * 5);
  RETURN GREATEST(0, v_score);
END; $$;

NOTIFY pgrst, 'reload schema';

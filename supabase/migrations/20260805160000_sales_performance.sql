-- ============================================================
-- Brokly CRM - Sales Performance & Evaluation System
-- Migration: 20260805160000_sales_performance.sql
--
-- Stores a permanent snapshot of each sales user's performance
-- evaluation per period (day / week / month). Scores are computed
-- by the /api/performance route and upserted here so history is
-- retained even as live data changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,                 -- 'day' | 'week' | 'month'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Overall
  score INTEGER NOT NULL DEFAULT 0,          -- 0-100
  grade TEXT NOT NULL DEFAULT '',            -- Excellent / Good / Average / Needs Improvement / Critical

  -- Demand / workload in the period
  leads_created INTEGER DEFAULT 0,
  leads_assigned INTEGER DEFAULT 0,
  total_followups INTEGER DEFAULT 0,
  completed_followups INTEGER DEFAULT 0,
  overdue_followups INTEGER DEFAULT 0,
  unanswered_calls INTEGER DEFAULT 0,        -- Call/VideoCall follow-ups past due & not completed
  overdue_leads INTEGER DEFAULT 0,           -- leads with follow_up_due < today not Won/Lost
  leads_contacted INTEGER DEFAULT 0,         -- leads with any comment / follow-up this period
  active_seconds INTEGER DEFAULT 0,          -- tracked active time in period
  actions INTEGER DEFAULT 0,                 -- logged actions (activity_log) in period

  -- Rate metrics (0-100)
  followup_rate NUMERIC(5,2) DEFAULT 0,
  contact_rate NUMERIC(5,2) DEFAULT 0,       -- leads_contacted / leads_assigned
  productivity NUMERIC(5,2) DEFAULT 0,       -- actions per active hour

  -- Latency
  avg_response_hours NUMERIC(6,2) DEFAULT 0, -- avg time lead created -> first Pending follow-up due
  hours_since_last_activity NUMERIC(6,2) DEFAULT 0,

  -- Categorized breakdown with reasons
  category_scores JSONB DEFAULT '{}',        -- {"Follow-up Rate": 20, ...}

  -- Explanations
  lost_points JSONB DEFAULT '[]',            -- [{"reason": "5 overdue follow-ups", "points": 10}]
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',

  is_current BOOLEAN DEFAULT false,          -- newest snapshot per user/period
  computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, period_type, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_sales_perf_user_date
  ON public.sales_performance(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_sales_perf_period
  ON public.sales_performance(period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_sales_perf_current
  ON public.sales_performance(is_current) WHERE is_current = true;

ALTER TABLE public.sales_performance ENABLE ROW LEVEL SECURITY;

-- Only admins/owners can read/write evaluations (owner dashboard).
DROP POLICY IF EXISTS "sales_performance_select" ON public.sales_performance;
CREATE POLICY "sales_performance_select"
ON public.sales_performance FOR SELECT TO authenticated
USING (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "sales_performance_insert" ON public.sales_performance;
CREATE POLICY "sales_performance_insert"
ON public.sales_performance FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "sales_performance_update" ON public.sales_performance;
CREATE POLICY "sales_performance_update"
ON public.sales_performance FOR UPDATE TO authenticated
USING (public.is_admin_or_owner_v2())
WITH CHECK (public.is_admin_or_owner_v2());

-- Ensure only one 'current' snapshot per user: clear others when a new one is inserted.
CREATE OR REPLACE FUNCTION public.ensure_single_current_performance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.sales_performance
    SET is_current = false
    WHERE user_id = NEW.user_id
      AND period_type = NEW.period_type
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_single_current_perf ON public.sales_performance;
CREATE TRIGGER trg_single_current_perf
  BEFORE INSERT OR UPDATE ON public.sales_performance
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_current_performance();
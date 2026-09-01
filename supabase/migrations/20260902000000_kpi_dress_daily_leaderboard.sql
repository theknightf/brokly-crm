-- KPI 21 statuses, 3-tier dress code, daily leaderboard, delay, team filter, hourly, rotation
-- Tier dress code 1=Casual,2=Semi-Formal,3=Classic/Formal (was 1-5) - clamp existing 4-5 to 3
UPDATE public.evaluations SET dress_code_rating = 3 WHERE dress_code_rating > 3;
ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_dress_code_rating_check;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_dress_code_rating_check CHECK (dress_code_rating BETWEEN 1 AND 3);
COMMENT ON COLUMN public.evaluations.dress_code_rating IS '1=Casual/low, 2=Semi-Formal/medium, 3=Classic-Formal/high - feeds lead quality rank';

-- Ensure indexes for hourly activity and delay detection
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS lead_stage TEXT;
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_delay ON public.follow_up_tasks(status, scheduled_at) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_call_logs_stage ON public.call_logs(lead_stage);
CREATE INDEX IF NOT EXISTS idx_leads_stage_assigned ON public.leads(crm_status, assigned_to);

-- Helper for KPI trend: function to count leads by stage in range
CREATE OR REPLACE FUNCTION public.lead_count_by_stage(p_stage TEXT, p_from DATE, p_to DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int FROM public.leads WHERE crm_status = p_stage AND created_at::date BETWEEN p_from AND p_to;
$$;

NOTIFY pgrst, 'reload schema';

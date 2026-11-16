
-- ── 1. Pipeline stages as data (today they are hard-coded in src/lib/ui.ts and mobile_flutter/lib/core/constants/lead_stages.dart)
CREATE TABLE IF NOT EXISTS public.lead_stages (
  key         text PRIMARY KEY,               -- exact value stored in leads.crm_status
  label_en    text NOT NULL,
  label_ar    text NOT NULL,
  sort_order  int  NOT NULL,
  color       text NOT NULL,                  -- hex, e.g. '#84CC16'
  bucket      text NOT NULL CHECK (bucket IN ('active', 'unreached', 'lost')),
  is_active   boolean NOT NULL DEFAULT true
);
ALTER TABLE public.lead_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_stages_read ON public.lead_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_stages_admin_write ON public.lead_stages FOR ALL TO authenticated
  USING ((SELECT public.is_admin_or_owner_v2())) WITH CHECK ((SELECT public.is_admin_or_owner_v2()));

-- Seeded from the current list (Arabic labels to be confirmed by the team).
INSERT INTO public.lead_stages (key, label_en, label_ar, sort_order, color, bucket) VALUES
  ('Fresh Leads',             'Fresh Leads',             'عملاء جدد',            1,  '#84CC16', 'active'),
  ('Cold Calls',              'Cold Calls',              'مكالمات باردة',        2,  '#0EA5E9', 'active'),
  ('Pending Leads',           'Pending Leads',           'معلّق',                3,  '#A3A3A3', 'active'),
  ('Following Up',            'Following Up',            'متابعة',               4,  '#22C55E', 'active'),
  ('Meeting',                 'Meeting',                 'مقابلة',               5,  '#8B5CF6', 'active'),
  ('Follow Up After Meeting', 'Follow Up After Meeting', 'متابعة بعد المقابلة',  6,  '#A855F7', 'active'),
  ('Reschedule Meeting',      'Reschedule Meeting',      'إعادة جدولة مقابلة',   7,  '#C084FC', 'active'),
  ('Interested',              'Interested',              'مهتم',                 8,  '#16A34A', 'active'),
  ('Reservation',             'Reservation',             'حجز',                  9,  '#F59E0B', 'active'),
  ('Done Deal',               'Done Deal',               'صفقة تمت',             10, '#EAB308', 'active'),
  ('Data Rotation',           'Data Rotation',           'تدوير بيانات',         11, '#64748B', 'active'),
  ('No Answer',               'No Answer',               'مردّش',                12, '#9CA3AF', 'unreached'),
  ('No Answer At All',        'No Answer At All',        'مردّش خالص',           13, '#6B7280', 'unreached'),
  ('Not Interested',          'Not Interested',          'مش مهتم',              14, '#F87171', 'lost'),
  ('Low Budget',              'Low Budget',              'ميزانية قليلة',        15, '#FB923C', 'lost'),
  ('Wrong Number',            'Wrong Number',            'رقم غلط',              16, '#EF4444', 'lost'),
  ('Closed Number',           'Closed Number',           'رقم مقفول',            17, '#DC2626', 'lost'),
  ('Cancellation',            'Cancellation',            'إلغاء',                18, '#B91C1C', 'lost'),
  ('Duplicate Leads',         'Duplicate Leads',         'مكرر',                 19, '#991B1B', 'lost')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Per-agent daily call target (falls back to the existing kpi_targets 'daily_calls' row, today 120)
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS daily_call_target int CHECK (daily_call_target IS NULL OR daily_call_target > 0);

-- Target + calls made today (Cairo day) for the caller. One round trip for the header.
CREATE OR REPLACE FUNCTION public.my_call_progress()
RETURNS TABLE (target int, calls_today int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
           (SELECT daily_call_target FROM public.user_profiles WHERE id = auth.uid()),
           (SELECT target_value::int FROM public.kpi_targets
             WHERE metric = 'daily_calls' AND period_type = 'day' AND is_active AND target_role IN ('all', 'agent')
             ORDER BY (target_role = 'agent') DESC LIMIT 1),
           60) AS target,
         (SELECT count(*)::int FROM public.call_logs c
           WHERE c.user_id = auth.uid() AND lower(c.channel) = 'call'
             AND c.created_at >= ((now() AT TIME ZONE 'Africa/Cairo')::date::timestamp AT TIME ZONE 'Africa/Cairo')) AS calls_today;
$$;
GRANT EXECUTE ON FUNCTION public.my_call_progress() TO authenticated;

-- ── 3. Stage cards: every stage with the caller's lead count and "needs action today", in ONE query.
-- SECURITY INVOKER → leads RLS applies: agents count their own leads, team leaders their team, admins everyone.
CREATE OR REPLACE FUNCTION public.my_stage_counts()
RETURNS TABLE (key text, label_en text, label_ar text, sort_order int, color text, bucket text, total bigint, needs_action bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Africa/Cairo')::date AS d),
  l AS (
    SELECT COALESCE(NULLIF(x.crm_status, ''), 'Fresh Leads') AS stage,
           (x.follow_up_due <= (SELECT d FROM today) OR x.last_action_at IS NULL) AS needs_action
    FROM public.leads x
  )
  SELECT s.key, s.label_en, s.label_ar, s.sort_order, s.color, s.bucket,
         count(l.stage), count(l.stage) FILTER (WHERE l.needs_action)
  FROM public.lead_stages s
  LEFT JOIN l ON l.stage = s.key
  WHERE s.is_active
  GROUP BY s.key, s.label_en, s.label_ar, s.sort_order, s.color, s.bucket
  ORDER BY s.sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.my_stage_counts() TO authenticated;

-- ── 4. Calling queue order, computed in SQL (new uncontacted → due today/overdue → rest), RLS-scoped.
CREATE OR REPLACE FUNCTION public.my_call_queue(p_stage text DEFAULT NULL, p_search text DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS SETOF public.leads
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT x.*
  FROM public.leads x
  WHERE (p_stage IS NULL OR COALESCE(NULLIF(x.crm_status, ''), 'Fresh Leads') = p_stage)
    AND (p_search IS NULL OR btrim(p_search) = '' OR x.name ILIKE '%' || btrim(p_search) || '%')
    -- Closed stages are skipped in the general queue, but shown when that stage is picked explicitly.
    AND (p_stage IS NOT NULL OR COALESCE(x.crm_status, '') NOT IN ('Done Deal', 'Not Interested', 'Wrong Number', 'Closed Number',
                                           'Cancellation', 'Duplicate Leads', 'Low Budget'))
  ORDER BY
    CASE WHEN x.last_action_at IS NULL THEN 0
         WHEN x.follow_up_due <= (now() AT TIME ZONE 'Africa/Cairo')::date THEN 1
         ELSE 2 END,
    x.follow_up_due NULLS LAST,
    x.assigned_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
$$;
GRANT EXECUTE ON FUNCTION public.my_call_queue(text, text, int) TO authenticated;

-- ── 5. RLS: no table permissions changed. Agents use projects/units/teams/kpi_targets etc. on the web app too,
-- so the 2-tab limit for agents is enforced in the mobile router (role guard), and lead/call data stays scoped by
-- the existing leads / call_logs / follow_ups RLS.

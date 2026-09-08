-- Normalized KPI counts: case-insensitive, trim, synonym-aware, RLS-respecting
-- Fixes ALL LEADS=100/NOT INTERESTED=10/others 0 where enum casing/whitespace drifted
CREATE OR REPLACE FUNCTION public.get_lead_status_counts()
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH normalized AS (
    SELECT
      CASE
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('not interested','not_interested','not-interested','lost') THEN 'Not Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('duplicate leads','duplicate') THEN 'Duplicate Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('fresh leads','fresh','new fresh','new') THEN 'Fresh Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cold calls','cold','new cold') THEN 'Cold Calls'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('pending leads','pending') THEN 'Pending Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('following up','follow up','followup') THEN 'Following Up'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('meeting','site visit scheduled') THEN 'Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cancellation','cancel','cancelled') THEN 'Cancellation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('done deal','won','closed won','reservation') THEN 'Done Deal'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('interested','qualified') THEN 'Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('wrong number','wrong_number') THEN 'Wrong Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('data rotation','rotation') THEN 'Data Rotation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('closed number','closed_number') THEN 'Closed Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer','no_answer') THEN 'No Answer'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer at all','no_answer_at_all') THEN 'No Answer At All'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('low budget','low_budget') THEN 'Low Budget'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reschedule meeting','reschedule') THEN 'Reschedule Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reservation','reserved') THEN 'Reservation'
        ELSE trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, 'Fresh Leads'))
      END AS canon
    FROM public.leads
  )
  SELECT canon AS status, COUNT(*)::BIGINT FROM normalized
  GROUP BY canon ORDER BY 2 DESC;
$$;
NOTIFY pgrst, 'reload schema';

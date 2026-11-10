-- Backfill: existing duplicates (same normalized phone). One transaction; reversible from the backup table.
-- Approved rule for existing data: in every group the copy already in the 'Duplicate Leads' stage is the
-- duplicate, the copy that is being worked stays the original (this keeps agents' work: in 25 groups the
-- earliest copy was the one already moved to 'Duplicate Leads'). No stage, assignment or follow-up changes;
-- only the duplicate flags are corrected. Nothing is deleted or merged.
--
-- Undo:
--   UPDATE public.leads l SET is_duplicate = b.is_duplicate, duplicate_of_lead_id = b.duplicate_of_lead_id,
--          duplicate_released_to = b.duplicate_released_to
--   FROM public.backup_duplicates_20261110 b WHERE b.id = l.id;

CREATE TABLE IF NOT EXISTS public.backup_duplicates_20261110 AS
SELECT id, phone_normalized, crm_status, lead_status, assigned_to, created_by, follow_up_due,
       is_duplicate, duplicate_of_lead_id, duplicate_released_to, now() AS backed_up_at
FROM public.leads
WHERE phone_normalized IN (
  SELECT phone_normalized FROM public.leads
  WHERE char_length(COALESCE(phone_normalized, '')) >= 8
  GROUP BY phone_normalized HAVING count(*) > 1
);
ALTER TABLE public.backup_duplicates_20261110 ENABLE ROW LEVEL SECURITY; -- no policies: service role only

-- Bookkeeping triggers off so flag fixes do not log "Lead Updated" or move anyone's "last action".
ALTER TABLE public.leads DISABLE TRIGGER trg_log_lead;
ALTER TABLE public.leads DISABLE TRIGGER trg_lead_action_on_lead;

-- The worked copy is the original.
UPDATE public.leads l
   SET is_duplicate = false, duplicate_of_lead_id = NULL, duplicate_released_to = NULL
  FROM public.backup_duplicates_20261110 b
 WHERE b.id = l.id AND b.crm_status IS DISTINCT FROM 'Duplicate Leads';

-- The copy in the Duplicate stage is the duplicate of it.
UPDATE public.leads l
   SET is_duplicate = true, duplicate_of_lead_id = o.id, duplicate_released_to = NULL
  FROM public.backup_duplicates_20261110 b
  JOIN public.backup_duplicates_20261110 o
    ON o.phone_normalized = b.phone_normalized AND o.id <> b.id
   AND o.crm_status IS DISTINCT FROM 'Duplicate Leads'
 WHERE b.id = l.id AND b.crm_status = 'Duplicate Leads';

ALTER TABLE public.leads ENABLE TRIGGER trg_log_lead;
ALTER TABLE public.leads ENABLE TRIGGER trg_lead_action_on_lead;

-- Safety: every group must now have exactly one flagged copy, and every Duplicate-stage copy is flagged.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT phone_normalized FROM public.leads
    WHERE phone_normalized IN (SELECT phone_normalized FROM public.backup_duplicates_20261110)
    GROUP BY phone_normalized HAVING count(*) FILTER (WHERE is_duplicate) <> 1
  ) x;
  IF bad > 0 THEN RAISE EXCEPTION 'backfill check failed: % groups without exactly one duplicate', bad; END IF;
  SELECT count(*) INTO bad FROM public.leads WHERE crm_status = 'Duplicate Leads' AND NOT is_duplicate;
  IF bad > 0 THEN RAISE EXCEPTION 'backfill check failed: % Duplicate-stage leads not flagged', bad; END IF;
END $$;

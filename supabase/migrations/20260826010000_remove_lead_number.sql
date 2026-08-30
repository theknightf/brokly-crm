-- Remove the user-facing lead number feature (UI + database).
-- Drops the auto-assigned LEAD-XXXXXX column, its trigger + function and the
-- backing sequence. Applied to the live project via the Management API.
DROP TRIGGER IF EXISTS trg_leads_assign_lead_number ON public.leads;
DROP FUNCTION IF EXISTS public.assign_lead_number();
DROP INDEX IF EXISTS idx_leads_lead_number;
ALTER TABLE public.leads DROP COLUMN IF EXISTS lead_number;
DROP SEQUENCE IF EXISTS public.leads_lead_number_seq;
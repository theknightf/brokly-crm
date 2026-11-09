-- Applied to the DB. Removes duplicate/prefix-redundant indexes (less write cost on every lead/call update)
-- and adds a trigram index so "crm_status ilike" counts from older app builds can use an index.
DROP INDEX IF EXISTS public.idx_call_logs_created;
DROP INDEX IF EXISTS public.idx_call_logs_user_time;
DROP INDEX IF EXISTS public.idx_leads_status_created_at;
DROP INDEX IF EXISTS public.idx_leads_duplicate_of_lead_id;
DROP INDEX IF EXISTS public.idx_leads_created_by;
DROP INDEX IF EXISTS public.idx_leads_assigned_to;
CREATE INDEX IF NOT EXISTS idx_leads_crm_status_trgm ON public.leads USING gin (crm_status gin_trgm_ops);

-- Not applied automatically. Each pair below is byte-identical (Supabase advisor "duplicate_index");
-- keeping one of each halves the write cost on call_logs and leads. Safe to run once.
DROP INDEX IF EXISTS public.idx_call_logs_created;
DROP INDEX IF EXISTS public.idx_call_logs_user_time;
DROP INDEX IF EXISTS public.idx_leads_status_created_at;
DROP INDEX IF EXISTS public.idx_leads_duplicate_of_lead_id;

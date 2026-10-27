-- ============================================================
-- Brokly CRM - Duplicates stay visible and in their normal stage
-- Migration: 20261027150000_stop_duplicate_status_rewrite.sql
-- ============================================================
-- 20261012000000_allow_duplicate_leads_routing.sql installed a BEFORE INSERT
-- trigger that rewrote a duplicate's crm_status to 'Duplicate Leads', set
-- lead_status to 'Lost' and appended a "[Pending Review / Duplicate ...]" note.
-- Duplicates must now be inserted like any other lead, so that trigger is
-- dropped. Marking (is_duplicate / duplicate_of_lead_id) is done by
-- trg_leads_flag_duplicate (20261027000000). The AFTER INSERT audit trigger
-- (trg_route_duplicate_lead_after_insert) is kept: it only writes the admin
-- Duplicate Center / activity_log rows and never changes the lead.
-- ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_detect_duplicate_lead_before_insert ON public.leads;
DROP FUNCTION IF EXISTS public.detect_duplicate_lead_before_insert();

-- ============================================================
-- Brokly CRM - Grant privileges on migration-created tables
-- Migration: 20260811120000_grant_rls_tables_authenticated.sql
--
-- Tables created via the SQL editor run as `postgres`, which does NOT
-- auto-grant any privileges to the `authenticated` role used by
-- PostgREST. RLS policies alone are not enough — without table grants,
-- every app query fails with "permission denied for table ...", which
-- surfaces as empty admin screens, silent zero-valued productivity
-- dashboards and misleading success toasts on the agent side.
--
-- Newer migrations already included explicit GRANT statements
-- (expenses, site_visit_events, audit_log, units, unit_files). This
-- migration back-fills the same grants for every RLS-protected table
-- created by the earlier migrations. Idempotent and safe to re-run.
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_daily_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_performance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visits TO authenticated;

-- Sequences used by serial/identity columns inside the granted tables.
GRANT USAGE, SELECT ON SEQUENCE public.user_activity_log_id_seq TO authenticated;
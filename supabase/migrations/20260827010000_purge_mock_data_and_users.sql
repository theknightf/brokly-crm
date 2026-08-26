-- 20260827010000_purge_mock_data_and_users.sql
-- !! DESTRUCTIVE, RUN ONCE BEFORE GOING LIVE !!
--
-- 1) Removes every seeded / demo row: leads, follow-ups, team members,
--    call logs, site visits, attendance, leave, expenses, sales performance,
--    activity history, the seeded Al-Minya projects/developers/areas.
-- 2) Deletes EVERY user account (auth.users + user_profiles and everything
--    that cascades from them) except OWNER accounts.
--
-- All user-profile foreign keys in this schema are ON DELETE CASCADE or
-- SET NULL, so deleting the auth.users rows cleanly removes sessions,
-- attendance, payroll entries, task assignments, team memberships, etc.

BEGIN;

-- ─── 1. Demo business data ───────────────────────────────────────────────────
DELETE FROM public.lead_recommended_units;
DELETE FROM public.leads;              -- cascades lead_comments, duplicate_lead_attempts
DELETE FROM public.follow_ups;
DELETE FROM public.team_members;
DELETE FROM public.call_logs;
DELETE FROM public.site_visit_events;
DELETE FROM public.site_visits;
DELETE FROM public.attendance;
DELETE FROM public.leave_requests;
DELETE FROM public.expenses;
DELETE FROM public.sales_performance;
DELETE FROM public.activity_log;
DELETE FROM public.audit_log;
DELETE FROM public.lead_rotation_log;

-- Seeded Al-Minya projects + developers (units under them cascade).
DELETE FROM public.projects WHERE name IN (
  'Aton Compound – Kornish El-Nil',
  'Tuna el-Gebel Resort',
  'Al-Minya Garden Residences',
  'Mallawi Heights',
  'Samalut Villas',
  'Bani Mazar Commercial Hub'
);
DELETE FROM public.developers WHERE name IN (
  'Aton Real Estate',
  'Minya for Development',
  'El-Minya Garden'
);

-- Seeded Minya areas.
DELETE FROM public.admin_settings WHERE category = 'areas' AND name IN (
  'Minya City Center','Kornish El-Nil Minya','Abu Fana','Tuna el-Gebel','Mallawi',
  'Samalut','Bani Mazar','Maghagha','Matay','Deir Mawas'
);

-- ─── 2. All users except owners ──────────────────────────────────────────────
-- Cascades to: user_profiles → sessions, activity tracking, attendance,
-- payroll entries, task assignments/completions, team memberships,
-- team_leader_ratings, push tokens (where present), etc.
DELETE FROM auth.users
WHERE id IN (SELECT id FROM public.user_profiles WHERE role <> 'owner');

COMMIT;

NOTIFY pgrst, 'reload schema';

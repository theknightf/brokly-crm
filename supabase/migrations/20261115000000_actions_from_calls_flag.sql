-- Per-person rule: for some people (e.g. call-only telesales) "actions" in the reports = calls, not notes.
-- Applied to the live project on 2026-11-15; period_leaderboard's final SELECT now uses:
--   CASE WHEN u.actions_from_calls THEN calls ELSE notes END AS total_actions
-- (daily_leaderboard and team_overview read period_leaderboard, so they follow automatically.)
alter table public.user_profiles add column if not exists actions_from_calls boolean not null default false;
comment on column public.user_profiles.actions_from_calls is 'When true, total_actions in the leaderboard/reports counts this person''s calls instead of written notes.';
-- Turned on for Naglaa:
-- update public.user_profiles set actions_from_calls = true where id = 'd1f06c99-f33a-47f9-948c-12b1ef634689';

-- Applied to the DB. activity_log was the busiest table in Realtime (a row for nearly every action), and every
-- open phone/tab paid one security check per row. Nothing needs it live:
--  * the Flutter listener only reacts to 'Lead Assigned' rows whose user_id (the person who assigned) is the
--    current user, which is not the assignee; assignment alerts already come from the leads UPDATE listener;
--  * the web bell and the productivity dashboard poll every 30s.
-- To undo: ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_log;

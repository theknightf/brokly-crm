-- Add the Team Leader role used by team visibility and management rules.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'team_leader';

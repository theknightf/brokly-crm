-- Team management that cannot end up half-done.
--
-- The Teams page used to do 4-6 separate writes from the browser (memberships, the member's profile.team_id,
-- teams.leader_id, other teams' leader flags) and ignored most failures, so one dropped request left people in a
-- team on one table and not on another (the leader dashboard, lead scoping and the Teams page then disagreed).
-- Now: (1) a trigger keeps profile.team_id / teams.leader_id in step with team_memberships on ANY write, and
-- (2) add / remove / set-leader / delete run as single database transactions. Admins and owners only.

CREATE OR REPLACE FUNCTION public.sync_team_membership_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.user_profiles SET team_id = NULL WHERE id = OLD.user_id AND team_id = OLD.team_id;
    UPDATE public.teams SET leader_id = NULL WHERE id = OLD.team_id AND leader_id = OLD.user_id;
    RETURN OLD;
  END IF;

  UPDATE public.user_profiles SET team_id = NEW.team_id
  WHERE id = NEW.user_id AND team_id IS DISTINCT FROM NEW.team_id;

  IF NEW.is_leader THEN
    UPDATE public.teams SET leader_id = NEW.user_id
    WHERE id = NEW.team_id AND leader_id IS DISTINCT FROM NEW.user_id;
  ELSE
    UPDATE public.teams SET leader_id = NULL WHERE id = NEW.team_id AND leader_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_membership_links ON public.team_memberships;
CREATE TRIGGER trg_sync_team_membership_links
  AFTER INSERT OR UPDATE OR DELETE ON public.team_memberships
  FOR EACH ROW EXECUTE FUNCTION public.sync_team_membership_links();

-- Add a person to a team (moving them out of any other team) and optionally make them its leader.
CREATE OR REPLACE FUNCTION public.team_add_member(p_team uuid, p_user uuid, p_is_leader boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Only admins and owners can manage teams.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team) THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user AND is_active) THEN
    RAISE EXCEPTION 'User not found or deactivated.' USING ERRCODE = 'P0002';
  END IF;

  -- A person belongs to one team.
  DELETE FROM public.team_memberships WHERE user_id = p_user AND team_id <> p_team;

  IF p_is_leader THEN
    UPDATE public.team_memberships SET is_leader = false
    WHERE team_id = p_team AND is_leader AND user_id <> p_user;
  END IF;

  INSERT INTO public.team_memberships (team_id, user_id, is_leader)
  VALUES (p_team, p_user, COALESCE(p_is_leader, false))
  ON CONFLICT (team_id, user_id) DO UPDATE SET is_leader = EXCLUDED.is_leader;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_remove_member(p_team uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Only admins and owners can manage teams.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.team_memberships WHERE team_id = p_team AND user_id = p_user;
  -- Also clears a stale profile pointer when there was no membership row to delete.
  UPDATE public.user_profiles SET team_id = NULL WHERE id = p_user AND team_id = p_team;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_set_leader(p_team uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Only admins and owners can manage teams.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_memberships WHERE team_id = p_team AND user_id = p_user) THEN
    RAISE EXCEPTION 'Add the person to the team before making them its leader.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.team_memberships SET is_leader = false WHERE team_id = p_team AND is_leader AND user_id <> p_user;
  UPDATE public.team_memberships SET is_leader = true WHERE team_id = p_team AND user_id = p_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_delete(p_team uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Only admins and owners can manage teams.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.team_memberships WHERE team_id = p_team;
  UPDATE public.user_profiles SET team_id = NULL WHERE team_id = p_team;
  DELETE FROM public.teams WHERE id = p_team;
END;
$$;

REVOKE ALL ON FUNCTION public.team_add_member(uuid, uuid, boolean), public.team_remove_member(uuid, uuid),
  public.team_set_leader(uuid, uuid), public.team_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_add_member(uuid, uuid, boolean), public.team_remove_member(uuid, uuid),
  public.team_set_leader(uuid, uuid), public.team_delete(uuid) TO authenticated;

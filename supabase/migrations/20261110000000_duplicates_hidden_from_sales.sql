-- Duplicate leads are hidden from sales.
--  * A lead is a duplicate when its normalized phone (public.normalize_phone) matches an earlier lead.
--    The database flags it on insert (and when the phone changes) and puts it in the 'Duplicate Leads' stage.
--  * Sales users never see a lead in the 'Duplicate Leads' stage, nor a flagged duplicate the owner has not
--    released. Owner/admin see everything.
--  * A duplicate is "released" when an owner/admin assigns it (changes assigned_to) while it is out of the
--    Duplicate stage; from then on only that assigned user (plus owner/admin) sees it.
-- The whole visibility rule lives in ONE function: public.lead_visible_to_sales().

-- 1. Who a released duplicate was given to.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS duplicate_released_to uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- 2. THE rule (change it here only). Owner/admin are checked separately (is_admin_or_owner_v2).
CREATE OR REPLACE FUNCTION public.lead_visible_to_sales(
  p_status text, p_is_duplicate boolean, p_assigned_to uuid, p_released_to uuid
) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_status, '') <> 'Duplicate Leads'
     AND (
       NOT COALESCE(p_is_duplicate, false)
       OR (p_released_to IS NOT NULL AND p_released_to = auth.uid() AND p_assigned_to = auth.uid())
     );
$$;

-- 3. RLS: restrictive policies are AND-ed with every existing permissive policy, so no other rule
--    (assignee, creator, team, referral, co-assignee) can expose a hidden duplicate.
DROP POLICY IF EXISTS leads_hide_duplicates_select ON public.leads;
DROP POLICY IF EXISTS leads_hide_duplicates_update ON public.leads;
DROP POLICY IF EXISTS leads_hide_duplicates_delete ON public.leads;

CREATE POLICY leads_hide_duplicates_select ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_or_owner_v2())
         OR public.lead_visible_to_sales(crm_status, is_duplicate, assigned_to, duplicate_released_to));
CREATE POLICY leads_hide_duplicates_update ON public.leads AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin_or_owner_v2())
         OR public.lead_visible_to_sales(crm_status, is_duplicate, assigned_to, duplicate_released_to))
  WITH CHECK (true);
CREATE POLICY leads_hide_duplicates_delete ON public.leads AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_admin_or_owner_v2())
         OR public.lead_visible_to_sales(crm_status, is_duplicate, assigned_to, duplicate_released_to));

-- 4. Detection (insert, and phone change). Runs AFTER the column guard (trigger names fire alphabetically).
CREATE OR REPLACE FUNCTION public.leads_flag_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_original uuid;
BEGIN
  NEW.phone_normalized := public.normalize_phone(NEW.phone);

  IF TG_OP = 'INSERT' THEN
    -- Clients never choose these values; the database decides.
    NEW.is_duplicate := false;
    NEW.duplicate_of_lead_id := NULL;
    NEW.duplicate_notified_at := NULL;
    NEW.duplicate_released_to := NULL;
    -- "Keep as a separate lead" from the Duplicate Center inserts on purpose.
    IF COALESCE(current_setting('brokly.dup_separate', true), '') = '1' THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.phone_normalized IS NOT DISTINCT FROM OLD.phone_normalized OR NEW.is_duplicate THEN
    RETURN NEW;
  END IF;

  IF char_length(NEW.phone_normalized) >= 8 THEN
    -- The original is the earliest non-duplicate lead with that phone (any lead if they are all flagged).
    SELECT id INTO v_original
    FROM public.leads
    WHERE phone_normalized = NEW.phone_normalized
      AND id <> NEW.id
      AND merged_into IS NULL
    ORDER BY is_duplicate ASC, created_at ASC, id ASC
    LIMIT 1;

    IF v_original IS NOT NULL THEN
      NEW.is_duplicate := true;
      NEW.duplicate_of_lead_id := v_original;
      NEW.duplicate_released_to := NULL;
      NEW.crm_status := 'Duplicate Leads';
      NEW.follow_up_due := NULL;
      IF TG_OP = 'UPDATE' THEN
        UPDATE public.follow_ups SET follow_up_status = 'Cancelled', updated_at = now()
         WHERE lead_id = NEW.id AND follow_up_status NOT IN ('Completed', 'Cancelled');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_flag_duplicate ON public.leads;
DROP TRIGGER IF EXISTS trg_zz_leads_flag_duplicate ON public.leads;
CREATE TRIGGER trg_zz_leads_flag_duplicate
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_flag_duplicate();

-- 5. Release: an owner/admin assigning a duplicate that is out of the Duplicate stage hands it to that user.
CREATE OR REPLACE FUNCTION public.leads_duplicate_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT NEW.is_duplicate THEN
    RETURN NEW;
  END IF;
  IF NEW.crm_status = 'Duplicate Leads' THEN
    NEW.duplicate_released_to := NULL;          -- back in the stage: hidden again
  ELSIF (auth.uid() IS NULL OR public.is_admin_or_owner_v2())
        AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    NEW.duplicate_released_to := NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_leads_dup_release ON public.leads;
CREATE TRIGGER trg_zz_leads_dup_release
  BEFORE UPDATE OF assigned_to, crm_status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_duplicate_release();

-- 6. Sales can never change the duplicate columns themselves (now including duplicate_released_to).
CREATE OR REPLACE FUNCTION public.leads_guard_duplicate_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(current_setting('brokly.dup_notify', true), '') = '1'
     OR public.is_admin_or_owner_v2() THEN
    RETURN NEW;
  END IF;
  NEW.is_duplicate := OLD.is_duplicate;
  NEW.duplicate_of_lead_id := OLD.duplicate_of_lead_id;
  NEW.duplicate_notified_at := OLD.duplicate_notified_at;
  NEW.duplicate_released_to := OLD.duplicate_released_to;
  RETURN NEW;
END;
$$;

-- 7. Nothing tells the sales user: the review record and its notification go to owner/admin only,
--    and no "duplicate" line is written to the adder's own activity log.
CREATE OR REPLACE FUNCTION public.duplicate_leads_route_flagged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('brokly.dup_separate', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_duplicate IS TRUE AND NEW.duplicate_of_lead_id IS NOT NULL THEN
    PERFORM set_config('brokly.dup_rpc', '1', true);
    INSERT INTO public.duplicate_leads
      (original_lead_id, attempted_by, attempted_data, match_type, source, duplicate_lead_id)
    VALUES
      (NEW.duplicate_of_lead_id, NEW.created_by, public.lead_to_attempt_json(NEW), 'phone', 'existing', NEW.id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (user_id, title, message, reference_link, channel)
    SELECT up.id, 'Duplicate lead added',
           'A lead that already exists was added again: ' || COALESCE(NULLIF(NEW.name, ''), NEW.phone),
           '/duplicates', 'in_app'
    FROM public.user_profiles up
    WHERE up.role::text IN ('owner', 'admin')
      AND COALESCE(up.is_active, true);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.route_duplicate_lead_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_duplicate IS TRUE AND NEW.duplicate_of_lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.duplicate_lead_attempts WHERE attempted_lead_id = NEW.id) THEN
      INSERT INTO public.duplicate_lead_attempts
        (matched_lead_id, attempted_lead_id, attempted_phone, attempted_by, status, note)
      VALUES
        (NEW.duplicate_of_lead_id, NEW.id, COALESCE(NEW.phone, NEW.email, ''),
         COALESCE(NEW.created_by, NEW.assigned_to, auth.uid()), 'flagged', 'Auto-routed to Duplicate Center on ingestion');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Clients used to call this after inserting a duplicate to ping the original lead's agent. Owner/admin are
-- notified by the trigger above now, so it does nothing (kept so older clients do not error).
CREATE OR REPLACE FUNCTION public.notify_duplicate_owners(p_lead_ids uuid[])
RETURNS TABLE(owner_id uuid, owner_name text, adder_name text, dup_count integer, sample text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::text WHERE false;
$$;

-- 8. The Duplicate Center is for owner/admin (reviewers) only, not for the original lead's agent.
DROP POLICY IF EXISTS duplicate_leads_select ON public.duplicate_leads;
DROP POLICY IF EXISTS duplicate_leads_update ON public.duplicate_leads;
CREATE POLICY duplicate_leads_select ON public.duplicate_leads FOR SELECT TO authenticated
  USING ((SELECT public.is_duplicate_reviewer()));
CREATE POLICY duplicate_leads_update ON public.duplicate_leads FOR UPDATE TO authenticated
  USING ((SELECT public.is_duplicate_reviewer()));

-- 9. Functions that read leads with elevated rights must apply the same rule.
CREATE OR REPLACE FUNCTION public.can_access_lead(target_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    public.is_admin_or_owner_v2()
    OR (
      EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = target_lead_id
          AND public.lead_visible_to_sales(l.crm_status, l.is_duplicate, l.assigned_to, l.duplicate_released_to)
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = target_lead_id
            AND (
              l.assigned_to = auth.uid()
              OR l.created_by = auth.uid()
              OR l.referred_to = auth.uid()
              OR l.referred_by = auth.uid()
              OR (l.assigned_to IS NOT NULL AND (public.is_leader_of_assignee(l.assigned_to) OR public.is_admin_of_user(l.assigned_to)))
              OR (l.created_by IS NOT NULL AND (public.is_leader_of_assignee(l.created_by) OR public.is_admin_of_user(l.created_by)))
            )
        )
        OR EXISTS (
          SELECT 1 FROM public.lead_assignees la
          WHERE la.lead_id = target_lead_id
            AND (la.user_id = auth.uid() OR public.is_leader_of_assignee(la.user_id) OR public.is_admin_of_user(la.user_id))
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_lead_kpi_counts(
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_team_members uuid[] DEFAULT NULL::uuid[],
  p_from timestamp with time zone DEFAULT NULL::timestamp with time zone
) RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN lower(trim(COALESCE(l.crm_status, l.lead_status::TEXT, ''))) IN ('not intereted','not_interested','not-interested') THEN 'Not Interested'
      ELSE COALESCE(NULLIF(trim(l.crm_status), ''), NULLIF(trim(l.lead_status::TEXT), ''), 'Fresh Leads')
    END AS status,
    COUNT(*)::BIGINT AS count
  FROM public.leads l
  WHERE
    (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
    AND (p_team_members IS NULL OR l.assigned_to = ANY(p_team_members))
    AND (p_from IS NULL OR l.created_at >= p_from)
    AND (public.is_admin_or_owner_v2()
         OR public.lead_visible_to_sales(l.crm_status, l.is_duplicate, l.assigned_to, l.duplicate_released_to))
  GROUP BY 1
  ORDER BY 2 DESC;
END;
$$;

-- active_leads ran with its owner's rights (bypassing RLS). Make it respect the caller's RLS.
ALTER VIEW public.active_leads SET (security_invoker = true);

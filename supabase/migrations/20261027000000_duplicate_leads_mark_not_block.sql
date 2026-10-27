-- ============================================================
-- Brokly CRM - Duplicate leads: MARK, never block
-- Migration: 20261027000000_duplicate_leads_mark_not_block.sql
-- ============================================================
-- * phone_normalized becomes a trigger-maintained column that uses the shared
--   normalization rule (mirrors src/lib/phone.ts `normalizePhone`).
-- * The global UNIQUE indexes (phone/email) are replaced by plain indexes so a
--   lead with an existing phone is always inserted.
-- * A BEFORE INSERT trigger (SECURITY DEFINER, so it sees ALL leads regardless
--   of the inserting user's RLS) flags the new row:
--     is_duplicate = true, duplicate_of_lead_id = oldest lead with that phone.
-- * Regular users cannot change is_duplicate / duplicate_of_lead_id /
--   duplicate_notified_at. Admin/owner and the service role can.
-- * notify_duplicate_owners() creates ONE grouped in-app notification per
--   original owner. The migration itself sends NO notifications.
-- ─────────────────────────────────────────────────────────────

-- 1. Shared normalization (IMMUTABLE). Same rule as the TS util:
--    digits only; drop 0020 prefix, or a 20 country code when >= 12 digits;
--    then drop ONE leading 0.
CREATE OR REPLACE FUNCTION public.normalize_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text := regexp_replace(COALESCE(raw, ''), '\D', '', 'g');
BEGIN
  IF d = '' THEN RETURN ''; END IF;
  IF left(d, 4) = '0020' AND length(d) > 4 THEN
    d := substr(d, 5);
  ELSIF left(d, 2) = '20' AND length(d) >= 12 THEN
    d := substr(d, 3);
  END IF;
  IF left(d, 1) = '0' THEN
    d := substr(d, 2);
  END IF;
  RETURN d;
END;
$$;

-- 2. Columns. phone_normalized was a GENERATED column (digits only): replace it
--    with a plain column maintained by trigger. Dropping it drops its unique index.
DROP INDEX IF EXISTS public.idx_leads_phone_normalized_unique;
DROP INDEX IF EXISTS public.idx_leads_email_normalized_unique;
-- The view public.active_leads (not defined in the repo) depends on this column.
-- Save its exact definition, options and grants, drop it, then rebuild it
-- below (no CASCADE, so nothing else is dropped silently).
DROP TABLE IF EXISTS pg_temp._brokly_view_bk;
CREATE TEMP TABLE _brokly_view_bk AS
SELECT c.relname::text AS name,
       pg_get_viewdef(c.oid, true) AS def,
       c.reloptions AS opts,
       c.relacl AS acl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'active_leads' AND c.relkind = 'v';

DROP VIEW IF EXISTS public.active_leads;
ALTER TABLE public.leads DROP COLUMN IF EXISTS phone_normalized;
ALTER TABLE public.leads ADD COLUMN phone_normalized text;

DO $$
DECLARE
  v record;
  g record;
BEGIN
  FOR v IN SELECT * FROM _brokly_view_bk LOOP
    EXECUTE format(
      'CREATE VIEW public.%I %s AS %s',
      v.name,
      CASE WHEN v.opts IS NULL THEN '' ELSE 'WITH (' || array_to_string(v.opts, ',') || ')' END,
      v.def
    );
    IF v.acl IS NOT NULL THEN
      FOR g IN
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END AS grantee,
               a.privilege_type
        FROM aclexplode(v.acl) a
        LEFT JOIN pg_roles r ON r.oid = a.grantee
        WHERE a.grantee = 0 OR r.rolname IS NOT NULL
      LOOP
        EXECUTE format('GRANT %s ON public.%I TO %s', g.privilege_type, v.name, g.grantee);
      END LOOP;
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS pg_temp._brokly_view_bk;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS duplicate_of_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS duplicate_notified_at timestamptz;

-- 3. Backfill phone_normalized for every lead.
UPDATE public.leads SET phone_normalized = public.normalize_phone(phone);

-- 4. One-time backfill of the duplicate flags: oldest created_at stays the
--    original; every other lead with the same number points at it.
--    duplicate_notified_at is stamped so nothing is ever notified retroactively.
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER w AS original_id,
    row_number()    OVER w AS rn
  FROM public.leads
  WHERE phone_normalized IS NOT NULL AND char_length(phone_normalized) >= 8
  WINDOW w AS (PARTITION BY phone_normalized ORDER BY created_at ASC, id ASC)
)
UPDATE public.leads l
SET is_duplicate = true,
    duplicate_of_lead_id = r.original_id,
    duplicate_notified_at = COALESCE(l.duplicate_notified_at, now())
FROM ranked r
WHERE l.id = r.id AND r.rn > 1;

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized ON public.leads(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_duplicate_of ON public.leads(duplicate_of_lead_id) WHERE duplicate_of_lead_id IS NOT NULL;

-- 5. BEFORE INSERT/UPDATE: keep phone_normalized current, and flag new duplicates.
CREATE OR REPLACE FUNCTION public.leads_flag_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original uuid;
BEGIN
  NEW.phone_normalized := public.normalize_phone(NEW.phone);

  IF TG_OP = 'INSERT' THEN
    -- Clients can never choose these values; the DB decides.
    NEW.is_duplicate := false;
    NEW.duplicate_of_lead_id := NULL;
    NEW.duplicate_notified_at := NULL;

    IF char_length(NEW.phone_normalized) >= 8 THEN
      SELECT id INTO v_original
      FROM public.leads
      WHERE phone_normalized = NEW.phone_normalized
        AND id <> NEW.id
      ORDER BY created_at ASC, id ASC
      LIMIT 1;
      IF v_original IS NOT NULL THEN
        NEW.is_duplicate := true;
        NEW.duplicate_of_lead_id := v_original;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_flag_duplicate ON public.leads;
CREATE TRIGGER trg_leads_flag_duplicate
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_flag_duplicate();

-- 6. Guard: regular users cannot change the duplicate flags from the client.
--    Silently keeps the old values (no error surfaced to the user).
--    Allowed: DB-internal sessions (no JWT), admin/owner, and notify_duplicate_owners().
CREATE OR REPLACE FUNCTION public.leads_guard_duplicate_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_guard_duplicate_columns ON public.leads;
CREATE TRIGGER trg_leads_guard_duplicate_columns
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_guard_duplicate_columns();

-- 7. Grouped notification for the ORIGINAL owner(s).
--    Called by the app right after an add/import with the new lead ids.
--    Owner of the original = assigned_to, falling back to created_by.
--    Nobody is notified about their own re-add. Idempotent (duplicate_notified_at).
CREATE OR REPLACE FUNCTION public.notify_duplicate_owners(p_lead_ids uuid[])
RETURNS TABLE(owner_id uuid, owner_name text, adder_name text, dup_count integer, sample text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF v_actor IS NULL THEN RETURN; END IF;
  SELECT COALESCE(NULLIF(full_name, ''), email, 'A user') INTO v_actor_name
  FROM public.user_profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'A user');

  PERFORM set_config('brokly.dup_notify', '1', true);

  RETURN QUERY
  WITH picked AS (
    SELECT n.id AS new_id,
           COALESCE(NULLIF(n.name, ''), n.phone) AS label,
           COALESCE(o.assigned_to, o.created_by) AS own
    FROM public.leads n
    JOIN public.leads o ON o.id = n.duplicate_of_lead_id
    WHERE n.id = ANY(p_lead_ids)
      AND n.created_by = v_actor
      AND n.is_duplicate
      AND n.duplicate_notified_at IS NULL
  ),
  stamped AS (
    UPDATE public.leads l SET duplicate_notified_at = now()
    FROM picked p WHERE l.id = p.new_id
    RETURNING l.id
  ),
  grouped AS (
    SELECT p.own,
           count(*)::int AS cnt,
           min(p.label) AS first_label
    FROM picked p
    WHERE p.own IS NOT NULL AND p.own <> v_actor
    GROUP BY p.own
  ),
  ins AS (
    INSERT INTO public.notifications (user_id, title, message, reference_link, channel)
    SELECT g.own,
           'Duplicate lead re-added',
           CASE WHEN g.cnt = 1
                THEN v_actor_name || ' tried to add a lead that already exists: ' || g.first_label
                ELSE g.cnt || ' of your leads were re-added by ' || v_actor_name
           END,
           '/leads-management',
           'in_app'
    FROM grouped g
    RETURNING user_id
  )
  SELECT g.own,
         COALESCE((SELECT up.full_name FROM public.user_profiles up WHERE up.id = g.own), ''),
         v_actor_name,
         g.cnt,
         g.first_label
  FROM grouped g;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_duplicate_owners(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_duplicate_owners(uuid[]) TO authenticated;

-- 8. Notifications: let a user read/update ONLY their own rows (select policy
--    already allows this); inserts go through the SECURITY DEFINER function above.

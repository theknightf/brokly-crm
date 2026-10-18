-- Migration: Merge duplicate leads, unique phone constraint on active leads, and accurate count source of truth
-- Date: 2026-10-17

-- 1. Add soft-delete / merged columns
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_merged_into 
  ON public.leads(merged_into) 
  WHERE merged_into IS NOT NULL;

-- 2. Add Unique partial index on active leads phone_normalized
-- Ensures no duplicate phone numbers can ever be added for non-merged active leads
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_normalized_unique_active
  ON public.leads (phone_normalized)
  WHERE merged_into IS NULL 
    AND is_duplicate IS FALSE 
    AND phone_normalized IS NOT NULL 
    AND length(phone_normalized) >= 10;

-- 3. Create active_leads view as single source of truth
CREATE OR REPLACE VIEW public.active_leads AS
SELECT *
FROM public.leads
WHERE merged_into IS NULL
  AND is_duplicate IS FALSE;

GRANT SELECT ON public.active_leads TO authenticated, anon;

-- 4. Single transaction Merge Duplicate Leads RPC
CREATE OR REPLACE FUNCTION public.merge_duplicate_leads(
  p_dry_run boolean DEFAULT true,
  p_target_phone text DEFAULT NULL,
  p_limit integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group RECORD;
  v_primary_lead RECORD;
  v_dup RECORD;
  v_total_groups integer := 0;
  v_total_merged integer := 0;
  v_total_fields_filled integer := 0;
  v_dry_run_details jsonb := '[]'::jsonb;
  v_group_details jsonb;
  v_merged_ids uuid[];
  v_merged_names text[];
  v_filled_keys text[];
  v_actor uuid;
  v_upd_email text;
  v_upd_property_type text;
  v_upd_source text;
  v_upd_agent text;
  v_upd_agent_initials text;
  v_upd_assigned_to uuid;
  v_upd_location text;
  v_upd_developer text;
  v_upd_project text;
  v_upd_unit text;
  v_upd_interest_level text;
  v_upd_lead_rating text;
  v_upd_team text;
  v_upd_cs_agent text;
  v_upd_notes text;
  v_upd_budget_min numeric;
  v_upd_budget_max numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin_or_owner_v2() THEN
    RAISE EXCEPTION 'Permission denied: Merging leads is restricted to administrators and owners.';
  END IF;

  v_actor := COALESCE(auth.uid(), (SELECT id FROM public.user_profiles WHERE role IN ('owner', 'admin') ORDER BY created_at ASC LIMIT 1));

  FOR v_group IN
    WITH normalized_leads AS (
      SELECT 
        id,
        name,
        phone,
        email,
        crm_status,
        lead_status,
        is_duplicate,
        merged_into,
        created_at,
        CASE
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^0020(1[0125]\d{8})$' 
            THEN regexp_replace(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '^0020', '0')
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^20(1[0125]\d{8})$' 
            THEN regexp_replace(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '^20', '0')
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^(1[0125]\d{8})$' 
            THEN '0' || regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^(01[0125]\d{8})$' 
            THEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
          ELSE regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
        END AS phone_norm
      FROM public.leads
      WHERE COALESCE(phone, '') <> ''
        AND merged_into IS NULL
    )
    SELECT 
      phone_norm,
      COUNT(*) AS cnt
    FROM normalized_leads
    WHERE length(phone_norm) >= 10
      AND (p_target_phone IS NULL OR phone_norm = p_target_phone)
    GROUP BY phone_norm
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, phone_norm ASC
    LIMIT p_limit
  LOOP
    v_total_groups := v_total_groups + 1;
    v_merged_ids := ARRAY[]::uuid[];
    v_merged_names := ARRAY[]::text[];
    v_filled_keys := ARRAY[]::text[];

    SELECT * INTO v_primary_lead
    FROM public.leads
    WHERE (
      CASE
        WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^0020(1[0125]\d{8})$' 
          THEN regexp_replace(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '^0020', '0')
        WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^20(1[0125]\d{8})$' 
          THEN regexp_replace(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '^20', '0')
        WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^(1[0125]\d{8})$' 
          THEN '0' || regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
        WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^(01[0125]\d{8})$' 
          THEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
        ELSE regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
      END
    ) = v_group.phone_norm
      AND merged_into IS NULL
    ORDER BY 
      (CASE WHEN is_duplicate IS FALSE AND crm_status <> 'Duplicate Leads' THEN 0 ELSE 1 END) ASC,
      created_at ASC
    LIMIT 1;

    IF v_primary_lead.id IS NULL THEN
      CONTINUE;
    END IF;

    v_upd_email := v_primary_lead.email;
    v_upd_property_type := v_primary_lead.property_type;
    v_upd_source := v_primary_lead.source;
    v_upd_agent := v_primary_lead.agent;
    v_upd_agent_initials := v_primary_lead.agent_initials;
    v_upd_assigned_to := v_primary_lead.assigned_to;
    v_upd_location := v_primary_lead.location;
    v_upd_developer := v_primary_lead.developer;
    v_upd_project := v_primary_lead.project;
    v_upd_unit := v_primary_lead.unit;
    v_upd_interest_level := v_primary_lead.interest_level;
    v_upd_lead_rating := v_primary_lead.lead_rating;
    v_upd_team := v_primary_lead.team;
    v_upd_cs_agent := v_primary_lead.cs_agent;
    v_upd_notes := COALESCE(v_primary_lead.notes, '');
    v_upd_budget_min := v_primary_lead.budget_min;
    v_upd_budget_max := v_primary_lead.budget_max;

    FOR v_dup IN
      SELECT *
      FROM public.leads
      WHERE (
        CASE
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^0020(1[0125]\d{8})$' 
            THEN regexp_replace(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '^0020', '0')
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^20(1[0125]\d{8})$' 
            THEN regexp_replace(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '^20', '0')
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^(1[0125]\d{8})$' 
            THEN '0' || regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
          WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') ~ '^(01[0125]\d{8})$' 
            THEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
          ELSE regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
        END
      ) = v_group.phone_norm
        AND id <> v_primary_lead.id
        AND merged_into IS NULL
      ORDER BY created_at ASC
    LOOP
      v_total_merged := v_total_merged + 1;
      v_merged_ids := array_append(v_merged_ids, v_dup.id);
      v_merged_names := array_append(v_merged_names, v_dup.name);

      IF (v_upd_email IS NULL OR v_upd_email = '') AND v_dup.email IS NOT NULL AND v_dup.email <> '' THEN
        v_upd_email := v_dup.email;
        v_filled_keys := array_append(v_filled_keys, 'email');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_property_type IS NULL OR v_upd_property_type = '') AND v_dup.property_type IS NOT NULL AND v_dup.property_type <> '' THEN
        v_upd_property_type := v_dup.property_type;
        v_filled_keys := array_append(v_filled_keys, 'property_type');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_source IS NULL OR v_upd_source = '') AND v_dup.source IS NOT NULL AND v_dup.source <> '' THEN
        v_upd_source := v_dup.source;
        v_filled_keys := array_append(v_filled_keys, 'source');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_project IS NULL OR v_upd_project = '') AND v_dup.project IS NOT NULL AND v_dup.project <> '' THEN
        v_upd_project := v_dup.project;
        v_filled_keys := array_append(v_filled_keys, 'project');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_location IS NULL OR v_upd_location = '') AND v_dup.location IS NOT NULL AND v_dup.location <> '' THEN
        v_upd_location := v_dup.location;
        v_filled_keys := array_append(v_filled_keys, 'location');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_developer IS NULL OR v_upd_developer = '') AND v_dup.developer IS NOT NULL AND v_dup.developer <> '' THEN
        v_upd_developer := v_dup.developer;
        v_filled_keys := array_append(v_filled_keys, 'developer');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_unit IS NULL OR v_upd_unit = '') AND v_dup.unit IS NOT NULL AND v_dup.unit <> '' THEN
        v_upd_unit := v_dup.unit;
        v_filled_keys := array_append(v_filled_keys, 'unit');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF v_upd_assigned_to IS NULL AND v_dup.assigned_to IS NOT NULL THEN
        v_upd_assigned_to := v_dup.assigned_to;
        v_upd_agent := v_dup.agent;
        v_upd_agent_initials := v_dup.agent_initials;
        v_filled_keys := array_append(v_filled_keys, 'assigned_to');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF (v_upd_budget_max IS NULL OR v_upd_budget_max = 0) AND v_dup.budget_max > 0 THEN
        v_upd_budget_max := v_dup.budget_max;
        v_upd_budget_min := v_dup.budget_min;
        v_filled_keys := array_append(v_filled_keys, 'budget');
        v_total_fields_filled := v_total_fields_filled + 1;
      END IF;

      IF v_dup.notes IS NOT NULL AND trim(v_dup.notes) <> '' THEN
        IF v_dup.notes NOT LIKE '%[Pending Review / Duplicate%' AND position(trim(v_dup.notes) in v_upd_notes) = 0 THEN
          v_upd_notes := trim(both E'\n ' FROM v_upd_notes || E'\n[Merged Note]: ' || trim(v_dup.notes));
          v_filled_keys := array_append(v_filled_keys, 'notes');
          v_total_fields_filled := v_total_fields_filled + 1;
        END IF;
      END IF;

      IF NOT p_dry_run THEN
        UPDATE public.call_logs 
        SET lead_id = v_primary_lead.id,
            entity_id = v_primary_lead.id::text
        WHERE lead_id = v_dup.id OR (entity_type = 'lead' AND entity_id = v_dup.id::text);
        
        UPDATE public.lead_comments 
        SET lead_id = v_primary_lead.id 
        WHERE lead_id = v_dup.id;

        UPDATE public.follow_ups 
        SET lead_id = v_primary_lead.id 
        WHERE lead_id = v_dup.id;

        UPDATE public.site_visits 
        SET lead_id = v_primary_lead.id 
        WHERE lead_id = v_dup.id;

        UPDATE public.activity_log 
        SET entity_id = v_primary_lead.id::text 
        WHERE entity_type = 'lead' AND entity_id = v_dup.id::text;

        UPDATE public.duplicate_lead_attempts 
        SET matched_lead_id = v_primary_lead.id 
        WHERE matched_lead_id = v_dup.id;

        UPDATE public.duplicate_lead_attempts 
        SET attempted_lead_id = v_primary_lead.id 
        WHERE attempted_lead_id = v_dup.id;

        UPDATE public.leads
        SET 
          merged_into = v_primary_lead.id,
          merged_at = now(),
          is_duplicate = true,
          duplicate_of_lead_id = v_primary_lead.id,
          crm_status = 'Duplicate Leads',
          lead_status = 'Lost',
          notes = trim(both E'\n ' FROM COALESCE(notes, '') || E'\n[MERGED into #' || left(v_primary_lead.id::text, 8) || ' (' || COALESCE(v_primary_lead.name, '') || ') at ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']')
        WHERE id = v_dup.id;

        IF v_actor IS NOT NULL THEN
          INSERT INTO public.activity_log (
            user_id,
            action_type,
            entity_type,
            entity_id,
            detail
          ) VALUES (
            v_actor,
            'Lead Merged',
            'lead',
            v_primary_lead.id::text,
            'Merged duplicate lead "' || COALESCE(v_dup.name, 'Unnamed') || '" (#' || left(v_dup.id::text, 8) || ') into primary lead #' || left(v_primary_lead.id::text, 8) || '.'
          );
        END IF;
      END IF;
    END LOOP;

    IF NOT p_dry_run THEN
      UPDATE public.leads
      SET 
        email = v_upd_email,
        property_type = v_upd_property_type,
        source = v_upd_source,
        agent = v_upd_agent,
        agent_initials = v_upd_agent_initials,
        assigned_to = v_upd_assigned_to,
        location = v_upd_location,
        developer = v_upd_developer,
        project = v_upd_project,
        unit = v_upd_unit,
        interest_level = v_upd_interest_level,
        lead_rating = v_upd_lead_rating,
        team = v_upd_team,
        cs_agent = v_upd_cs_agent,
        notes = v_upd_notes,
        budget_min = v_upd_budget_min,
        budget_max = v_upd_budget_max,
        is_duplicate = false,
        updated_at = now()
      WHERE id = v_primary_lead.id;
    END IF;

    v_group_details := jsonb_build_object(
      'phone_normalized', v_group.phone_norm,
      'primary_id', v_primary_lead.id,
      'primary_name', v_primary_lead.name,
      'primary_status', v_primary_lead.crm_status,
      'merged_ids', v_merged_ids,
      'merged_names', v_merged_names,
      'filled_fields', array_to_json(v_filled_keys)
    );

    IF jsonb_array_length(v_dry_run_details) < 15 THEN
      v_dry_run_details := v_dry_run_details || jsonb_build_array(v_group_details);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'groups_count', v_total_groups,
    'duplicates_merged_count', v_total_merged,
    'fields_filled_count', v_total_fields_filled,
    'sample_details', v_dry_run_details
  );
END;
$$;

-- 5. Updated get_lead_status_counts using active_leads view with per-user scoping
CREATE OR REPLACE FUNCTION public.get_lead_status_counts(p_assigned_to uuid DEFAULT NULL)
RETURNS TABLE (status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_filtered AS (
    SELECT crm_status, lead_status
    FROM public.active_leads
    WHERE (
      CASE
        WHEN auth.uid() IS NOT NULL AND NOT is_admin_or_owner_v2() THEN assigned_to = auth.uid()
        WHEN p_assigned_to IS NOT NULL THEN assigned_to = p_assigned_to
        ELSE true
      END
    )
  ),
  normalized AS (
    SELECT
      CASE
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('not interested','not_interested','not-interested','lost','not intereted') THEN 'Not Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('duplicate leads','duplicate') THEN 'Duplicate Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('fresh leads','fresh','new fresh','new') THEN 'Fresh Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cold calls','cold','new cold') THEN 'Cold Calls'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('pending leads','pending') THEN 'Pending Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('following up','follow up','followup') THEN 'Following Up'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('meeting','site visit scheduled') THEN 'Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cancellation','cancel','cancelled') THEN 'Cancellation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('done deal','won','closed won') THEN 'Done Deal'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('interested','qualified') THEN 'Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('wrong number','wrong_number') THEN 'Wrong Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('data rotation','rotation') THEN 'Data Rotation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('closed number','closed_number') THEN 'Closed Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer','no_answer') THEN 'No Answer'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer at all','no_answer_at_all') THEN 'No Answer At All'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('low budget','low_budget') THEN 'Low Budget'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reschedule meeting','reschedule') THEN 'Reschedule Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reservation','reserved') THEN 'Reservation'
        ELSE trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, 'Fresh Leads'))
      END AS canon
    FROM user_filtered
  )
  SELECT canon AS status, COUNT(*)::BIGINT FROM normalized
  GROUP BY canon ORDER BY 2 DESC;
$$;

-- 6. Updated get_lead_kpi_counts using active_leads view
CREATE OR REPLACE FUNCTION public.get_lead_kpi_counts(
  p_assigned_to uuid DEFAULT NULL,
  p_team_members uuid[] DEFAULT NULL,
  p_from timestamp with time zone DEFAULT NULL,
  p_to timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT crm_status, lead_status
    FROM public.active_leads l
    WHERE
      (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
      AND (p_team_members IS NULL OR l.assigned_to = ANY(p_team_members))
      AND (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to IS NULL OR l.created_at <= p_to)
  ),
  normalized AS (
    SELECT
      CASE
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('not interested','not_interested','not-interested','lost') THEN 'Not Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('duplicate leads','duplicate') THEN 'Duplicate Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('fresh leads','fresh','new fresh','new') THEN 'Fresh Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cold calls','cold','new cold') THEN 'Cold Calls'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('pending leads','pending') THEN 'Pending Leads'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('following up','follow up','followup') THEN 'Following Up'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('meeting','site visit scheduled') THEN 'Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('cancellation','cancel','cancelled') THEN 'Cancellation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('done deal','won','closed won') THEN 'Done Deal'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('interested','qualified') THEN 'Interested'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('wrong number','wrong_number') THEN 'Wrong Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('data rotation','rotation') THEN 'Data Rotation'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('closed number','closed_number') THEN 'Closed Number'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer','no_answer') THEN 'No Answer'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('no answer at all','no_answer_at_all') THEN 'No Answer At All'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('low budget','low_budget') THEN 'Low Budget'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reschedule meeting','reschedule') THEN 'Reschedule Meeting'
        WHEN lower(trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, ''))) IN ('reservation','reserved') THEN 'Reservation'
        ELSE trim(BOTH FROM COALESCE(crm_status, lead_status::TEXT, 'Fresh Leads'))
      END AS canon
    FROM filtered
  )
  SELECT canon AS status, COUNT(*)::BIGINT FROM normalized
  GROUP BY canon ORDER BY 2 DESC;
$$;

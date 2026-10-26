/**
 * Canonical PostgREST select strings for `public.leads`.
 *
 * `leads` has SIX foreign keys to `user_profiles` in the live schema:
 *   - leads_admin_id_fkey        (admin_id)
 *   - leads_assigned_to_fkey     (assigned_to)
 *   - leads_created_by_fkey      (created_by)
 *   - leads_last_action_by_fkey  (last_action_by)
 *   - leads_referred_by_fkey     (referred_by)
 *   - leads_referred_to_fkey     (referred_to)
 *
 * Because of that, `user_profiles(...)` without an explicit FK hint is
 * ambiguous (PostgREST PGRST201), and a stale/wrong hint is rejected with
 * PGRST200 / HTTP 400. Keep every leads <-> profile embed here so the list
 * loader, realtime/log listeners, API routes and detail views cannot drift.
 */
export const LEADS_ASSIGNED_TO_FK = 'leads_assigned_to_fkey';
export const LEADS_CREATED_BY_FK = 'leads_created_by_fkey';

export const LEADS_ASSIGNED_PROFILE_EMBED =
  `assigned_to_profile:user_profiles!${LEADS_ASSIGNED_TO_FK}`;
export const LEADS_CREATED_PROFILE_EMBED =
  `created_by_profile:user_profiles!${LEADS_CREATED_BY_FK}`;

/** Main leads list / page loader / realtime refresh select. */
export const LEADS_LIST_SELECT =
  `*, ${LEADS_ASSIGNED_PROFILE_EMBED}(id, full_name)`;

/** Lead detail drawer/profile route select. */
export const LEADS_DETAIL_SELECT =
  `*, ${LEADS_ASSIGNED_PROFILE_EMBED}(id, full_name, email), ${LEADS_CREATED_PROFILE_EMBED}(id, full_name)`;

/** Duplicate-lead lookup select (people ops). */
export const LEADS_PEOPLE_OPS_SELECT =
  `id, name, phone, created_by, created_at, ${LEADS_CREATED_PROFILE_EMBED}(full_name), lead_status, ${LEADS_ASSIGNED_PROFILE_EMBED}(full_name)`;

/** Duplicate-attempt owner lookup select. */
export const LEADS_OWNERS_SELECT =
  `name, created_by, assigned_to, ${LEADS_CREATED_PROFILE_EMBED}(full_name), ${LEADS_ASSIGNED_PROFILE_EMBED}(full_name)`;

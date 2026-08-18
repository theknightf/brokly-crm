// Roles considered able to access admin/management features.
// Matches the DB-level is_admin_or_owner() / is_admin_or_owner_v2() RLS which
// only grants admin-panel access to owners and admins. Anyone else (including
// brokers) must be promoted to admin by an owner to see the admin panel.
export const ADMIN_ROLES = ['owner', 'admin'];
export const USER_MANAGEMENT_ROLES = ['owner', 'admin'];
export const TEAM_LEAD_ROLE = 'team_leader';

export function isAdminRole(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function canManageUsers(role?: string | null): boolean {
  return !!role && USER_MANAGEMENT_ROLES.includes(role);
}

/**
 * Who may open the Teams page at all:
 *  - owners & admins see the full team,
 *  - a team leader may open it to see their own team,
 *  - regular members cannot see the team.
 */
export function canViewTeams(role?: string | null): boolean {
  return isAdminRole(role) || role === TEAM_LEAD_ROLE || role === 'Team Lead';
}

/** Owners & admins can manage (add/edit/remove) all members. Leaders view only. */
export function canManageTeams(role?: string | null): boolean {
  return isAdminRole(role);
}

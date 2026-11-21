// Roles considered able to access admin/management features.
// Matches the DB-level is_admin_or_owner() / is_admin_or_owner_v2() RLS which
// only grants admin-panel access to owners and admins. Anyone else (including
// brokers) must be promoted to admin by an owner to see the admin panel.
//
// Case-insensitive + OWNER_ADMIN-tolerant: role strings arrive in mixed case
// ('ADMIN', 'OWNER', 'OWNER_ADMIN') from legacy rows and signup metadata. A
// case-sensitive check silently demoted those users to the employee view.
export const ADMIN_ROLES = ['owner', 'admin', 'limited_admin'];
export const USER_MANAGEMENT_ROLES = ['owner', 'admin', 'limited_admin'];
export const TEAM_LEAD_ROLE = 'team_leader';

function normalizeRole(role?: string | null): string {
  return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isAdminRole(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'owner' || r === 'admin' || r === 'owner_admin' || r === 'owneradmin' || r === 'limited_admin';
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

/** limited_admin has every admin permission EXCEPT deleting leads (enforced in the database too). */
export function canDeleteLeads(role?: string | null): boolean {
  return isAdminRole(role) && normalizeRole(role) !== 'limited_admin';
}

/** IT (maintenance) role: sees the IT console and can close / reopen user accounts. No access to lead data. */
export function isItRole(role?: string | null): boolean {
  return normalizeRole(role) === 'it';
}

/** Who may open the IT console: IT staff and the owner. */
export function canUseItConsole(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'it' || r === 'owner';
}

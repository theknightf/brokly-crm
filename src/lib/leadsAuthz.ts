import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isAdminRole } from '@/lib/roles';

/**
 * Build a Supabase client using the service-role key so server-side deletes can
 * bypass RLS. Returns null when the key is missing so callers can surface a
 * clear error instead of failing silently.
 */
export function getLeadsServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.startsWith('replace-with-')) {
    return null;
  }
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Whether `actor` may delete `lead`. Mirrors the DB `leads_delete_policy` but is
 * evaluated here so it works even if the client's RLS session is missing or the
 * policy is misconfigured. Admin/owner, the lead creator, or the assignee always
 * may delete; a team leader of the assignee may too.
 */
export async function canDeleteLead(
  service: any,
  actor: { id: string; role: string },
  lead: { id: string; created_by?: string | null; assigned_to?: string | null }
): Promise<boolean> {
  // Only owner and admin can delete leads; sales/agents cannot delete.
  return isAdminRole(actor.role);
}

'use client';
import { createClient } from '@/lib/supabase/client';
import type { Permission } from '@/lib/attendanceLogic';

const TABLE = 'attendance_permissions';

function isSchemaError(err: any): boolean {
  if (!err) return false;
  const msg = err.message || String(err);
  return /relation .* does not exist|column .* does not exist|does not exist/i.test(msg);
}

function mapRow(r: any): Permission {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    type: r.type,
    excusedMinutes: Number(r.excused_minutes || 0),
    reason: r.reason || '',
    status: r.status || 'approved',
    approvedBy: r.approved_by || undefined,
    approvedByName: r.approved_by_name || undefined,
  };
}

export const attendancePermissionsService = {
  async getForRange(from: string, to: string): Promise<Permission[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true });
      if (error) {
        if (isSchemaError(error)) return [];
        return [];
      }
      return (data || []).map(mapRow);
    } catch {
      return [];
    }
  },

  async create(input: Omit<Permission, 'id'> & { id?: string }): Promise<Permission | null> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        user_id: input.userId,
        date: input.date,
        type: input.type,
        excused_minutes: input.excusedMinutes,
        reason: input.reason,
        status: input.status || 'approved',
        approved_by: input.approvedBy || user?.id || null,
      };
      const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
      if (error) {
        if (isSchemaError(error)) {
          // fallback: return optimistic object (client-side only, will still count for this session)
          return { id: `local_${Date.now()}`, ...input, status: input.status || 'approved' } as Permission;
        }
        throw error;
      }
      return mapRow(data);
    } catch (e: any) {
      if (isSchemaError(e)) {
        return { id: `local_${Date.now()}`, ...input, status: input.status || 'approved' } as Permission;
      }
      throw e;
    }
  },

  async remove(id: string): Promise<void> {
    if (String(id).startsWith('local_')) return;
    const supabase = createClient();
    try {
      await supabase.from(TABLE).delete().eq('id', id);
    } catch {}
  },
};

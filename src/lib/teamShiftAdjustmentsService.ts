'use client';
import { createClient } from '@/lib/supabase/client';
import type { TeamShiftAdjustment } from '@/lib/attendanceLogic';

const TABLE = 'team_shift_adjustments';
const SETTINGS_KEY = 'teamShiftAdjustments';

function isSchemaError(err: any): boolean {
  if (!err) return false;
  const msg = err.message || String(err);
  return /relation .* does not exist|column .* does not exist|does not exist/i.test(msg);
}

function mapRow(r: any): TeamShiftAdjustment {
  return {
    id: r.id,
    teamId: r.team_id || null,
    teamName: r.team_name || r.teamName || '',
    date: r.date || null,
    startTime: r.start_time || r.startTime,
    endTime: r.end_time || r.endTime,
    graceMinutes: Number(r.grace_minutes ?? r.graceMinutes ?? 20),
    reason: r.reason || '',
    isTemporary: r.is_temporary ?? r.isTemporary ?? !!r.date,
    createdAt: r.created_at || r.createdAt,
    createdBy: r.created_by || r.createdBy,
  };
}

// Fallback to company_settings when table not migrated
async function loadFromSettings(): Promise<TeamShiftAdjustment[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase.from('company_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    if (!data?.value) return [];
    const val = data.value as any;
    if (Array.isArray(val)) return val as TeamShiftAdjustment[];
    if (Array.isArray(val.adjustments)) return val.adjustments as TeamShiftAdjustment[];
    return [];
  } catch { return []; }
}

async function saveToSettings(adjustments: TeamShiftAdjustment[]): Promise<void> {
  const supabase = createClient();
  await supabase.from('company_settings').upsert({ key: SETTINGS_KEY, value: adjustments as any, updated_at: new Date().toISOString() });
}

export const teamShiftAdjustmentsService = {
  async getAll(): Promise<TeamShiftAdjustment[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('date', { ascending: true });
      if (error) {
        if (isSchemaError(error)) return await loadFromSettings();
        return [];
      }
      return (data || []).map(mapRow);
    } catch {
      return await loadFromSettings();
    }
  },

  async getForDate(date: string): Promise<TeamShiftAdjustment[]> {
    const all = await this.getAll();
    return all.filter(a => !a.date || a.date === date);
  },

  async create(input: Omit<TeamShiftAdjustment, 'id'>): Promise<TeamShiftAdjustment | null> {
    const supabase = createClient();
    const payload: any = {
      team_id: input.teamId || null,
      team_name: input.teamName,
      date: input.date || null,
      start_time: input.startTime,
      end_time: input.endTime,
      grace_minutes: input.graceMinutes,
      reason: input.reason || '',
      is_temporary: input.isTemporary,
    };
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) payload.created_by = user.id;
      const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
      if (error) {
        if (isSchemaError(error)) {
          // fallback to settings
          const current = await loadFromSettings();
          const newAdj: TeamShiftAdjustment = { id: `local_${Date.now()}`, ...input };
          const next = [...current, newAdj];
          await saveToSettings(next);
          return newAdj;
        }
        throw error;
      }
      return mapRow(data);
    } catch (e: any) {
      if (isSchemaError(e)) {
        const current = await loadFromSettings();
        const newAdj: TeamShiftAdjustment = { id: `local_${Date.now()}`, ...input };
        const next = [...current, newAdj];
        await saveToSettings(next);
        return newAdj;
      }
      throw e;
    }
  },

  async remove(id: string): Promise<void> {
    if (String(id).startsWith('local_')) {
      const current = await loadFromSettings();
      const next = current.filter(a => a.id !== id);
      await saveToSettings(next);
      return;
    }
    const supabase = createClient();
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error && isSchemaError(error)) {
        const current = await loadFromSettings();
        const next = current.filter(a => a.id !== id);
        await saveToSettings(next);
        return;
      }
      if (error) throw error;
    } catch (e: any) {
      if (isSchemaError(e)) {
        const current = await loadFromSettings();
        const next = current.filter(a => a.id !== id);
        await saveToSettings(next);
        return;
      }
      throw e;
    }
  },

  async update(id: string, patch: Partial<TeamShiftAdjustment>): Promise<void> {
    const supabase = createClient();
    const payload: any = {};
    if (patch.startTime) payload.start_time = patch.startTime;
    if (patch.endTime) payload.end_time = patch.endTime;
    if (patch.graceMinutes !== undefined) payload.grace_minutes = patch.graceMinutes;
    if (patch.reason !== undefined) payload.reason = patch.reason;
    try {
      const { error } = await supabase.from(TABLE).update(payload).eq('id', id);
      if (error && isSchemaError(error)) {
        const current = await loadFromSettings();
        const next = current.map(a => a.id === id ? { ...a, ...patch } : a);
        await saveToSettings(next);
        return;
      }
      if (error) throw error;
    } catch (e: any) {
      if (isSchemaError(e)) {
        const current = await loadFromSettings();
        const next = current.map(a => a.id === id ? { ...a, ...patch } : a);
        await saveToSettings(next);
        return;
      }
      throw e;
    }
  },
};

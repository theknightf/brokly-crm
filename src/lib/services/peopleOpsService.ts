'use client';

import { createClient } from '@/lib/supabase/client';
import { computePayrollEntry, round2, type PayrollRules } from '@/lib/payrollMath';
export { computePayrollEntry, round2 };
export type { PayrollRules };

// ─────────────────────────────────────────────────────────────────────────────
// People-Ops services: Company Settings (working hours / payroll rules),
// Leave management, KPI targets, Payroll, inactivity-based Lead Rotation and
// Duplicate-lead tracking. All follow the same degrade-gracefully pattern as
// crmService so missing tables never crash a screen.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>;

function mapRow<T>(row: Row | null | undefined, map: (r: Row) => T): T | null {
  if (!row) return null;
  return map(row);
}

function listRows<T>(rows: Row[] | null | undefined, map: (r: Row) => T): T[] {
  return (rows || []).map(map);
}

/**
 * PostgREST to-one embeds (`alias:user_profiles!fk(full_name)`) can come back
 * as a single object, an array, or null depending on the server version. Never
 * let the raw embed leak into state/render — always extract the string.
 */
function embeddedName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0]?.full_name || '';
  if (value && typeof value === 'object') return (value as Row).full_name || '';
  return '';
}

// ─── COMPANY SETTINGS ────────────────────────────────────────────────────────

export interface WorkingHours {
  start: string; // "12:00"
  end: string; // "20:00"
  flexibleHours: boolean;
  lateGraceMinutes: number;
  workdays: number[]; // 0=Sun ... 6=Sat
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: '12:00',
  end: '20:00',
  flexibleHours: false,
  lateGraceMinutes: 20,
  // Friday (5) is a weekly holiday — never a working day.
  workdays: [0, 1, 2, 3, 4, 6],
};

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
  dailySalaryBasis: 26,
  lateGraceMinutes: 20,
  deductPerLateMinute: 0,
  absenceDeductionPerDay: 0,
  overtimeEnabled: false,
  overtimeRate: 1.5,
  commissionRate: 0,
  commissionBasis: 'deal_value',
};

export const companySettingsService = {
  async get(key: string): Promise<Row | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error || !data) return null;
      return data.value;
    } catch {
      return null;
    }
  },

  async getAll(): Promise<Record<string, Row>> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from('company_settings').select('key, value');
      if (error) return {};
      const out: Record<string, Row> = {};
      (data || []).forEach((r: Row) => (out[r.key] = r.value));
      return out;
    } catch {
      return {};
    }
  },

  async getWorkingHours(): Promise<WorkingHours> {
    const v = await this.get('workingHours');
    return { ...DEFAULT_WORKING_HOURS, ...(v || {}) };
  },

  async getPayrollRules(): Promise<PayrollRules> {
    const v = await this.get('payrollRules');
    return { ...DEFAULT_PAYROLL_RULES, ...(v || {}) };
  },

  async update(key: string, value: Row): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() });
      return !error;
    } catch {
      return false;
    }
  },
};

// ─── LEAVE ───────────────────────────────────────────────────────────────────

export interface LeaveRequest {
  id: string;
  userId: string;
  userName?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  approvedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

const mapLeave = (r: Row): LeaveRequest => ({
  id: r.id,
  userId: r.user_id,
  userName: r.full_name || embeddedName(r.user_name),
  leaveType: r.leave_type,
  startDate: r.start_date,
  endDate: r.end_date,
  days: Number(r.days ?? 0),
  status: r.status,
  reason: r.reason || '',
  approvedBy: r.approved_by,
  reviewedAt: r.reviewed_at,
  createdAt: r.created_at,
});

export const leaveService = {
  async getMine() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, user_name:user_profiles!leave_requests_user_id_fkey(full_name)')
        .order('created_at', { ascending: false });
      if (error) return [];
      return listRows(data, (r) =>
        mapLeave({ ...r, full_name: embeddedName(r.user_name) })
      );
    } catch {
      return [];
    }
  },

  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, user_name:user_profiles!leave_requests_user_id_fkey(full_name)')
        .order('start_date', { ascending: false });
      if (error) return [];
      return listRows(data, (r) =>
        mapLeave({ ...r, full_name: embeddedName(r.user_name) })
      );
    } catch {
      return [];
    }
  },

  async request(input: {
    userId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    reason?: string;
  }) {
    const supabase = createClient();
    const { error } = await supabase.from('leave_requests').insert({
      user_id: input.userId,
      leave_type: input.leaveType,
      start_date: input.startDate,
      end_date: input.endDate,
      days: input.days,
      reason: input.reason || '',
      status: 'pending',
    });
    if (error) throw error;
    return true;
  },

  async review(id: string, status: 'approved' | 'rejected', actorId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, approved_by: actorId, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async cancel(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
    return true;
  },
};

// ─── KPI TARGETS ─────────────────────────────────────────────────────────────

export interface KpiTarget {
  id: string;
  metric: string;
  label: string;
  targetValue: number;
  periodType: 'day' | 'week' | 'month';
  targetRole: string;
  isActive: boolean;
}

export interface KpiProgress extends KpiTarget {
  actual: number;
  pct: number;
}

/** Roles an owner/admin can aim a KPI target or task at. */
export const TARGET_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'broker', label: 'Brokers' },
  { value: 'senior_agent', label: 'Senior Agents' },
  { value: 'agent', label: 'Sales Agents' },
  { value: 'telecaller', label: 'Telecallers' },
];

export const TARGET_ROLE_LABEL = (v: string): string =>
  TARGET_ROLE_OPTIONS.find((o) => o.value === v)?.label || v.replace('_', ' ');

const mapKpi = (r: Row): KpiTarget => ({
  id: r.id,
  metric: r.metric,
  label: r.label || '',
  targetValue: Number(r.target_value ?? 0),
  periodType: r.period_type || 'day',
  targetRole: r.target_role || 'all',
  isActive: r.is_active !== false,
});

export const kpiTargetsService = {
  async getAll(): Promise<KpiTarget[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('kpi_targets')
      .select('*')
      .order('period_type', { ascending: true })
      .order('metric', { ascending: true });
    if (error) throw error;
    return listRows(data, mapKpi);
  },

  async upsert(target: Partial<KpiTarget>) {
    const supabase = createClient();
    const row: Row = {
      metric: target.metric,
      label: target.label || target.metric,
      target_value: target.targetValue ?? 0,
      period_type: target.periodType || 'day',
      target_role: target.targetRole || 'all',
      is_active: target.isActive !== false,
    };
    if (target.id) {
      const { error } = await supabase.from('kpi_targets').update(row).eq('id', target.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('kpi_targets').insert(row);
      if (error) throw error;
    }
    return true;
  },

  async remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('kpi_targets').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  /** Active targets that apply to a given role ('all' or the user's own role). */
  async getForRole(role: string): Promise<KpiTarget[]> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('kpi_targets')
        .select('*')
        .eq('is_active', true)
        .in('target_role', ['all', role])
        .order('period_type', { ascending: true })
        .order('metric', { ascending: true });
      if (error) return [];
      return listRows(data, mapKpi);
    } catch {
      return [];
    }
  },

  /**
   * KPIs for a user with their live "actual" progress for each target.
   * Best-effort: any missing table/column degrades to actual = 0 so the
   * dashboard never breaks when the DB is behind on migrations.
   */
  async getMyProgress(userId: string, role: string): Promise<KpiProgress[]> {
    try {
      const targets = await this.getForRole(role);
      if (!targets.length) return [];
      const supabase = createClient();

      const periodStart = (periodType: string): string => {
        const now = new Date();
        if (periodType === 'day') {
          now.setHours(0, 0, 0, 0);
        } else if (periodType === 'week') {
          const dow = (now.getDay() + 6) % 7; // Monday = 0
          now.setDate(now.getDate() - dow);
          now.setHours(0, 0, 0, 0);
        } else {
          now.setDate(1);
          now.setHours(0, 0, 0, 0);
        }
        return now.toISOString();
      };

      const after = (dt: any, start: string) => !!dt && dt >= start;
      const money = (r: Row) => Number(r.final_price ?? r.total_price ?? 0);
      const DONE = ['Done Deal', 'Won'];

      // Bound the fetch to the widest window any target needs so we never pull
      // the user's full history into the browser (month > week > day start).
      const periodTypes = new Set(targets.map((t) => t.periodType));
      const earliestStart = periodTypes.has('month')
        ? periodStart('month')
        : periodTypes.has('week')
          ? periodStart('week')
          : periodStart('day');

      // Load the source rows for every metric once (each best-effort).
      const [calls, followUps, visits, leads] = await Promise.all([
        supabase
          .from('call_logs')
          .select('created_at')
          .eq('user_id', userId)
          .gte('created_at', earliestStart),
        supabase
          .from('follow_ups')
          .select('created_at')
          .eq('created_by', userId)
          .gte('created_at', earliestStart),
        supabase
          .from('site_visits')
          .select('check_in_at')
          .eq('user_id', userId)
          .gte('check_in_at', earliestStart),
        supabase
          .from('leads')
          .select('crm_status, final_price, total_price, updated_at')
          .eq('assigned_to', userId)
          .gte('updated_at', earliestStart),
      ]);

      const callTimes: string[] = ((calls.data || []) as Row[]).map((r) => r.created_at);
      const followTimes: string[] = ((followUps.data || []) as Row[]).map((r) => r.created_at);
      const visitTimes: string[] = ((visits.data || []) as Row[]).map((r) => r.check_in_at);
      const leadRows: Row[] = (leads.data || []) as Row[];

      return targets.map((t) => {
        const start = periodStart(t.periodType);
        let actual = 0;
        switch (t.metric) {
          case 'daily_calls':
            actual = callTimes.filter((dt) => after(dt, start)).length;
            break;
          case 'daily_followups':
            actual = followTimes.filter((dt) => after(dt, start)).length;
            break;
          case 'daily_meetings':
            actual = visitTimes.filter((dt) => after(dt, start)).length;
            break;
          case 'leads_worked':
            actual = leadRows.filter((r) => after(r.updated_at, start)).length;
            break;
          case 'deals':
            actual = leadRows.filter((r) => DONE.includes(r.crm_status) && after(r.updated_at, start)).length;
            break;
          case 'revenue':
            actual = leadRows
              .filter((r) => DONE.includes(r.crm_status) && after(r.updated_at, start))
              .reduce((s, r) => s + money(r), 0);
            break;
        }
        const pct = t.targetValue > 0 ? Math.min(100, Math.round((actual / t.targetValue) * 100)) : 0;
        return { ...t, actual, pct };
      });
    } catch {
      return [];
    }
  },
};

// ─── TASKS (role-assigned to-dos) ────────────────────────────────────────────

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  targetRole: string;
  dueDate: string | null;
  priority: string;
  assignedBy: string | null;
  createdAt: string | null;
  doneByMe: boolean;
}

const mapTask = (r: Row): TaskItem => ({
  id: r.id,
  title: r.title,
  description: r.description || '',
  targetRole: r.target_role || 'all',
  dueDate: r.due_date || null,
  priority: r.priority || 'Medium',
  assignedBy: r.assigned_by || null,
  createdAt: r.created_at || null,
  doneByMe: false,
});

export const tasksService = {
  /** All active tasks (admin/owner view). */
  async getAll(): Promise<TaskItem[]> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) return [];
      return listRows(data, mapTask);
    } catch {
      return [];
    }
  },

  /** Tasks relevant to the current user, annotated with their done state. */
  async getForUser(userId: string, role: string): Promise<TaskItem[]> {
    try {
      const supabase = createClient();
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_active', true)
        .in('target_role', ['all', role])
        .order('created_at', { ascending: false });
      const ids = ((tasks || []) as Row[]).map((t) => t.id);
      const doneSet = new Set<string>();
      if (ids.length) {
        const { data: comps } = await supabase
          .from('task_completions')
          .select('task_id')
          .eq('user_id', userId)
          .in('task_id', ids);
        ((comps || []) as Row[]).forEach((c) => doneSet.add(c.task_id));
      }
      return listRows(tasks, (r) => ({ ...mapTask(r), doneByMe: doneSet.has(r.id) }));
    } catch {
      return [];
    }
  },

  /** Create a task aimed at a role ('all' = everyone). */
  async create(input: {
    title: string;
    description?: string;
    targetRole: string;
    dueDate?: string;
    priority: string;
  }): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('tasks').insert({
      title: input.title,
      description: input.description || '',
      target_role: input.targetRole || 'all',
      due_date: input.dueDate || null,
      priority: input.priority || 'Medium',
    });
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },

  /** Toggle the current user's done state for a task. */
  async setDone(taskId: string, userId: string, done: boolean): Promise<void> {
    const supabase = createClient();
    if (done) {
      const { error } = await supabase
        .from('task_completions')
        .insert({ task_id: taskId, user_id: userId });
      if (error && !/duplicate/i.test(String(error.message))) throw error;
    } else {
      const { error } = await supabase
        .from('task_completions')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId);
      if (error) throw error;
    }
  },
};

// ─── PAYROLL ─────────────────────────────────────────────────────────────────

export interface PayrollPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'finalized';
  createdAt: string;
}

export interface PayrollEntry {
  id: string;
  periodId: string;
  userId: string;
  userName?: string;
  totalWorkingDays: number;
  attendanceDays: number;
  lateDays: number;
  lateMinutes: number;
  absenceDays: number;
  leaveDays: number;
  overtimeMinutes: number;
  baseSalary: number;
  bonus: number;
  commission: number;
  expenseReimbursement: number;
  otherDeductions: number;
  attendanceDeduction: number;
  lateDeduction: number;
  absenceDeduction: number;
  overtimePay: number;
  gross: number;
  deductionsTotal: number;
  net: number;
  status: 'draft' | 'approved' | 'paid';
  notes: string;
}

const mapPeriod = (r: Row): PayrollPeriod => ({
  id: r.id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  status: r.status,
  createdAt: r.created_at,
});

const mapEntry = (r: Row): PayrollEntry => ({
  id: r.id,
  periodId: r.period_id,
  userId: r.user_id,
  userName: r.full_name || embeddedName(r.user_name),
  totalWorkingDays: Number(r.total_working_days ?? 0),
  attendanceDays: Number(r.attendance_days ?? 0),
  lateDays: Number(r.late_days ?? 0),
  lateMinutes: Number(r.late_minutes ?? 0),
  absenceDays: Number(r.absence_days ?? 0),
  leaveDays: Number(r.leave_days ?? 0),
  overtimeMinutes: Number(r.overtime_minutes ?? 0),
  baseSalary: Number(r.base_salary ?? 0),
  bonus: Number(r.bonus ?? 0),
  commission: Number(r.commission ?? 0),
  expenseReimbursement: Number(r.expense_reimbursement ?? 0),
  otherDeductions: Number(r.other_deductions ?? 0),
  attendanceDeduction: Number(r.attendance_deduction ?? 0),
  lateDeduction: Number(r.late_deduction ?? 0),
  absenceDeduction: Number(r.absence_deduction ?? 0),
  overtimePay: Number(r.overtime_pay ?? 0),
  gross: Number(r.gross ?? 0),
  deductionsTotal: Number(r.deductions_total ?? 0),
  net: Number(r.net ?? 0),
  status: r.status,
  notes: r.notes || '',
});

export const payrollService = {
  async getPeriods(): Promise<PayrollPeriod[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .order('period_start', { ascending: false });
      if (error) return [];
      return listRows(data, mapPeriod);
    } catch {
      return [];
    }
  },

  async getEntries(periodId: string): Promise<PayrollEntry[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('payroll_entries')
        .select('*, user_name:user_profiles!payroll_entries_user_id_fkey(full_name)')
        .eq('period_id', periodId)
        .order('created_at', { ascending: true });
      if (error) return [];
      return listRows(data, (r) =>
        mapEntry({ ...r, full_name: embeddedName(r.user_name) })
      );
    } catch {
      return [];
    }
  },

  async createPeriod(start: string, end: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('payroll_periods')
      .insert({ period_start: start, period_end: end, status: 'draft' })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? mapPeriod(data) : null;
  },

  async generate(periodId: string) {
    const res = await fetch(`/api/payroll/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'Failed to generate payroll');
    }
    return res.json();
  },

  async updateEntry(id: string, patch: Partial<PayrollEntry>) {
    const supabase = createClient();
    const row: Row = {};
    if (patch.baseSalary !== undefined) row.base_salary = patch.baseSalary;
    if (patch.bonus !== undefined) row.bonus = patch.bonus;
    if (patch.commission !== undefined) row.commission = patch.commission;
    if (patch.expenseReimbursement !== undefined) row.expense_reimbursement = patch.expenseReimbursement;
    if (patch.otherDeductions !== undefined) row.other_deductions = patch.otherDeductions;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await supabase.from('payroll_entries').update(row).eq('id', id);
    if (error) throw error;
    return true;
  },

  async finalize(periodId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('payroll_periods')
      .update({ status: 'finalized' })
      .eq('id', periodId);
    if (error) throw error;
    return true;
  },
};

// ─── INACTIVITY-BASED LEAD ROTATION ──────────────────────────────────────────
// Reassigns leads the current assignee has not touched for `inactivityDays`.
// Configured by Owner/Admin (admin_settings category "rotation",
// name "inactivity_days"). History recorded in lead_rotation_log + activity_log
// with notifications to both assignees.

export const rotationService = {
  async getConfig() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('category', 'rotation');
      if (error) return { enabled: false, inactivityDays: 7 };
      const items = data || [];
      const enabled = !!items.find((i: Row) => i.name === 'rotation_enabled')?.is_active;
      const days = Number(items.find((i: Row) => i.name === 'inactivity_days')?.sort_order ?? 7);
      return { enabled, inactivityDays: days > 0 ? days : 7 };
    } catch {
      return { enabled: false, inactivityDays: 7 };
    }
  },

  async saveConfig(enabled: boolean, inactivityDays: number) {
    const supabase = createClient();
    const upsert = async (name: string, isActive: boolean, order: number) => {
      const { data: existing } = await supabase
        .from('admin_settings')
        .select('id')
        .eq('category', 'rotation')
        .eq('name', name);
      if (existing && existing.length > 0) {
        await supabase.from('admin_settings').update({ is_active: isActive, sort_order: order }).eq('id', existing[0].id);
      } else {
        await supabase.from('admin_settings').insert({ category: 'rotation', name, sort_order: order, is_active: isActive });
      }
    };
    await upsert('rotation_enabled', enabled, 0);
    await upsert('inactivity_days', true, inactivityDays);
    return true;
  },

  /** Runs the inactivity sweep server-side (see /api/rotation/run). */
  async run() {
    const res = await fetch('/api/rotation/run', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'Failed to run rotation');
    }
    return res.json();
  },

  async history() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('lead_rotation_log')
        .select('*, from_user:user_profiles!lead_rotation_log_from_user_id_fkey(full_name), to_user:user_profiles!lead_rotation_log_to_user_id_fkey(full_name), lead:leads!lead_rotation_log_lead_id_fkey(name)')
        .order('rotated_at', { ascending: false })
        .limit(100);
      if (error) return [];
      return (data || []).map((r: Row) => ({
        id: r.id,
        leadId: r.lead_id,
        leadName: r.lead?.name || '',
        fromUserId: r.from_user_id,
        fromUserName: r.from_user?.[0]?.full_name || '—',
        toUserId: r.to_user_id,
        toUserName: r.to_user?.[0]?.full_name || '—',
        reason: r.reason || '',
        detail: r.detail || '',
        rotatedAt: r.rotated_at,
      }));
    } catch {
      return [];
    }
  },
};

// ─── DUPLICATE LEAD TRACKING ─────────────────────────────────────────────────

export const duplicateLeadsService = {
  /** Look up an existing lead by normalized phone. */
  async findByPhone(phone: string) {
    const clean = String(phone || '').replace(/\D/g, '');
    if (!clean) return null;
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, created_by, created_at, created_by_profile:user_profiles!leads_created_by_fkey(full_name), lead_status, assigned_to_profile:user_profiles!leads_assigned_to_fkey(full_name)')
        .ilike('phone', `%${clean}`)
        .order('created_at', { ascending: true })
        .limit(3);
      if (error || !data?.length) return null;
      const first = data[0];
      return {
        id: first.id,
        name: first.name || 'Unnamed',
        phone: first.phone || phone,
        status: first.lead_status || 'New',
        createdBy: first.created_by_profile?.[0]?.full_name || 'Unknown',
        createdAt: first.created_at,
        assignedTo: first.assigned_to_profile?.[0]?.full_name || '—',
        matches: data.length,
      };
    } catch {
      return null;
    }
  },

  /** Record a flagged duplicate attempt so Owner/Admin are notified. */
  async logAttempt(input: {
    matchedLeadId: string;
    attemptedLeadId?: string;
    attemptedPhone: string;
  }) {
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from('duplicate_lead_attempts').insert({
        matched_lead_id: input.matchedLeadId,
        attempted_lead_id: input.attemptedLeadId,
        attempted_phone: input.attemptedPhone,
        attempted_by: user?.id,
        status: 'flagged',
      });
      if (error) return false;
      // Notify admins via activity_log (feeds the notification bell).
      const { data: admins } = await supabase
        .from('user_profiles')
        .select('id')
        .in('role', ['owner', 'admin'])
        .eq('is_active', true);
      if (admins?.length) {
        await supabase.from('activity_log').insert(
          admins.map((a: Row) => ({
            user_id: a.id,
            action_type: 'Duplicate Lead Flagged',
            entity_type: 'lead',
            entity_id: input.matchedLeadId,
            detail: 'Duplicate phone detected: ' + input.attemptedPhone,
          }))
        );
      }
      return true;
    } catch {
      return false;
    }
  },

  async list() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('duplicate_lead_attempts')
        .select('*, matched:user_profiles...leads!duplicate_lead_attempts_matched_lead_id_fkey(name), attempted_by_profile:user_profiles!duplicate_lead_attempts_attempted_by_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return [];
      return (data || []).map((r: Row) => ({
        id: r.id,
        matchedLeadId: r.matched_lead_id,
        matchedLeadName: r.matched?.name || '',
        attemptedPhone: r.attempted_phone || '',
        attemptedBy: r.attempted_by_profile?.[0]?.full_name || '',
        status: r.status,
        note: r.note || '',
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  },
};

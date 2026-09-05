// ─── Enterprise Attendance Policy Engine ─────────────────────────────────
// Multi-shift, Leaves & Permissions-aware. Server & client safe (no Supabase).
// Shift 1: 12:00–20:00 grace 20 (cutoff 12:20) · Shift 2: 13:00–21:00 grace 20 (cutoff 13:20)
// Leaves override absent; Permissions offset net late/early calculations.

import { OfficeHoursConfig, toMinutes, formatMinutes, buildOfficeHours } from './officeHours';

// ─── Shift Definitions ───────────────────────────────────────────────────
export interface ShiftConfig extends OfficeHoursConfig {
  id: string; // 'shift1' | 'shift2'
  labelAr: string;
  labelEn: string;
  teamNames: string[]; // teams assigned to this shift
}

export const DEFAULT_SHIFTS: ShiftConfig[] = [
  {
    id: 'shift1',
    labelAr: 'الوردية القياسية',
    labelEn: 'Standard Shift',
    start: '12:00',
    end: '20:00',
    startMinutes: 12 * 60,
    endMinutes: 20 * 60,
    graceMinutes: 20,
    toleranceMinutes: 12 * 60 + 20,
    flexibleHours: false,
    officeHours: [12,13,14,15,16,17,18,19,20],
    teamNames: ['Sales', 'Admin', 'Operations', 'Marketing', 'Default'],
  },
  {
    id: 'shift2',
    labelAr: 'الوردية المسائية',
    labelEn: 'Late Shift',
    start: '13:00',
    end: '21:00',
    startMinutes: 13 * 60,
    endMinutes: 21 * 60,
    graceMinutes: 20,
    toleranceMinutes: 13 * 60 + 20,
    flexibleHours: false,
    officeHours: [13,14,15,16,17,18,19,20,21],
    teamNames: ['Support', 'Evening Team', 'Evening', 'Support Team', 'Customer Support'],
  },
];

export function buildShiftConfig(base: { start: string; end: string; graceMinutes: number; id: string; labelAr: string; labelEn: string; teamNames: string[] }): ShiftConfig {
  const cfg = buildOfficeHours({ start: base.start, end: base.end, lateGraceMinutes: base.graceMinutes });
  return {
    ...cfg,
    id: base.id,
    labelAr: base.labelAr,
    labelEn: base.labelEn,
    teamNames: base.teamNames,
  };
}

export function getShiftForTeam(teamName?: string | null, shifts: ShiftConfig[] = DEFAULT_SHIFTS): ShiftConfig {
  const name = (teamName || '').trim().toLowerCase();
  for (const s of shifts) {
    if (s.teamNames.some((t) => t.toLowerCase() === name)) return s;
  }
  // default to shift1
  return shifts[0] || DEFAULT_SHIFTS[0];
}

export function getShiftForUser(user: { team_id?: string | null; teamName?: string | null }, teamNameById: Map<string,string>, shifts: ShiftConfig[] = DEFAULT_SHIFTS): ShiftConfig {
  const teamName = user.teamName || (user.team_id ? teamNameById.get(user.team_id) : undefined) || '';
  return getShiftForTeam(teamName, shifts);
}

// ─── Leave Types ─────────────────────────────────────────────────────────
export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'holiday' | string;
export const LEAVE_TYPES: { value: string; ar: string; en: string; color: string }[] = [
  { value: 'annual', ar: 'إجازة اعتيادية / سنوية', en: 'Paid Annual', color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200' },
  { value: 'sick', ar: 'إجازة مرضي - طبي معتمد', en: 'Sick Leave', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200' },
  { value: 'unpaid', ar: 'إجازة بدون راتب', en: 'Unpaid Leave', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700' },
  { value: 'holiday', ar: 'عطلة رسمية', en: 'Official Holiday', color: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 border-violet-200' },
];
export function leaveAr(type: string): string {
  return LEAVE_TYPES.find((x) => x.value === type)?.ar || type || 'إجازة';
}
export function leaveBadgeClass(type: string): string {
  return LEAVE_TYPES.find((x) => x.value === type)?.color || 'bg-sky-100 text-sky-700 border-sky-200';
}

// ─── Permissions ─────────────────────────────────────────────────────────
export type PermissionType = 'late_arrival' | 'early_departure' | 'mission';
export const PERMISSION_TYPES: { value: PermissionType; ar: string; en: string }[] = [
  { value: 'late_arrival', ar: 'إذن تأخير معتمد', en: 'Late Arrival Permission' },
  { value: 'early_departure', ar: 'إذن انصراف مبكر', en: 'Early Departure Permission' },
  { value: 'mission', ar: 'إذن مأمورية عمل خارجية', en: 'Mid-shift Mission' },
];
export function permissionAr(type: string): string {
  return PERMISSION_TYPES.find((x) => x.value === type)?.ar || type;
}

export interface Permission {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  type: PermissionType;
  excusedMinutes: number;
  reason: string;
  status: 'approved' | 'pending' | 'rejected';
  approvedBy?: string;
  approvedByName?: string;
}

// ─── Attendance Status ───────────────────────────────────────────────────
export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'early_departure'
  | 'overtime'
  | 'present_overtime'
  | 'late_overtime'
  | 'absent'
  | 'leave'
  | 'permission'; // covered by permission, still show as present but with permission badge

export interface DailyAttendanceInput {
  checkIn?: string | null;
  checkOut?: string | null;
  leaveType?: string | null; // annual/sick/unpaid/holiday
  isExcused?: boolean;
  permissions?: Permission[]; // permissions for this day (approved only affect net)
}

export interface DailyAttendanceResult {
  status: AttendanceStatus;
  statusAr: string;
  statusEn: string;
  rawLateMinutes: number;
  netLateMinutes: number;
  lateMinutes: number; // alias net
  overtimeMinutes: number;
  earlyDepartureMinutes: number;
  netEarlyMinutes: number;
  netWorkMinutes: number;
  netWorkHours: string;
  badgeClass: string;
  permissionNote?: string;
  leaveType?: string | null;
  excusedMinutes: number;
}

const STATUS_AR: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  late: 'متأخر',
  early_departure: 'انصراف مبكر',
  overtime: 'إضافي',
  present_overtime: 'حاضر + إضافي',
  late_overtime: 'متأخر + إضافي',
  absent: 'غياب بدون إذن',
  leave: 'إجازة',
  permission: 'بإذن معتمد',
};

const STATUS_EN: Record<AttendanceStatus, string> = {
  present: 'Present - On Time',
  late: 'Late',
  early_departure: 'Early Leave',
  overtime: 'Overtime',
  present_overtime: 'Present + Overtime',
  late_overtime: 'Late + Overtime',
  absent: 'Absent',
  leave: 'Leave',
  permission: 'Permission',
};

function minutesOfDayFromISO(iso: string | null | undefined): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}

function fmtDuration(mins: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function minutesToHM(mins: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function officeCfgToAr(cfg: OfficeHoursConfig): string {
  const toAr = (t: string) => {
    const mins = toMinutes(t);
    if (mins < 0) return t;
    const hour = Math.floor(mins / 60);
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const mm = String(mins % 60).padStart(2, '0');
    const suffix = hour >= 12 ? 'م' : 'ص';
    return `${String(displayHour).padStart(2, '0')}:${mm} ${suffix}`;
  };
  return `${toAr(cfg.start)} - ${toAr(cfg.end)} | فترة سماح ${cfg.graceMinutes} دقيقة حتى ${toAr(formatMinutes(cfg.toleranceMinutes))}`;
}

export function shiftsToAr(shifts: ShiftConfig[]): string {
  return shifts.map((s) => `${s.labelAr} ${officeCfgToAr(s)}`).join('  •  ');
}

/**
 * Core policy: evaluate single day with shift + permissions.
 * `dateStr` (YYYY-MM-DD) enables the Friday weekly-holiday rule: a Friday
 * with no check-in is a day off (never absent, never deducted). A Friday
 * WITH a check-in is evaluated normally (holiday work still earns overtime).
 */
export function evaluateDailyAttendance(
  input: DailyAttendanceInput,
  cfg: OfficeHoursConfig,
  dateStr?: string | null
): DailyAttendanceResult {
  const permissions = (input.permissions || []).filter((p) => p.status === 'approved');
  const excusedLate = permissions
    .filter((p) => p.type === 'late_arrival')
    .reduce((s, p) => s + (p.excusedMinutes || 0), 0);
  const excusedEarly = permissions
    .filter((p) => p.type === 'early_departure')
    .reduce((s, p) => s + (p.excusedMinutes || 0), 0);
  // mission excuses whole day absence if present? treat as permission note but still need checkIn? mission means not required to be present? We'll treat as not absent if mission approved
  const hasMission = permissions.some((p) => p.type === 'mission' && p.status === 'approved');
  const permissionNote = permissions.length
    ? permissions.map((p) => `${permissionAr(p.type)} (${p.excusedMinutes}m${p.reason ? ': ' + p.reason : ''})`).join('، ')
    : undefined;

  // Leave overrides everything (no penalty)
  if (input.isExcused || input.leaveType) {
    const type = input.leaveType || 'leave';
    return {
      status: 'leave',
      statusAr: leaveAr(type),
      statusEn: type,
      rawLateMinutes: 0,
      netLateMinutes: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
      netEarlyMinutes: 0,
      netWorkMinutes: 0,
      netWorkHours: '—',
      badgeClass: leaveBadgeClass(type),
      permissionNote,
      leaveType: type,
      excusedMinutes: excusedLate + excusedEarly,
    };
  }

  // Weekly holiday: Friday with no check-in is a day off — never absent.
  if (!input.checkIn && isFridayHoliday(dateStr)) {
    return {
      status: 'leave',
      statusAr: 'عطلة أسبوعية',
      statusEn: 'Friday Holiday',
      rawLateMinutes: 0,
      netLateMinutes: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
      netEarlyMinutes: 0,
      netWorkMinutes: 0,
      netWorkHours: '—',
      badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 border-violet-200',
      permissionNote,
      leaveType: 'holiday',
      excusedMinutes: 0,
    };
  }

  // Absent: no check-in and no mission
  if (!input.checkIn) {
    if (hasMission) {
      return {
        status: 'permission',
        statusAr: 'مأمورية معتمدة',
        statusEn: 'Mission',
        rawLateMinutes: 0,
        netLateMinutes: 0,
        lateMinutes: 0,
        overtimeMinutes: 0,
        earlyDepartureMinutes: 0,
        netEarlyMinutes: 0,
        netWorkMinutes: 0,
        netWorkHours: '—',
        badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 border-violet-200',
        permissionNote,
        excusedMinutes: excusedLate + excusedEarly,
      };
    }
    return {
      status: 'absent',
      statusAr: STATUS_AR.absent,
      statusEn: STATUS_EN.absent,
      rawLateMinutes: 0,
      netLateMinutes: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
      netEarlyMinutes: 0,
      netWorkMinutes: 0,
      netWorkHours: '—',
      badgeClass: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300 border-red-200',
      permissionNote,
      excusedMinutes: 0,
    };
  }

  const inMin = minutesOfDayFromISO(input.checkIn);
  const outMin = minutesOfDayFromISO(input.checkOut);

  const rawIsLate = inMin > cfg.toleranceMinutes;
  const rawLateMinutes = rawIsLate && inMin >= 0 ? Math.max(0, inMin - cfg.startMinutes) : 0;
  const netLateMinutes = Math.max(0, rawLateMinutes - excusedLate);
  const netIsLate = netLateMinutes > 0;

  let overtimeMinutes = 0;
  let earlyRaw = 0;
  if (outMin >= 0) {
    if (outMin > cfg.endMinutes) overtimeMinutes = outMin - cfg.endMinutes;
    else if (outMin < cfg.endMinutes) earlyRaw = cfg.endMinutes - outMin;
  }
  const netEarlyMinutes = Math.max(0, earlyRaw - excusedEarly);

  let netWorkMinutes = 0;
  if (input.checkIn && input.checkOut) {
    const a = new Date(input.checkIn).getTime();
    const b = new Date(input.checkOut).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) netWorkMinutes = Math.round((b - a) / 60000);
  }

  // Determine status with permission awareness
  let status: AttendanceStatus;
  let badgeClass: string;
  const hasPermissionCover = permissions.length > 0 && netLateMinutes === 0 && netEarlyMinutes === 0 && (rawLateMinutes > 0 || earlyRaw > 0);

  if (hasPermissionCover) {
    status = 'permission';
    badgeClass = 'bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300 border-lime-200';
  } else if (netIsLate && overtimeMinutes > 0) {
    status = 'late_overtime';
    badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200';
  } else if (!netIsLate && overtimeMinutes > 0) {
    status = 'present_overtime';
    badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200';
  } else if (netIsLate) {
    status = 'late';
    badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200';
  } else if (netEarlyMinutes > 0 && input.checkOut) {
    status = 'early_departure';
    badgeClass = 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300 border-orange-200';
  } else {
    status = 'present';
    badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200';
  }

  return {
    status,
    statusAr: STATUS_AR[status],
    statusEn: STATUS_EN[status],
    rawLateMinutes,
    netLateMinutes,
    lateMinutes: netLateMinutes,
    overtimeMinutes,
    earlyDepartureMinutes: earlyRaw,
    netEarlyMinutes,
    netWorkMinutes,
    netWorkHours: fmtDuration(netWorkMinutes),
    badgeClass,
    permissionNote,
    excusedMinutes: excusedLate + excusedEarly,
  };
}

// ─── Aggregated ────────────────────────────────────────────────────────
export interface MonthlyAggregate {
  userId: string;
  daysInMonth: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  permissionCovered: number;
  earlyDeparture: number;
  totalRawLate: number;
  totalNetLate: number;
  totalOvertimeMinutes: number;
  totalOvertimeHours: string;
  totalWorkMinutes: number;
  totalWorkHours: string;
  attendanceRate: number;
  totalLeaves: number;
  totalPermissions: number;
}

export function aggregateMonthly(
  days: { date: string; checkIn?: string | null; checkOut?: string | null; leaveType?: string | null; permissions?: Permission[] }[],
  cfg: OfficeHoursConfig
): Omit<MonthlyAggregate, 'userId' | 'daysInMonth'> & { daysInMonth: number } {
  let present = 0;
  let late = 0;
  let absent = 0;
  let leave = 0;
  let permissionCovered = 0;
  let earlyDeparture = 0;
  let totalRawLate = 0;
  let totalNetLate = 0;
  let totalOvertimeMinutes = 0;
  let totalWorkMinutes = 0;
  let totalPermissions = 0;

  days.forEach((d) => {
    const r = evaluateDailyAttendance({ checkIn: d.checkIn, checkOut: d.checkOut, leaveType: d.leaveType, permissions: d.permissions }, cfg, d.date);
    if (r.status === 'leave') leave += 1;
    else if (r.status === 'absent') absent += 1;
    else {
      present += 1;
      if (r.status === 'late' || r.status === 'late_overtime') late += 1;
      if (r.status === 'early_departure') earlyDeparture += 1;
      if (r.status === 'permission') permissionCovered += 1;
    }
    totalRawLate += r.rawLateMinutes;
    totalNetLate += r.netLateMinutes;
    totalOvertimeMinutes += r.overtimeMinutes;
    totalWorkMinutes += r.netWorkMinutes;
    if (d.permissions?.length) totalPermissions += 1;
  });

  const attendanceRate = days.length ? Math.round((present / days.length) * 100) : 0;

  return {
    daysInMonth: days.length,
    present,
    late,
    absent,
    leave,
    permissionCovered,
    earlyDeparture,
    totalRawLate,
    totalNetLate,
    totalOvertimeMinutes,
    totalOvertimeHours: fmtDuration(totalOvertimeMinutes),
    totalWorkMinutes,
    totalWorkHours: fmtDuration(totalWorkMinutes),
    attendanceRate,
    totalLeaves: leave,
    totalPermissions,
  };
}

// ─── Weekly Holiday (Friday) ───────────────────────────────────────────
// Company policy: every Friday is a weekly holiday — no attendance expected,
// no absence recorded, no payroll deduction. Applies at the core-evaluation
// level so it holds regardless of the saved `workdays` config array.
export const FRIDAY_DOW = 5; // Date.getDay(): 0=Sun … 5=Fri 6=Sat

/** Day of week for a YYYY-MM-DD (or ISO) string, -1 when unparseable. */
export function dayOfWeek(dateStr?: string | null): number {
  if (!dateStr || typeof dateStr !== 'string') return -1;
  const day = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return -1;
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? -1 : d.getDay();
}

export function isFridayHoliday(dateStr?: string | null): boolean {
  return dayOfWeek(dateStr) === FRIDAY_DOW;
}

export function isWorkingDay(dateStr?: string | null): boolean {
  const dow = dayOfWeek(dateStr);
  return dow >= 0 && dow !== FRIDAY_DOW;
}

/** Count working days (excludes Fridays) in a list of YYYY-MM-DD dates. */
export function countWorkingDays(dates: string[]): number {
  return dates.filter(isWorkingDay).length;
}

/** True when "now" is Friday on the business wall clock (default Africa/Cairo). */
export function isFridayInTimeZone(date = new Date(), timeZone = 'Africa/Cairo'): boolean {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date) === 'Fri';
  } catch {
    return date.getDay() === FRIDAY_DOW;
  }
}

// ─── Cairo wall-clock helpers (server-safe, no deps) ────────────────────
// Admin manual/batch entry works in Cairo wall time ("10:00 AM") while the DB
// stores UTC. These convert both ways without external libraries.

export interface CairoWall {
  y: number;
  m: number;
  d: number;
  mins: number; // minutes since midnight on the Cairo wall clock
  dateStr: string; // YYYY-MM-DD (Cairo calendar date)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Decompose any Date/ISO into Cairo wall-clock parts. Never throws. */
export function cairoWall(date: Date | string): CairoWall {
  const dt = date instanceof Date ? date : new Date(date);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dt);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    const y = Number(get('year'));
    const m = Number(get('month'));
    const d = Number(get('day'));
    const mins = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    return { y, m, d, mins, dateStr: `${y}-${pad2(m)}-${pad2(d)}` };
  } catch {
    return {
      y: dt.getFullYear(),
      m: dt.getMonth() + 1,
      d: dt.getDate(),
      mins: dt.getHours() * 60 + dt.getMinutes(),
      dateStr: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    };
  }
}

/** Cairo wall-clock minutes for a stored ISO timestamp (-1 when invalid). */
export function cairoMinutesOfISO(iso: string | null | undefined): number {
  if (!iso) return -1;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return -1;
  return cairoWall(dt).mins;
}

/** Cairo calendar date (YYYY-MM-DD) for a stored ISO timestamp. */
export function cairoDateOfISO(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return cairoWall(dt).dateStr;
}

/**
 * Combine a YYYY-MM-DD date + "HH:MM" Cairo wall time into a UTC ISO string
 * for storage. Returns null on invalid input. Handles EET/EEST via Intl.
 */
export function cairoISOFromWall(dateStr: string, hhmm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const [y, mo, da] = dateStr.split('-').map(Number);
  try {
    // Cairo offset at local noon that day (stable half of the day).
    const probe = new Date(Date.UTC(y, mo - 1, da, 12, 0));
    const asCairo = new Date(probe.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const asUTC = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = asCairo.getTime() - asUTC.getTime();
    return new Date(Date.UTC(y, mo - 1, da, h, min) - offsetMs).toISOString();
  } catch {
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────
export function getDaysInMonth(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

export function formatMonthAr(year: number, month: number): string {
  const arMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${arMonths[month - 1]} ${year}`;
}

export function formatMonthEn(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function matchesAttendanceStatus(evaluatedStatus: AttendanceStatus, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'late') return evaluatedStatus === 'late' || evaluatedStatus === 'late_overtime';
  if (filter === 'present') return evaluatedStatus === 'present' || evaluatedStatus === 'present_overtime' || evaluatedStatus === 'permission';
  if (filter === 'early') return evaluatedStatus === 'early_departure';
  if (filter === 'overtime') return evaluatedStatus === 'present_overtime' || evaluatedStatus === 'late_overtime';
  return evaluatedStatus === filter;
}

export function calcLateMinutes(checkInISO: string, cfg: OfficeHoursConfig): number {
  const m = minutesOfDayFromISO(checkInISO);
  if (m < 0 || m <= cfg.toleranceMinutes) return 0;
  return Math.max(0, m - cfg.startMinutes);
}

export function calcOvertimeMinutes(checkOutISO: string, cfg: OfficeHoursConfig): number {
  const m = minutesOfDayFromISO(checkOutISO);
  if (m < 0 || m <= cfg.endMinutes) return 0;
  return m - cfg.endMinutes;
}

// ─── Team Shift Delay / Rescheduling ─────────────────────────────────────
export interface TeamShiftAdjustment {
  id: string;
  teamId: string | null;
  teamName: string;
  date: string | null; // null = permanent, YYYY-MM-DD = temporary
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  graceMinutes: number;
  reason?: string;
  isTemporary: boolean;
  createdAt?: string;
  createdBy?: string;
}

export function getEffectiveShiftForTeam(
  teamName: string | null | undefined,
  teamId: string | null | undefined,
  date: string | null | undefined,
  baseShifts: ShiftConfig[] = DEFAULT_SHIFTS,
  adjustments: TeamShiftAdjustment[] = []
): ShiftConfig {
  const base = getShiftForTeam(teamName, baseShifts);
  if (!adjustments.length) return base;

  const normTeam = (teamName || '').trim().toLowerCase();
  const normId = (teamId || '').trim();

  // Prefer exact date match (temporary) first
  if (date) {
    const temp = adjustments.find((a) => {
      if (!a.isTemporary || !a.date) return false;
      if (a.date !== date) return false;
      if (a.teamId && normId) return a.teamId === normId;
      return (a.teamName || '').trim().toLowerCase() === normTeam;
    });
    if (temp) {
      return buildShiftConfig({
        id: base.id,
        labelAr: base.labelAr,
        labelEn: base.labelEn,
        start: temp.startTime,
        end: temp.endTime,
        graceMinutes: temp.graceMinutes,
        teamNames: base.teamNames,
      });
    }
  }

  // Fallback to permanent adjustment for this team
  const perm = adjustments.find((a) => {
    if (a.isTemporary) return false;
    if (a.teamId && normId) return a.teamId === normId;
    return (a.teamName || '').trim().toLowerCase() === normTeam;
  });
  if (perm) {
    return buildShiftConfig({
      id: base.id,
      labelAr: base.labelAr,
      labelEn: base.labelEn,
      start: perm.startTime,
      end: perm.endTime,
      graceMinutes: perm.graceMinutes,
      teamNames: base.teamNames,
    });
  }

  return base;
}

export function getEffectiveShiftForUserWithAdjustments(
  user: { team_id?: string | null; teamName?: string | null },
  teamNameById: Map<string, string>,
  date: string | null | undefined,
  baseShifts: ShiftConfig[] = DEFAULT_SHIFTS,
  adjustments: TeamShiftAdjustment[] = []
): ShiftConfig {
  const teamName = user.teamName || (user.team_id ? teamNameById.get(user.team_id) : undefined) || '';
  return getEffectiveShiftForTeam(teamName, user.team_id || null, date, baseShifts, adjustments);
}

export function formatShiftAdjustmentLabel(adj: TeamShiftAdjustment): string {
  const datePart = adj.isTemporary && adj.date ? `ليوم ${adj.date}` : 'دائم';
  return `${adj.teamName}: ${officeCfgToAr({ start: adj.startTime, end: adj.endTime, startMinutes: toMinutes(adj.startTime), endMinutes: toMinutes(adj.endTime), graceMinutes: adj.graceMinutes, toleranceMinutes: toMinutes(adj.startTime) + adj.graceMinutes, flexibleHours: false, officeHours: [] } as any)} — ${datePart}${adj.reason ? ` — ${adj.reason}` : ''}`;
}

export function addMinutesToTime(time: string, offsetMins: number): string {
  const mins = toMinutes(time);
  if (mins < 0) return time;
  const total = mins + offsetMins;
  const h = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const m = ((total % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

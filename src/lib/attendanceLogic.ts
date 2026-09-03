// ─── Attendance Policy Engine ───────────────────────────────────────────────
// Pure logic for Cairo office shift 12:00–20:00 with 20-min grace.
// All functions are server & client safe (no Supabase).
import { OfficeHoursConfig, toMinutes, formatMinutes } from './officeHours';

export type AttendanceStatus =
  | 'present' // حاضر - On Time (within grace)
  | 'late' // متأخر
  | 'early_departure' // انصراف مبكر
  | 'overtime' // إضافي (checked out after end)
  | 'present_overtime' // حاضر + إضافي
  | 'late_overtime' // متأخر + إضافي
  | 'absent' // غياب
  | 'leave'; // إجازة

export interface DailyAttendanceInput {
  checkIn?: string | null; // ISO timestamp
  checkOut?: string | null; // ISO timestamp
  leaveType?: string | null; // e.g. 'إجازة رسمية'
  isExcused?: boolean;
}

export interface DailyAttendanceResult {
  status: AttendanceStatus;
  statusAr: string;
  statusEn: string;
  lateMinutes: number; // from shift start (12:00) if late, else 0
  overtimeMinutes: number; // after 20:00
  earlyDepartureMinutes: number; // before 20:00
  netWorkMinutes: number; // actual worked
  netWorkHours: string; // "8h 15m"
  badgeClass: string;
}

const STATUS_AR: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  late: 'متأخر',
  early_departure: 'انصراف مبكر',
  overtime: 'إضافي',
  present_overtime: 'حاضر + إضافي',
  late_overtime: 'متأخر + إضافي',
  absent: 'غياب',
  leave: 'إجازة',
};

const STATUS_EN: Record<AttendanceStatus, string> = {
  present: 'Present - On Time',
  late: 'Late',
  early_departure: 'Early Departure',
  overtime: 'Overtime',
  present_overtime: 'Present + Overtime',
  late_overtime: 'Late + Overtime',
  absent: 'Absent',
  leave: 'Leave',
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

/** Convert OfficeHoursConfig to Arabic display like "12:00 م - 08:00 م" */
export function officeCfgToAr(cfg: OfficeHoursConfig): string {
  const toAr = (t: string) => {
    const mins = toMinutes(t);
    if (mins < 0) return t;
    const h12 = mins % (12 * 60);
    const hour = Math.floor(mins / 60);
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const mm = String(mins % 60).padStart(2, '0');
    const suffix = hour >= 12 ? 'م' : 'ص';
    return `${String(displayHour).padStart(2, '0')}:${mm} ${suffix}`;
  };
  return `${toAr(cfg.start)} - ${toAr(cfg.end)} | فترة سماح ${cfg.graceMinutes} دقيقة حتى ${toAr(formatMinutes(cfg.toleranceMinutes))}`;
}

/** Core policy: evaluate a single day */
export function evaluateDailyAttendance(
  input: DailyAttendanceInput,
  cfg: OfficeHoursConfig
): DailyAttendanceResult {
  // Leave overrides everything
  if (input.isExcused || input.leaveType) {
    return {
      status: 'leave',
      statusAr: STATUS_AR.leave,
      statusEn: STATUS_EN.leave,
      lateMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
      netWorkMinutes: 0,
      netWorkHours: '—',
      badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200',
    };
  }

  // Absent: no check-in
  if (!input.checkIn) {
    return {
      status: 'absent',
      statusAr: STATUS_AR.absent,
      statusEn: STATUS_EN.absent,
      lateMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
      netWorkMinutes: 0,
      netWorkHours: '—',
      badgeClass: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300 border-red-200',
    };
  }

  const inMin = minutesOfDayFromISO(input.checkIn);
  const outMin = minutesOfDayFromISO(input.checkOut);

  const isLate = inMin > cfg.toleranceMinutes;
  const lateMinutes = isLate && inMin >= 0 ? Math.max(0, inMin - cfg.startMinutes) : 0;

  let overtimeMinutes = 0;
  let earlyDepartureMinutes = 0;
  if (outMin >= 0) {
    if (outMin > cfg.endMinutes) overtimeMinutes = outMin - cfg.endMinutes;
    else if (outMin >= 0 && outMin < cfg.endMinutes) earlyDepartureMinutes = cfg.endMinutes - outMin;
  }

  // Net work minutes
  let netWorkMinutes = 0;
  if (input.checkIn && input.checkOut) {
    const a = new Date(input.checkIn).getTime();
    const b = new Date(input.checkOut).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) netWorkMinutes = Math.round((b - a) / 60000);
  }

  // Determine composite status
  let status: AttendanceStatus;
  let badgeClass: string;
  if (isLate && overtimeMinutes > 0) {
    status = 'late_overtime';
    badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200';
  } else if (!isLate && overtimeMinutes > 0) {
    status = 'present_overtime';
    badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200';
  } else if (isLate) {
    status = 'late';
    badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200';
  } else if (earlyDepartureMinutes > 0 && input.checkOut) {
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
    lateMinutes,
    overtimeMinutes,
    earlyDepartureMinutes,
    netWorkMinutes,
    netWorkHours: fmtDuration(netWorkMinutes),
    badgeClass,
  };
}

/** Aggregated monthly totals per employee */
export interface MonthlyAggregate {
  userId: string;
  daysInMonth: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  earlyDeparture: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  totalOvertimeHours: string;
  totalWorkMinutes: number;
  totalWorkHours: string;
  attendanceRate: number; // 0-100
}

/** Build aggregates for a full month */
export function aggregateMonthly(
  days: { date: string; checkIn?: string | null; checkOut?: string | null; leaveType?: string | null }[],
  cfg: OfficeHoursConfig
): Omit<MonthlyAggregate, 'userId' | 'daysInMonth'> & { daysInMonth: number } {
  let present = 0;
  let late = 0;
  let absent = 0;
  let leave = 0;
  let earlyDeparture = 0;
  let totalLateMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalWorkMinutes = 0;

  days.forEach((d) => {
    const r = evaluateDailyAttendance({ checkIn: d.checkIn, checkOut: d.checkOut, leaveType: d.leaveType }, cfg);
    if (r.status === 'leave') leave += 1;
    else if (r.status === 'absent') absent += 1;
    else {
      present += 1;
      if (r.status === 'late' || r.status === 'late_overtime') late += 1;
      if (r.status === 'early_departure') earlyDeparture += 1;
    }
    totalLateMinutes += r.lateMinutes;
    totalOvertimeMinutes += r.overtimeMinutes;
    totalWorkMinutes += r.netWorkMinutes;
  });

  const attendanceRate = days.length ? Math.round((present / days.length) * 100) : 0;

  return {
    daysInMonth: days.length,
    present,
    late,
    absent,
    leave,
    earlyDeparture,
    totalLateMinutes,
    totalOvertimeMinutes,
    totalOvertimeHours: fmtDuration(totalOvertimeMinutes),
    totalWorkMinutes,
    totalWorkHours: fmtDuration(totalWorkMinutes),
    attendanceRate,
  };
}

// ─── Helpers for UI filtering ──────────────────────────────────────────

export function getDaysInMonth(year: number, month: number): string[] {
  // month 1-12
  const days = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

export function formatMonthAr(year: number, month: number): string {
  const arMonths = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];
  return `${arMonths[month - 1]} ${year}`;
}

export function formatMonthEn(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// For table filters
export function matchesAttendanceStatus(
  evaluatedStatus: AttendanceStatus,
  filter: string // 'all' | 'present' | 'late' | 'absent' | 'leave' | 'early_departure' etc
): boolean {
  if (filter === 'all') return true;
  if (filter === 'late') return evaluatedStatus === 'late' || evaluatedStatus === 'late_overtime';
  if (filter === 'present') return evaluatedStatus === 'present' || evaluatedStatus === 'present_overtime';
  if (filter === 'early') return evaluatedStatus === 'early_departure';
  if (filter === 'overtime') return evaluatedStatus === 'present_overtime' || evaluatedStatus === 'late_overtime';
  return evaluatedStatus === filter;
}

/** Late minutes calculation helper exposed for tests */
export function calcLateMinutes(checkInISO: string, cfg: OfficeHoursConfig): number {
  const m = minutesOfDayFromISO(checkInISO);
  if (m < 0 || m <= cfg.toleranceMinutes) return 0;
  return Math.max(0, m - cfg.startMinutes);
}

/** Overtime helper */
export function calcOvertimeMinutes(checkOutISO: string, cfg: OfficeHoursConfig): number {
  const m = minutesOfDayFromISO(checkOutISO);
  if (m < 0 || m <= cfg.endMinutes) return 0;
  return m - cfg.endMinutes;
}

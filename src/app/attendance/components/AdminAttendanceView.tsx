'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Clock,
  LogIn,
  LogOut,
  Loader2,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Plus,
  Pencil,
  Eye,
  Printer,
  Download,
  RefreshCw,
  Settings2,
  Save,
  Calendar,
  LayoutGrid,
  User,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { roleBadgeOf } from '@/lib/ui';
import { teamsService } from '@/lib/services/crmService';
import { companySettingsService, DEFAULT_WORKING_HOURS } from '@/lib/services/peopleOpsService';
import { buildOfficeHours, formatMinutes, type OfficeHoursConfig } from '@/lib/officeHours';
import {
  evaluateDailyAttendance,
  getDaysInMonth,
  formatMonthAr,
  formatMonthEn,
  officeCfgToAr,
  type AttendanceStatus,
} from '@/lib/attendanceLogic';
import { exportAttendancePDF } from '@/lib/attendancePdf';
import { exportCSV } from '@/lib/exportReport';
import ManualAttendanceModal from './ManualAttendanceModal';

interface AttendanceUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  team_id?: string | null;
}

interface AttendanceRecord {
  user_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
}

interface LeaveInfo {
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
}

interface TeamOption {
  id: string;
  name: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtHM(mins: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function durationSeconds(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 1000);
}

type ViewMode = 'overview' | 'individual' | 'daily';

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  all: { ar: 'الكل', en: 'All' },
  present: { ar: 'حاضر', en: 'Present' },
  late: { ar: 'متأخر', en: 'Late' },
  absent: { ar: 'غياب', en: 'Absent' },
  leave: { ar: 'إجازة', en: 'Leave' },
  early_departure: { ar: 'انصراف مبكر', en: 'Early Departure' },
};

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ─── Shift Settings Card ─────────────────────────────────────────────
function ShiftSettingsCard({
  cfg,
  onSave,
}: {
  cfg: OfficeHoursConfig;
  onSave: (next: OfficeHoursConfig) => void;
}) {
  const [start, setStart] = useState(cfg.start);
  const [end, setEnd] = useState(cfg.end);
  const [grace, setGrace] = useState(String(cfg.graceMinutes));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStart(cfg.start);
    setEnd(cfg.end);
    setGrace(String(cfg.graceMinutes));
  }, [cfg.start, cfg.end, cfg.graceMinutes]);

  const handleSave = async () => {
    const g = parseInt(grace, 10);
    if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end) || Number.isNaN(g) || g < 0 || g > 120) {
      toast.error('تحقق من صيغة الوقت (HH:MM) وفترة السماح 0–120');
      return;
    }
    setSaving(true);
    try {
      const ok = await companySettingsService.update('workingHours', {
        start,
        end,
        lateGraceMinutes: g,
        flexibleHours: cfg.flexibleHours,
        workdays: DEFAULT_WORKING_HOURS.workdays,
      });
      if (!ok) throw new Error('Save failed');
      const next = buildOfficeHours({ start, end, lateGraceMinutes: g, flexibleHours: cfg.flexibleHours });
      onSave(next);
      toast.success('تم حفظ إعدادات الوردية — سيُطبق المنطق الجديد فوراً');
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const graceCutoff = (() => {
    try {
      const mins = start.split(':').map(Number);
      const total = mins[0] * 60 + mins[1] + parseInt(grace || '0', 10);
      return formatMinutes(total);
    } catch { return '—'; }
  })();

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <Settings2 size={14} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">إعدادات الوردية — Interactive Shift</h3>
          <p className="text-xs text-muted-foreground">افتراضي: 12:00 م – 08:00 م (8 ساعات) · سماح 20 دقيقة حتى 12:20 م</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">بداية الوردية *</span>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all"
          />
          <span className="text-[11px] text-muted-foreground">Default: 12:00</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">نهاية الوردية *</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all"
          />
          <span className="text-[11px] text-muted-foreground">Default: 20:00 (8h)</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">فترة السماح (دقيقة) *</span>
          <input
            type="number"
            min={0}
            max={120}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all"
          />
          <span className="text-[11px] text-muted-foreground">Cutoff: {graceCutoff} · 20 دق افتراضي</span>
        </label>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
        <p className="text-xs text-muted-foreground">
          المنطق: 12:00–12:20 <span className="text-emerald-600 font-semibold">حاضر</span> · بعد 12:20 <span className="text-amber-600 font-semibold">متأخر</span> (يُحسب من 12:00) · بعد 20:00 <span className="text-emerald-600 font-semibold">إضافي</span> · قبل 20:00 <span className="text-orange-600 font-semibold">مبكر</span>
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ الإعدادات
        </button>
      </div>
    </div>
  );
}

export default function AdminAttendanceView() {
  // Month / Year picker (full month)
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState(() => todayLocal());

  const [users, setUsers] = useState<AttendanceUser[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [leaves, setLeaves] = useState<LeaveInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [manualOpen, setManualOpen] = useState(false);
  const [editUser, setEditUser] = useState<AttendanceUser | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [officeCfg, setOfficeCfg] = useState<OfficeHoursConfig>(() =>
    buildOfficeHours(DEFAULT_WORKING_HOURS)
  );

  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const monthFrom = daysInMonth[0];
  const monthTo = daysInMonth[daysInMonth.length - 1];
  const workingDays = daysInMonth.length;

  // Load data for selected month
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, teamsList, leavesRes] = await Promise.all([
        fetch(`/api/attendance/report?from=${monthFrom}&to=${monthTo}`, { cache: 'no-store' }),
        teamsService.getAll().then((rows) => rows.map((x) => ({ id: x.id, name: x.name }))).catch(() => [] as TeamOption[]),
        // best-effort leaves fetch (may not exist yet)
        fetch(`/api/leaves/list?from=${monthFrom}&to=${monthTo}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (!reportRes.ok) throw new Error('Failed to load attendance');
      const data = await reportRes.json();
      setUsers(data.users || []);
      setRecords(data.attendance || []);
      setTeams(teamsList);
      // try alternative leave endpoint
      let leaveData: LeaveInfo[] = [];
      if (leavesRes) {
        if (Array.isArray(leavesRes.leaves)) leaveData = leavesRes.leaves;
        else if (Array.isArray(leavesRes.data)) leaveData = leavesRes.data;
      } else {
        // fallback: try peopleOps leaveService directly
        try {
          const { leaveService } = await import('@/lib/services/peopleOpsService');
          const all = await leaveService.getAll();
          leaveData = all
            .filter((l: any) => l.status === 'approved')
            .map((l: any) => ({
              user_id: l.userId,
              start_date: l.startDate,
              end_date: l.endDate,
              leave_type: l.leaveType,
              status: l.status,
            }));
        } catch {}
      }
      setLeaves(leaveData);
      // auto-select first employee for individual view if none
      if (!selectedEmployeeId && data.users?.length) {
        setSelectedEmployeeId(data.users[0].id);
      }
      // clamp selectedDay inside month
      if (selectedDay < monthFrom || selectedDay > monthTo) setSelectedDay(monthFrom);
    } catch {
      toast.error('تعذر تحميل بيانات الحضور — حاول مجدداً');
    } finally {
      setLoading(false);
    }
  }, [monthFrom, monthTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  useEffect(() => {
    companySettingsService
      .getWorkingHours()
      .then((w) => setOfficeCfg(buildOfficeHours(w)))
      .catch(() => {});
  }, []);

  // Helpers: check if user on leave for a date
  const isOnLeave = useCallback(
    (userId: string, date: string): string | null => {
      for (const lv of leaves) {
        if (lv.user_id !== userId) continue;
        if (lv.status !== 'approved') continue;
        if (date >= lv.start_date && date <= lv.end_date) return lv.leave_type || 'إجازة';
      }
      return null;
    },
    [leaves]
  );

  const recordMap = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    records.forEach((r) => m.set(`${r.user_id}|${r.attendance_date}`, r));
    return m;
  }, [records]);

  const teamNameById = useMemo(() => {
    const mp = new Map<string, string>();
    teams.forEach((t) => mp.set(t.id, t.name));
    return mp;
  }, [teams]);

  const activeUsers = useMemo(() => users.filter((u) => u.is_active !== false), [users]);

  // ── Aggregated overview rows ────────────────────────────────────────
  const overviewRows = useMemo(() => {
    return activeUsers.map((u) => {
      const daily = daysInMonth.map((date) => {
        const rec = recordMap.get(`${u.id}|${date}`);
        const leaveType = isOnLeave(u.id, date);
        return {
          date,
          checkIn: rec?.check_in_time || null,
          checkOut: rec?.check_out_time || null,
          leaveType,
        };
      });
      let present = 0;
      let late = 0;
      let absent = 0;
      let leave = 0;
      let early = 0;
      let totalLate = 0;
      let totalOt = 0;
      let totalWork = 0;
      daily.forEach((d) => {
        const r = evaluateDailyAttendance({ checkIn: d.checkIn, checkOut: d.checkOut, leaveType: d.leaveType }, officeCfg);
        if (r.status === 'leave') leave += 1;
        else if (r.status === 'absent') absent += 1;
        else {
          present += 1;
          if (r.status === 'late' || r.status === 'late_overtime') late += 1;
          if (r.status === 'early_departure') early += 1;
        }
        totalLate += r.lateMinutes;
        totalOt += r.overtimeMinutes;
        totalWork += r.netWorkMinutes;
      });
      const rate = workingDays ? Math.round((present / workingDays) * 100) : 0;
      return {
        user: u,
        teamName: teamNameById.get(u.team_id || '') || '—',
        present,
        late,
        absent,
        leave,
        early,
        totalLate,
        totalOt,
        totalWork,
        rate,
        daily,
      };
    });
  }, [activeUsers, daysInMonth, recordMap, isOnLeave, officeCfg, teamNameById, workingDays]);

  // KPIs for current filtered set
  const filteredOverview = useMemo(() => {
    const q = search.toLowerCase().trim();
    return overviewRows.filter((r) => {
      if (q && !r.user.full_name.toLowerCase().includes(q) && !r.user.email.toLowerCase().includes(q) && !String(r.user.id).toLowerCase().includes(q)) return false;
      if (teamFilter !== 'all' && (r.user.team_id || '') !== teamFilter) return false;
      if (statusFilter !== 'all') {
        // for overview, filter by existence of that status in month
        const hasStatus = r.daily.some((d) => {
          const ev = evaluateDailyAttendance({ checkIn: d.checkIn, checkOut: d.checkOut, leaveType: d.leaveType }, officeCfg);
          if (statusFilter === 'late') return ev.status === 'late' || ev.status === 'late_overtime';
          if (statusFilter === 'present') return ev.status === 'present' || ev.status === 'present_overtime';
          return ev.status === statusFilter;
        });
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [overviewRows, search, teamFilter, statusFilter, officeCfg]);

  const kpis = useMemo(() => {
    const totalPresent = filteredOverview.reduce((s, r) => s + r.present, 0);
    const expected = filteredOverview.length * workingDays || 1;
    const rate = expected ? Math.round((totalPresent / expected) * 100) : 0;
    const totalDelay = filteredOverview.reduce((s, r) => s + r.totalLate, 0);
    const totalOt = filteredOverview.reduce((s, r) => s + r.totalOt, 0);
    return {
      totalPresent,
      rate,
      totalDelay,
      totalOt,
      totalOtHours: fmtHM(totalOt),
    };
  }, [filteredOverview, workingDays]);

  // ── Individual timesheet ────────────────────────────────────────────
  const individualData = useMemo(() => {
    const u = activeUsers.find((x) => x.id === selectedEmployeeId) || activeUsers[0];
    if (!u) return null;
    const rows = daysInMonth.map((date, idx) => {
      const rec = recordMap.get(`${u.id}|${date}`);
      const leaveType = isOnLeave(u.id, date);
      const ev = evaluateDailyAttendance({ checkIn: rec?.check_in_time || null, checkOut: rec?.check_out_time || null, leaveType }, officeCfg);
      return {
        idx: idx + 1,
        date,
        rec,
        leaveType,
        ev,
      };
    });
    const agg = overviewRows.find((r) => r.user.id === u.id);
    return { user: u, rows, agg };
  }, [activeUsers, selectedEmployeeId, daysInMonth, recordMap, isOnLeave, officeCfg, overviewRows]);

  // ── Daily sheet ─────────────────────────────────────────────────────
  const dailyRows = useMemo(() => {
    return activeUsers
      .map((u) => {
        const rec = recordMap.get(`${u.id}|${selectedDay}`);
        const leaveType = isOnLeave(u.id, selectedDay);
        const ev = evaluateDailyAttendance({ checkIn: rec?.check_in_time || null, checkOut: rec?.check_out_time || null, leaveType }, officeCfg);
        return {
          user: u,
          teamName: teamNameById.get(u.team_id || '') || '—',
          rec,
          leaveType,
          ev,
        };
      })
      .filter((r) => {
        const q = search.toLowerCase().trim();
        if (q && !r.user.full_name.toLowerCase().includes(q) && !r.user.email.toLowerCase().includes(q) && !String(r.user.id).toLowerCase().includes(q)) return false;
        if (teamFilter !== 'all' && (r.user.team_id || '') !== teamFilter) return false;
        if (statusFilter !== 'all') {
          if (statusFilter === 'late') return r.ev.status === 'late' || r.ev.status === 'late_overtime';
          if (statusFilter === 'present') return r.ev.status === 'present' || r.ev.status === 'present_overtime';
          return r.ev.status === statusFilter;
        }
        return true;
      });
  }, [activeUsers, selectedDay, recordMap, isOnLeave, officeCfg, teamNameById, search, teamFilter, statusFilter]);

  // ── PDF Handlers ────────────────────────────────────────────────────
  const pdfHeaders = [
    '# (م)',
    'كود الموظف',
    'اسم الموظف',
    'القسم / الفريق',
    'وقت الحضور',
    'توقيع الحضور',
    'وقت الانصراف',
    'توقيع الانصراف',
    'ساعات العمل الفعلية',
    'تأخير بالدقائق',
    'إضافي بالساعات',
    'الحالة',
    'ملاحظات / أذونات',
  ];

  const handleExportPDF = () => {
    const meta = {
      companyName: 'Brokly CRM',
      branchName: '',
      monthYearAr: formatMonthAr(year, month),
      monthYearEn: formatMonthEn(year, month),
      officeCfg,
      headcount: filteredOverview.length,
      workingDays,
    };
    const kpiList = [
      { label: 'إجمالي أيام العمل', value: String(workingDays) },
      { label: 'معدل الحضور %', value: `${kpis.rate}%` },
      { label: 'إجمالي التأخير (دقيقة)', value: String(kpis.totalDelay) },
      { label: 'إجمالي الإضافي (ساعة)', value: kpis.totalOtHours },
    ];

    if (viewMode === 'overview') {
      const rows = filteredOverview.map((r, i) => [
        String(i + 1),
        String(r.user.id).slice(0, 8),
        r.user.full_name || r.user.email,
        r.teamName,
        '—',
        '',
        '—',
        '',
        fmtHM(r.totalWork),
        String(r.totalLate),
        fmtHM(r.totalOt),
        `${r.present} حاضر · ${r.late} متأخر · ${r.absent} غياب · ${r.leave} إجازة`,
        r.leave > 0 ? `${r.leave} إجازة` : '',
      ]);
      exportAttendancePDF({
        meta,
        kpis: kpiList,
        tables: [{ headers: pdfHeaders, rows, captionAr: `الملخص الشهري المجمع — ${formatMonthAr(year, month)}`, captionEn: `Team Monthly Overview — ${formatMonthEn(year, month)}` }],
        orientation: 'landscape',
        filename: `attendance-overview-${year}-${pad(month)}`,
      });
      // also CSV
      exportCSV(`attendance-overview-${year}-${pad(month)}`, pdfHeaders, rows);
    } else if (viewMode === 'individual' && individualData) {
      const u = individualData.user;
      const rows = individualData.rows.map((d) => [
        String(d.idx),
        String(u.id).slice(0, 8),
        u.full_name || u.email,
        teamNameById.get(u.team_id || '') || '—',
        d.rec?.check_in_time ? fmtTime(d.rec.check_in_time) : '—',
        '',
        d.rec?.check_out_time ? fmtTime(d.rec.check_out_time) : '—',
        '',
        d.ev.netWorkHours,
        String(d.ev.lateMinutes),
        fmtHM(d.ev.overtimeMinutes),
        d.ev.statusAr,
        d.leaveType || '',
      ]);
      const indKpi = [
        { label: 'أيام الحضور', value: String(individualData.agg?.present ?? 0) },
        { label: 'أيام الغياب', value: String(individualData.agg?.absent ?? 0) },
        { label: 'إجمالي التأخير', value: fmtHM(individualData.agg?.totalLate || 0) },
        { label: 'إجمالي الإضافي', value: fmtHM(individualData.agg?.totalOt || 0) },
      ];
      exportAttendancePDF({
        meta: { ...meta, headcount: 1 },
        kpis: indKpi,
        tables: [{ headers: pdfHeaders, rows, captionAr: `كشف مفصل — ${u.full_name || u.email} — ${formatMonthAr(year, month)}`, captionEn: `Individual Timesheet — ${u.full_name || u.email}` }],
        orientation: 'landscape',
        filename: `attendance-individual-${u.full_name || u.id}-${year}-${pad(month)}`,
      });
      exportCSV(`attendance-individual-${u.id}-${year}-${pad(month)}`, pdfHeaders, rows);
    } else if (viewMode === 'daily') {
      const rows = dailyRows.map((r, i) => [
        String(i + 1),
        String(r.user.id).slice(0, 8),
        r.user.full_name || r.user.email,
        r.teamName,
        r.rec?.check_in_time ? fmtTime(r.rec.check_in_time) : '—',
        '',
        r.rec?.check_out_time ? fmtTime(r.rec.check_out_time) : '—',
        '',
        r.ev.netWorkHours,
        String(r.ev.lateMinutes),
        fmtHM(r.ev.overtimeMinutes),
        r.ev.statusAr,
        r.leaveType || '',
      ]);
      const dayKpi = [
        { label: 'الحاضرون', value: String(dailyRows.filter((r) => r.ev.status !== 'absent' && r.ev.status !== 'leave').length) },
        { label: 'الغائبون', value: String(dailyRows.filter((r) => r.ev.status === 'absent').length) },
        { label: 'المتأخرون', value: String(dailyRows.filter((r) => r.ev.status === 'late' || r.ev.status === 'late_overtime').length) },
        { label: 'الإضافي اليوم', value: fmtHM(dailyRows.reduce((s, r) => s + r.ev.overtimeMinutes, 0)) },
      ];
      exportAttendancePDF({
        meta: {
          companyName: 'Brokly CRM',
          branchName: `اليوم: ${selectedDay}`,
          monthYearAr: formatMonthAr(year, month),
          monthYearEn: selectedDay,
          officeCfg,
          headcount: dailyRows.length,
          workingDays: 1,
        },
        kpis: dayKpi,
        tables: [{ headers: pdfHeaders, rows, captionAr: `كشف يومي — ${selectedDay}`, captionEn: `Daily Shift Sheet — ${selectedDay}` }],
        orientation: 'landscape',
        filename: `attendance-daily-${selectedDay}`,
      });
      exportCSV(`attendance-daily-${selectedDay}`, pdfHeaders, rows);
    }
    toast.success('تم إنشاء تقرير PDF — نافذة الطباعة جاهزة');
  };

  // Quick check-in/out for daily view
  const handleQuickAction = async (action: 'checkin' | 'checkout', user: AttendanceUser, date: string) => {
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId: user.id, date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      toast.success(action === 'checkin' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف');
      setReloadTick((t) => t + 1);
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarCheck2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">سجل الحضور والانصراف — دوام رسمي</h1>
            <p className="text-sm text-muted-foreground" dir="rtl">
              وردية {officeCfg.start}–{officeCfg.end} · السماح حتى {formatMinutes(officeCfg.toleranceMinutes)} · {officeCfgToAr(officeCfg)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Attendance & Departure Log — Official Shift · {formatMonthEn(year, month)} · {activeUsers.length} staff</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors"
          >
            <Printer size={16} /> تصدير PDF
          </button>
          <button
            onClick={() => setManualOpen(true)}
            className="h-10 px-4 rounded-xl border border-border bg-card text-foreground text-sm font-semibold flex items-center gap-2 hover:bg-muted transition-colors"
          >
            <Plus size={16} /> إضافة يدوية
          </button>
          <button onClick={() => setReloadTick((t) => t + 1)} className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Shift Settings */}
      <ShiftSettingsCard cfg={officeCfg} onSave={setOfficeCfg} />

      {/* Month / View Controls */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
            <Calendar size={16} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">الشهر / السنة</p>
            <p className="text-xs text-muted-foreground">{formatMonthAr(year, month)} — {formatMonthEn(year, month)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none"
            >
              {MONTHS_AR.map((m, idx) => (
                <option key={MONTHS_AR[idx]} value={idx + 1}>{m}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>
          <div className="relative w-[110px]">
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none"
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>
          <input
            type="month"
            value={`${year}-${pad(month)}`}
            onChange={(e) => {
              const [yy, mm] = e.target.value.split('-').map(Number);
              if (yy && mm) { setYear(yy); setMonth(mm); }
            }}
            className="hidden sm:block bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
          />
        </div>

        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1">
          {([
            ['overview', 'الملخص الشهري', 'نظرة شاملة', LayoutGrid],
            ['individual', 'كشف فردي', 'يوم بيوم', User],
            ['daily', 'كشف يومي', 'لقطة يوم', CalendarCheck2],
          ] as [ViewMode, string, string, any][]).map(([k, ar, en, Icon]) => (
            <button
              key={k}
              onClick={() => setViewMode(k)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === k ? 'bg-lime-500 text-zinc-950 shadow-sm border border-lime-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800'
              }`}
            >
              <Icon size={13} /> <span>{ar}</span> <span className="hidden sm:inline opacity-60 font-normal">{en}</span>
            </button>
          ))}
        </div>

        {viewMode === 'individual' && (
          <div className="flex items-center gap-2 min-w-[220px] flex-1">
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="flex-1 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none"
            >
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          </div>
        )}
        {viewMode === 'daily' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDay}
              min={monthFrom}
              max={monthTo}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
            />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Working Days', labelAr: 'أيام العمل', value: String(workingDays), icon: <Calendar size={14} className="text-muted-foreground" /> },
          { label: 'Attendance Rate', labelAr: 'معدل الحضور', value: `${kpis.rate}%`, icon: <CheckCircle2 size={14} className="text-emerald-600" /> },
          { label: 'Total Delay (Minutes)', labelAr: 'التأخير (دقيقة)', value: String(kpis.totalDelay), icon: <AlertTriangle size={14} className="text-amber-600" /> },
          { label: 'Total Overtime (Hours)', labelAr: 'الإضافي (ساعة)', value: kpis.totalOtHours, icon: <Timer size={14} className="text-violet-600" /> },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-lg font-black text-foreground">{k.value}</p>
              {k.icon}
            </div>
            <p className="text-xs font-semibold text-foreground">{k.labelAr}</p>
            <p className="text-[10px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الكود / Live search…"
            className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all"
          />
        </div>
        <div className="relative">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none min-w-[150px]"
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none min-w-[150px]"
          >
            <option value="all">All Statuses — الكل</option>
            <option value="present">Present — حاضر</option>
            <option value="late">Late — متأخر</option>
            <option value="absent">Absent — غياب</option>
            <option value="leave">Leave — إجازة</option>
            <option value="early_departure">Early — انصراف مبكر</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <span className="text-xs text-muted-foreground">{viewMode === 'overview' ? `${filteredOverview.length} موظف` : viewMode === 'daily' ? `${dailyRows.length} موظف` : individualData ? `${daysInMonth.length} يوم` : ''}</span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : viewMode === 'overview' ? (
        filteredOverview.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-16 text-center">
            <Users size={24} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">لا توجد بيانات مطابقة للفلاتر</p>
            <p className="text-xs text-muted-foreground mt-1">جرب تغيير الشهر أو الفلتر</p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-3 text-right text-xs font-bold text-muted-foreground">#</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-muted-foreground">الموظف</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-muted-foreground">الفريق</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">حاضر</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">غياب</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">إجازة</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">تأخير (د)</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">إضافي</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">ساعات العمل</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">المعدل</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOverview.map((r, i) => (
                    <tr key={r.user.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {(r.user.full_name || r.user.email).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground truncate max-w-[160px]">{r.user.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{String(r.user.id).slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs"><span className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-full">{r.teamName}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="text-sm font-bold text-emerald-600">{r.present}</span><span className="text-xs text-muted-foreground">/{workingDays}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="text-sm font-bold text-red-600">{r.absent}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="text-sm font-medium text-sky-600">{r.leave}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className={`text-sm font-bold ${r.totalLate > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{r.totalLate}m</span></td>
                      <td className="px-3 py-2.5 text-center"><span className={`text-sm font-bold ${r.totalOt > 0 ? 'text-violet-600' : 'text-muted-foreground'}`}>{fmtHM(r.totalOt)}</span></td>
                      <td className="px-3 py-2.5 text-center text-sm font-semibold">{fmtHM(r.totalWork)}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold border ${r.rate >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.rate >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{r.rate}%</span></td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setViewMode('individual'); setSelectedEmployeeId(r.user.id); }} className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center" title="كشف فردي"><Eye size={14} /></button>
                          <button onClick={() => { setEditUser(r.user); }} className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center" title="تعديل"><Pencil size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards for overview */}
            <div className="lg:hidden space-y-3">
              {filteredOverview.map((r, i) => (
                <div key={r.user.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{(r.user.full_name || r.user.email).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{r.user.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{r.teamName} · {String(r.user.id).slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${r.rate >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.rate >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{r.rate}% حضور</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/40 rounded-xl p-2"><p className="text-xs text-muted-foreground">حاضر</p><p className="text-sm font-black text-emerald-600">{r.present}/{workingDays}</p></div>
                    <div className="bg-muted/40 rounded-xl p-2"><p className="text-xs text-muted-foreground">تأخير</p><p className="text-sm font-black text-amber-600">{r.totalLate}m</p></div>
                    <div className="bg-muted/40 rounded-xl p-2"><p className="text-xs text-muted-foreground">إضافي</p><p className="text-sm font-black text-violet-600">{fmtHM(r.totalOt)}</p></div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setViewMode('individual'); setSelectedEmployeeId(r.user.id); }} className="flex-1 h-9 rounded-xl border border-border bg-card text-sm font-semibold flex items-center justify-center gap-1.5"><Eye size={14} /> كشف</button>
                    <button onClick={() => setEditUser(r.user)} className="flex-1 h-9 rounded-xl border border-border bg-card text-sm font-semibold flex items-center justify-center gap-1.5"><Pencil size={14} /> تعديل</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      ) : viewMode === 'individual' && individualData ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold">{(individualData.user.full_name || individualData.user.email).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div>
                <p className="text-sm font-bold text-foreground">{individualData.user.full_name || individualData.user.email} — {teamNameById.get(individualData.user.team_id || '') || '—'}</p>
                <p className="text-xs text-muted-foreground">{formatMonthAr(year, month)} · {workingDays} يوم · {individualData.agg?.present ?? 0} حاضر · {individualData.agg?.totalLate ?? 0} د تأخير · {fmtHM(individualData.agg?.totalOt || 0)} إضافي</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-muted px-2 py-1 rounded-full">{individualData.agg?.rate ?? 0}% حضور</span>
              <button onClick={() => handleExportPDF()} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><Download size={12} /> PDF فردي</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {['#','اليوم','التاريخ','الحضور','الانصراف','صافي العمل','تأخير','إضافي','الحالة','ملاحظات'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {individualData.rows.map((d) => (
                  <tr key={d.date} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.idx}</td>
                    <td className="px-3 py-2 text-xs">{new Date(d.date).toLocaleDateString('ar-EG', { weekday: 'short' })}</td>
                    <td className="px-3 py-2 text-xs font-mono">{d.date.slice(5)}</td>
                    <td className="px-3 py-2 text-xs">{d.rec?.check_in_time ? fmtTime(d.rec.check_in_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs">{d.rec?.check_out_time ? fmtTime(d.rec.check_out_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs font-semibold">{d.ev.netWorkHours}</td>
                    <td className="px-3 py-2 text-xs"><span className={d.ev.lateMinutes ? 'text-amber-600 font-bold' : 'text-muted-foreground'}>{d.ev.lateMinutes ? `${d.ev.lateMinutes}m` : '—'}</span></td>
                    <td className="px-3 py-2 text-xs"><span className={d.ev.overtimeMinutes ? 'text-violet-600 font-bold' : 'text-muted-foreground'}>{d.ev.overtimeMinutes ? fmtHM(d.ev.overtimeMinutes) : '—'}</span></td>
                    <td className="px-3 py-2"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold border ${d.ev.badgeClass}`}>{d.ev.statusAr}</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.leaveType || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'daily' ? (
        dailyRows.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-12 text-center">
            <CalendarCheck2 size={22} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">لا توجد بيانات لهذا اليوم</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {['#','كود','الموظف','القسم','حضور','توقيع','انصراف','توقيع','صافي','تأخير','إضافي','الحالة','ملاحظات'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dailyRows.map((r, i) => (
                  <tr key={r.user.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 text-xs font-mono">{String(r.user.id).slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{(r.user.full_name || r.user.email).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div>
                        <span className="text-sm font-semibold truncate max-w-[130px]">{r.user.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs"><span className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-full">{r.teamName}</span></td>
                    <td className="px-3 py-2 text-xs">{r.rec?.check_in_time ? fmtTime(r.rec.check_in_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-xs">{r.rec?.check_out_time ? fmtTime(r.rec.check_out_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-xs font-semibold">{r.ev.netWorkHours}</td>
                    <td className="px-3 py-2 text-xs"><span className={r.ev.lateMinutes ? 'text-amber-600 font-bold' : 'text-muted-foreground'}>{r.ev.lateMinutes ? `${r.ev.lateMinutes}m` : '—'}</span></td>
                    <td className="px-3 py-2 text-xs"><span className={r.ev.overtimeMinutes ? 'text-violet-600 font-bold' : 'text-muted-foreground'}>{r.ev.overtimeMinutes ? fmtHM(r.ev.overtimeMinutes) : '—'}</span></td>
                    <td className="px-3 py-2"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold border ${r.ev.badgeClass}`}>{r.ev.statusAr}</span></td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-xs truncate max-w-[100px]">{r.leaveType || ''}</span>
                        {selectedDay === todayLocal() && !r.rec?.check_in_time ? (
                          <button onClick={() => handleQuickAction('checkin', r.user, selectedDay)} className="h-6 px-2 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">حضور</button>
                        ) : selectedDay === todayLocal() && r.rec?.check_in_time && !r.rec?.check_out_time ? (
                          <button onClick={() => handleQuickAction('checkout', r.user, selectedDay)} className="h-6 px-2 rounded-full border border-border text-[11px] font-bold">انصراف</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {manualOpen && (
        <ManualAttendanceModal
          users={users}
          defaultDate={viewMode === 'daily' ? selectedDay : monthFrom}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            setManualOpen(false);
            setReloadTick((t) => t + 1);
          }}
        />
      )}
      {editUser && (
        <ManualAttendanceModal
          users={users}
          defaultDate={viewMode === 'daily' ? selectedDay : monthFrom}
          editUserId={editUser.id}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            setReloadTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

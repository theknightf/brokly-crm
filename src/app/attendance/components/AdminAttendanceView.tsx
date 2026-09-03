'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Clock,
  Loader2,
  Search,
  Users,
  CheckCircle2,
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
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { teamsService } from '@/lib/services/crmService';
import { companySettingsService, DEFAULT_WORKING_HOURS } from '@/lib/services/peopleOpsService';
import { buildOfficeHours, formatMinutes } from '@/lib/officeHours';
import {
  evaluateDailyAttendance,
  getDaysInMonth,
  formatMonthAr,
  formatMonthEn,
  DEFAULT_SHIFTS,
  getShiftForUser,
  getEffectiveShiftForTeam,
  getEffectiveShiftForUserWithAdjustments,
  officeCfgToAr,
  type ShiftConfig,
  type Permission,
  type TeamShiftAdjustment,
} from '@/lib/attendanceLogic';
import { exportAttendancePDF } from '@/lib/attendancePdf';
import { exportCSV } from '@/lib/exportReport';
import { attendancePermissionsService } from '@/lib/attendancePermissionsService';
import { teamShiftAdjustmentsService } from '@/lib/teamShiftAdjustmentsService';
import ManualAttendanceModal from './ManualAttendanceModal';
import LeavePermissionModal from './LeavePermissionModal';
import TeamShiftDelayModal from './TeamShiftDelayModal';

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
interface TeamOption { id: string; name: string }

function pad(n: number): string { return String(n).padStart(2,'0'); }
function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}
function fmtHM(mins: number): string {
  if (!mins || mins<=0) return '—';
  const h=Math.floor(mins/60), m=mins%60;
  if (h>0) return `${h}h ${m}m`;
  return `${m}m`;
}
type ViewMode = 'overview' | 'individual' | 'daily';
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ─── Multi-Shift Settings Card ───────────────────────────────────────
function MultiShiftSettingsCard({ shifts, onSave }: { shifts: ShiftConfig[]; onSave: (next: ShiftConfig[])=>void }) {
  const [s1, setS1] = useState(shifts[0] || DEFAULT_SHIFTS[0]);
  const [s2, setS2] = useState(shifts[1] || DEFAULT_SHIFTS[1]);
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ setS1(shifts[0]||DEFAULT_SHIFTS[0]); setS2(shifts[1]||DEFAULT_SHIFTS[1]); }, [shifts]);

  const handleSave = async () => {
    const g1 = Number(s1.graceMinutes), g2 = Number(s2.graceMinutes);
    if (!/^\d{1,2}:\d{2}$/.test(s1.start) || !/^\d{1,2}:\d{2}$/.test(s1.end) || !/^\d{1,2}:\d{2}$/.test(s2.start) || !/^\d{1,2}:\d{2}$/.test(s2.end) || [g1,g2].some(n=> Number.isNaN(n)||n<0||n>120)) {
      toast.error('تحقق من صيغة الوقت (HH:MM) وفترة السماح 0–120');
      return;
    }
    setSaving(true);
    try {
      const payload = [
        { id:'shift1', start:s1.start, end:s1.end, graceMinutes:g1, labelAr:s1.labelAr, labelEn:s1.labelEn, teamNames: DEFAULT_SHIFTS[0].teamNames },
        { id:'shift2', start:s2.start, end:s2.end, graceMinutes:g2, labelAr:s2.labelAr, labelEn:s2.labelEn, teamNames: DEFAULT_SHIFTS[1].teamNames },
      ];
      // Save as attendanceShifts + also keep workingHours for backward compat (shift1)
      await companySettingsService.update('attendanceShifts', { shifts: payload } as any);
      await companySettingsService.update('workingHours', { start:s1.start, end:s1.end, lateGraceMinutes:g1, flexibleHours:false, workdays: DEFAULT_WORKING_HOURS.workdays } as any);
      const nextShifts: ShiftConfig[] = payload.map((p)=> {
        const cfg = buildOfficeHours({ start:p.start, end:p.end, lateGraceMinutes:p.graceMinutes });
        return { ...cfg, id:p.id, labelAr:p.labelAr, labelEn:p.labelEn, teamNames:p.teamNames };
      });
      onSave(nextShifts);
      toast.success('تم حفظ الورديات — سيُطبق المنطق الجديد فوراً');
    } catch(e:any){ toast.error(e?.message||'فشل حفظ الورديات'); } finally{ setSaving(false); }
  };

  const ShiftRow = ({ shift, setShift, title, subtitle }: any) => (
    <div className="rounded-xl border border-border p-3 bg-muted/20">
      <p className="text-xs font-bold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-2">{subtitle} — {shift.teamNames.join(', ')}</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground">البداية</span>
          <input type="time" value={shift.start} onChange={(e)=> setShift({...shift, start:e.target.value})} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-2 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground">النهاية</span>
          <input type="time" value={shift.end} onChange={(e)=> setShift({...shift, end:e.target.value})} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-2 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground">سماح (د)</span>
          <input type="number" min={0} max={120} value={String(shift.graceMinutes)} onChange={(e)=> setShift({...shift, graceMinutes: parseInt(e.target.value||'0',10)})} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-2 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Cutoff: {formatMinutes(shift.toleranceMinutes)} · إضافي بعد {shift.end}</p>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center"><Settings2 size={14} /></div>
        <div>
          <h3 className="text-sm font-bold text-foreground">إعدادات الورديات — Multi-Shift Assignment Engine</h3>
           <p className="text-xs text-muted-foreground">وردية قياسية 12:00–20:00 ومسائية 13:00–21:00 — سماح 20د لكل وردية</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ShiftRow shift={s1} setShift={setS1} title="الوردية القياسية — Shift 1" subtitle="Sales, Admin, Operations" />
        <ShiftRow shift={s2} setShift={setS2} title="الوردية المسائية — Shift 2" subtitle="Support, Evening Team" />
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
        <p className="text-xs text-muted-foreground">المنطق: ضمن 20د = <span className="text-emerald-600 font-bold">حاضر</span> · بعدها <span className="text-amber-600 font-bold">متأخر</span> من بداية الوردية · إذن يخصم الصافي · قبل نهاية الوردية = <span className="text-orange-600 font-bold">مبكر</span> · بعد النهاية = <span className="text-violet-600 font-bold">إضافي</span></p>
        <button onClick={handleSave} disabled={saving} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"><Save size={14} />{saving ? '...': 'حفظ الورديات'}</button>
      </div>
    </div>
  );
}

export default function AdminAttendanceView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()+1);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState(()=> todayLocal());
  const [users, setUsers] = useState<AttendanceUser[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [leaves, setLeaves] = useState<LeaveInfo[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState<'all'|'shift1'|'shift2'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [manualOpen, setManualOpen] = useState(false);
  const [leavePermOpen, setLeavePermOpen] = useState(false);
  const [leavePermUserId, setLeavePermUserId] = useState<string|undefined>(undefined);
  const [leavePermDate, setLeavePermDate] = useState<string|undefined>(undefined);
  const [editUser, setEditUser] = useState<AttendanceUser|null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [shifts, setShifts] = useState<ShiftConfig[]>(()=> DEFAULT_SHIFTS);
  const [shiftAdjustments, setShiftAdjustments] = useState<TeamShiftAdjustment[]>([]);
  const [teamShiftModalOpen, setTeamShiftModalOpen] = useState(false);

  const daysInMonth = useMemo(()=> getDaysInMonth(year, month), [year, month]);
  const monthFrom = daysInMonth[0];
  const monthTo = daysInMonth[daysInMonth.length-1];
  const workingDays = daysInMonth.length;

  const load = useCallback(async ()=>{
    setLoading(true);
    try {
      const [reportRes, teamsList] = await Promise.all([
        fetch(`/api/attendance/report?from=${monthFrom}&to=${monthTo}`, { cache:'no-store' }),
        teamsService.getAll().then(rows=> rows.map(x=> ({id:x.id, name:x.name}))).catch(()=>[] as TeamOption[]),
      ]);
      if (!reportRes.ok) throw new Error('Failed');
      const data = await reportRes.json();
      setUsers(data.users||[]);
      setRecords(data.attendance||[]);
      setTeams(teamsList);
      // leaves, permissions & team shift adjustments parallel
      const [leaveData, permData, shiftAdjs] = await Promise.all([
        (async ()=> {
          try {
            const { leaveService } = await import('@/lib/services/peopleOpsService');
            const all = await leaveService.getAll();
            return all.filter((l:any)=> l.status==='approved').map((l:any)=> ({ user_id:l.userId, start_date:l.startDate, end_date:l.endDate, leave_type:l.leaveType, status:l.status }));
          } catch { return [] as LeaveInfo[]; }
        })(),
        (async ()=> {
          try {
            const res = await fetch(`/api/attendance/permissions?from=${monthFrom}&to=${monthTo}`, {cache:'no-store'});
            if (res.ok) {
              const j = await res.json();
              const arr = j.permissions || j.data || [];
              return arr.map((r:any)=> ({ id:r.id, userId:r.user_id || r.userId, date:r.date, type:r.type, excusedMinutes:Number(r.excused_minutes||r.excusedMinutes||0), reason:r.reason||'', status:r.status||'approved' } as Permission));
            }
          } catch {}
          try {
            return await attendancePermissionsService.getForRange(monthFrom, monthTo);
          } catch { return [] as Permission[]; }
        })(),
        (async ()=> {
          try {
            const adjs = await teamShiftAdjustmentsService.getAll();
            return adjs as TeamShiftAdjustment[];
          } catch { return [] as TeamShiftAdjustment[]; }
        })(),
      ]);
      setLeaves(leaveData as any);
      setPermissions(permData as any);
      setShiftAdjustments(shiftAdjs as any);
      if (!selectedEmployeeId && data.users?.length) setSelectedEmployeeId(data.users[0].id);
      if (selectedDay < monthFrom || selectedDay > monthTo) setSelectedDay(monthFrom);
    } catch { toast.error('تعذر تحميل بيانات الحضور'); } finally { setLoading(false); }
  }, [monthFrom, monthTo]);

  useEffect(()=>{ load(); }, [load, reloadTick]);
  useEffect(()=> {
    // load shifts from company_settings
    (async ()=>{
      try {
        const raw = await companySettingsService.get('attendanceShifts');
        if (raw && Array.isArray((raw as any).shifts)) {
          const arr = (raw as any).shifts as any[];
          const next: ShiftConfig[] = arr.map((p:any)=>{
            const cfg = buildOfficeHours({ start:p.start, end:p.end, lateGraceMinutes:p.graceMinutes });
            return { ...cfg, id:p.id, labelAr:p.labelAr, labelEn:p.labelEn, teamNames:p.teamNames };
          });
          if (next.length===2) setShifts(next);
        } else {
          const w = await companySettingsService.getWorkingHours();
          const base = buildOfficeHours(w);
          // keep shift2 default, override shift1 with saved workingHours
          setShifts([
            { ...base, id:'shift1', labelAr:'الوردية القياسية', labelEn:'Standard Shift', teamNames: DEFAULT_SHIFTS[0].teamNames },
            DEFAULT_SHIFTS[1],
          ]);
        }
      } catch {}
    })();
  }, []);

  const teamNameById = useMemo(()=> {
    const mp = new Map<string,string>();
    teams.forEach(t=> mp.set(t.id, t.name));
    return mp;
  }, [teams]);

  const activeUsers = useMemo(()=> users.filter(u=> u.is_active!==false), [users]);

  const isOnLeave = useCallback((userId:string, date:string): string|null=>{
    for(const lv of leaves){
      if (lv.user_id!==userId) continue;
      if (lv.status!=='approved') continue;
      if (date>=lv.start_date && date<=lv.end_date) return lv.leave_type||'annual';
    }
    return null;
  }, [leaves]);

  const permsByUserDate = useMemo(()=> {
    const m = new Map<string, Permission[]>();
    permissions.forEach(p=>{
      const k = `${p.userId}|${p.date}`;
      const arr = m.get(k)||[];
      arr.push(p);
      m.set(k, arr);
    });
    return m;
  }, [permissions]);

  const recordMap = useMemo(()=> {
    const m = new Map<string, AttendanceRecord>();
    records.forEach(r=> m.set(`${r.user_id}|${r.attendance_date}`, r));
    return m;
  }, [records]);

  // ── Overview with multi-shift + permissions + team shift delays ────────
  const overviewRows = useMemo(()=> {
    return activeUsers.map(u=>{
      const baseShift = getShiftForUser(u, teamNameById, shifts);
      const teamName = teamNameById.get(u.team_id||'')||'';
      const daily = daysInMonth.map(date=>{
        const rec = recordMap.get(`${u.id}|${date}`);
        const leaveType = isOnLeave(u.id, date);
        const perms = permsByUserDate.get(`${u.id}|${date}`) || [];
        const shift = getEffectiveShiftForTeam(teamName, u.team_id||null, date, shifts, shiftAdjustments);
        const hasDelay = shift.start !== baseShift.start || shift.end !== baseShift.end;
        return { date, checkIn: rec?.check_in_time||null, checkOut: rec?.check_out_time||null, leaveType, permissions: perms, shift, baseShift, hasDelay };
      });
      let present=0, late=0, absent=0, leave=0, early=0, permCover=0, totalNetLate=0, totalOt=0, totalWork=0, permCount=0, leaveCount=0;
      daily.forEach(d=>{
        const r = evaluateDailyAttendance({ checkIn:d.checkIn, checkOut:d.checkOut, leaveType:d.leaveType, permissions:d.permissions }, d.shift);
        if (r.status==='leave') { leave+=1; leaveCount+=1; }
        else if (r.status==='absent') absent+=1;
        else {
          present+=1;
          if (r.status==='late' || r.status==='late_overtime') late+=1;
          if (r.status==='early_departure') early+=1;
          if (r.status==='permission') permCover+=1;
        }
        totalNetLate += r.netLateMinutes;
        totalOt += r.overtimeMinutes;
        totalWork += r.netWorkMinutes;
        if (d.permissions?.length) permCount+=1;
      });
      const rate = workingDays ? Math.round((present/workingDays)*100):0;
      const teamLabel = teamNameById.get(u.team_id||'')||'—';
      const resolvedShift = getShiftForUser(u, teamNameById, shifts);
      // Check if team has any delay in this month (for badge)
      const hasTeamDelay = daily.some(d=> d.hasDelay);
      const delayReason = hasTeamDelay ? (shiftAdjustments.find(a=> (a.teamId ? a.teamId===u.team_id : (a.teamName||'').toLowerCase()===teamLabel.toLowerCase()) && (a.isTemporary ? daysInMonth.includes(a.date||'') : true))?.reason || '') : '';
      return { user:u, teamName: teamLabel, shift: resolvedShift, present, late, absent, leave, early, permCover, totalNetLate, totalOt, totalWork, rate, daily, permCount, leaveCount, hasTeamDelay, delayReason };
    });
  }, [activeUsers, daysInMonth, recordMap, isOnLeave, permsByUserDate, shifts, teamNameById, workingDays, shiftAdjustments]);

  const filteredOverview = useMemo(()=>{
    const q = search.toLowerCase().trim();
    return overviewRows.filter(r=>{
      if (q && !r.user.full_name.toLowerCase().includes(q) && !r.user.email.toLowerCase().includes(q)) return false;
      if (teamFilter!=='all' && (r.user.team_id||'')!==teamFilter) return false;
      if (shiftFilter!=='all' && r.shift.id!==shiftFilter) return false;
      if (statusFilter!=='all') {
        const has = r.daily.some(d=>{
          const ev = evaluateDailyAttendance({ checkIn:d.checkIn, checkOut:d.checkOut, leaveType:d.leaveType, permissions:d.permissions }, d.shift);
          if (statusFilter==='late') return ev.status==='late' || ev.status==='late_overtime';
          if (statusFilter==='present') return ev.status==='present' || ev.status==='present_overtime' || ev.status==='permission';
          return ev.status===statusFilter;
        });
        if (!has) return false;
      }
      return true;
    });
  }, [overviewRows, search, teamFilter, shiftFilter, statusFilter]);

  const kpis = useMemo(()=>{
    const totalPresent = filteredOverview.reduce((s,r)=> s+r.present,0);
    const expected = filteredOverview.length*workingDays||1;
    const rate = expected ? Math.round((totalPresent/expected)*100):0;
    const totalDelay = filteredOverview.reduce((s,r)=> s+r.totalNetLate,0);
    const totalOt = filteredOverview.reduce((s,r)=> s+r.totalOt,0);
    const totalLeaves = filteredOverview.reduce((s,r)=> s+r.leaveCount,0);
    const totalPerms = filteredOverview.reduce((s,r)=> s+r.permCount,0);
    return { totalPresent, rate, totalDelay, totalOt, totalLeaves, totalPerms, totalOtHours: fmtHM(totalOt) };
  }, [filteredOverview, workingDays]);

  const individualData = useMemo(()=>{
    const u = activeUsers.find(x=> x.id===selectedEmployeeId) || activeUsers[0];
    if (!u) return null;
    const teamName = teamNameById.get(u.team_id||'')||'';
    const rows = daysInMonth.map((date, idx)=>{
      const rec = recordMap.get(`${u.id}|${date}`);
      const leaveType = isOnLeave(u.id, date);
      const perms = permsByUserDate.get(`${u.id}|${date}`) || [];
      const shift = getEffectiveShiftForTeam(teamName, u.team_id||null, date, shifts, shiftAdjustments);
      const ev = evaluateDailyAttendance({ checkIn: rec?.check_in_time||null, checkOut: rec?.check_out_time||null, leaveType, permissions: perms }, shift);
      // Attach delay info
      const base = getShiftForUser(u, teamNameById, shifts);
      const hasDelay = shift.start !== base.start || shift.end !== base.end;
      const delayInfo = hasDelay ? shiftAdjustments.find(a=> (a.teamId ? a.teamId===u.team_id : (a.teamName||'').toLowerCase()===teamName.toLowerCase()) && (a.isTemporary ? a.date===date : true)) : null;
      return { idx: idx+1, date, rec, leaveType, perms, ev, shift, baseShift: base, hasDelay, delayReason: delayInfo?.reason || '' };
    });
    const agg = overviewRows.find(r=> r.user.id===u.id);
    const effectiveShift = getShiftForUser(u, teamNameById, shifts); // base for header, individual rows already have per-date effective
    return { user:u, shift: effectiveShift, rows, agg };
  }, [activeUsers, selectedEmployeeId, daysInMonth, recordMap, isOnLeave, permsByUserDate, shifts, teamNameById, overviewRows, shiftAdjustments]);

  const dailyRows = useMemo(()=>{
    return activeUsers.map(u=>{
      const teamName = teamNameById.get(u.team_id||'')||'';
      const shift = getEffectiveShiftForTeam(teamName, u.team_id||null, selectedDay, shifts, shiftAdjustments);
      const base = getShiftForUser(u, teamNameById, shifts);
      const rec = recordMap.get(`${u.id}|${selectedDay}`);
      const leaveType = isOnLeave(u.id, selectedDay);
      const perms = permsByUserDate.get(`${u.id}|${selectedDay}`) || [];
      const ev = evaluateDailyAttendance({ checkIn: rec?.check_in_time||null, checkOut: rec?.check_out_time||null, leaveType, permissions: perms }, shift);
      const hasDelay = shift.start !== base.start || shift.end !== base.end;
      const delayAdj = hasDelay ? shiftAdjustments.find(a=> (a.teamId ? a.teamId===u.team_id : (a.teamName||'').toLowerCase()===teamName.toLowerCase()) && (a.isTemporary ? a.date===selectedDay : true)) : null;
      return { user:u, teamName, shift, baseShift: base, hasDelay, delayReason: delayAdj?.reason || '', rec, leaveType, perms, ev };
    }).filter(r=>{
      const q = search.toLowerCase().trim();
      if (q && !r.user.full_name.toLowerCase().includes(q) && !r.user.email.toLowerCase().includes(q)) return false;
      if (teamFilter!=='all' && (r.user.team_id||'')!==teamFilter) return false;
      if (shiftFilter!=='all' && r.shift.id!==shiftFilter) return false;
      if (statusFilter!=='all') {
        if (statusFilter==='late') return r.ev.status==='late' || r.ev.status==='late_overtime';
        if (statusFilter==='present') return r.ev.status==='present' || r.ev.status==='present_overtime' || r.ev.status==='permission';
        return r.ev.status===statusFilter;
      }
      return true;
    });
  }, [activeUsers, selectedDay, recordMap, isOnLeave, permsByUserDate, shifts, teamNameById, search, teamFilter, shiftFilter, statusFilter]);

  // ── PDF: 10 cols without ID ─────────────────────────────────────────
  const pdfHeaders = [
    '# (م)',
    'اسم الموظف',
    'القسم / الوردية',
    'وقت وتوقيع الحضور',
    'وقت وتوقيع الانصراف',
    'ساعات العمل الفعلية',
    'التأخير الصافي',
    'إضافي بالساعات',
    'الحالة',
    'الأذونات والملاحظات',
  ];

  const handleExportPDF = () => {
    const meta = {
      companyName: 'Brokly CRM',
      branchName: '',
      monthYearAr: formatMonthAr(year, month),
      monthYearEn: formatMonthEn(year, month),
      shifts: shiftFilter==='all' ? shifts : shifts.filter(s=> s.id===shiftFilter),
      headcount: filteredOverview.length,
      workingDays,
      department: teamFilter==='all' ? 'All Departments' : teams.find(t=> t.id===teamFilter)?.name || '',
      activeShiftLabel: shiftFilter==='all' ? 'All Shifts' : shifts.find(s=> s.id===shiftFilter)?.labelAr || '',
    };
    const kpiList = [
      { label: 'إجمالي أيام العمل', value: String(workingDays) },
      { label: 'معدل الحضور %', value: `${kpis.rate}%` },
      { label: 'إجمالي التأخير (دقيقة) — الصافي', value: String(kpis.totalDelay) },
      { label: 'إجمالي الإضافي (ساعة)', value: kpis.totalOtHours },
      { label: 'الإجازات والأذونات المعتمدة', value: `${kpis.totalLeaves} إجازة · ${kpis.totalPerms} إذن` },
    ];

    if (viewMode==='overview') {
      const rows = filteredOverview.map((r,i)=> {
        const delay = r.hasTeamDelay ? r.daily.find(d=> d.hasDelay) : null;
        const delayNote = delay ? `وردية معدلة: ${delay.shift.start}–${delay.shift.end}${r.delayReason ? ` (${r.delayReason})` : ''}` : '';
        const permNote = r.permCount ? `${r.permCount} إذن معتمد` : (r.leave? `${r.leave} إجازة`:'');
        const notes = [delayNote, permNote].filter(Boolean).join(' • ') || (delayNote ? delayNote : '');
        // Show adjusted shift label in team column if delayed
        const teamLabel = delay ? `${r.teamName} — ${r.shift.labelAr} (معدلة ${delay.shift.start}–${delay.shift.end})` : `${r.teamName} — ${r.shift.labelAr}`;
        return [
          String(i+1),
          r.user.full_name || r.user.email,
          teamLabel,
          '—',
          '—',
          fmtHM(r.totalWork),
          String(r.totalNetLate),
          fmtHM(r.totalOt),
          `${r.present} حاضر · ${r.late} متأخر · ${r.absent} غياب بدون إذن · ${r.leave} إجازة${r.permCover? ` · ${r.permCover} بإذن`:''}`,
          notes,
        ];
      });
      exportAttendancePDF({ meta, kpis: kpiList, tables: [{ headers: pdfHeaders, rows, captionAr:`الملخص الشهري المجمع — ${formatMonthAr(year, month)}`, captionEn:`Team Monthly Overview` }], orientation:'landscape', filename:`attendance-overview-${year}-${pad(month)}` });
      exportCSV(`attendance-overview-${year}-${pad(month)}`, pdfHeaders, rows);
    } else if (viewMode==='individual' && individualData) {
      const u = individualData.user;
      const rows = individualData.rows.map(d=> {
        const delayNote = d.hasDelay ? `وردية معدلة: ${d.shift.start}–${d.shift.end}${d.delayReason ? ` (${d.delayReason})` : ''}` : '';
        const baseNote = d.ev.permissionNote || d.leaveType || '';
        const notes = [delayNote, baseNote].filter(Boolean).join(' • ');
        const teamShiftLabel = d.hasDelay ? `${teamNameById.get(u.team_id||'')||'—'} — ${d.shift.labelAr} (معدلة)` : `${teamNameById.get(u.team_id||'')||'—'} — ${d.shift.labelAr}`;
        return [
          String(d.idx),
          u.full_name || u.email,
          teamShiftLabel,
          d.rec?.check_in_time ? fmtTime(d.rec.check_in_time) : '—',
          d.rec?.check_out_time ? fmtTime(d.rec.check_out_time) : '—',
          d.ev.netWorkHours,
          String(d.ev.netLateMinutes),
          fmtHM(d.ev.overtimeMinutes),
          d.ev.statusAr + (d.leaveType ? ` (${d.leaveType})` : '') + (d.hasDelay ? ' — وردية معدلة' : ''),
          notes || (d.hasDelay ? delayNote : ''),
        ];
      });
      const indKpi = [
        { label:'أيام الحضور', value: String(individualData.agg?.present??0)},
        { label:'أيام الغياب بدون إذن', value: String(individualData.agg?.absent??0)},
        { label:'الصافي تأخير', value: fmtHM(individualData.agg?.totalNetLate||0)},
        { label:'الإضافي', value: fmtHM(individualData.agg?.totalOt||0)},
        { label:'إجازات/أذونات', value: `${individualData.agg?.leaveCount??0}/${individualData.agg?.permCount??0}`},
      ];
      exportAttendancePDF({ meta:{...meta, headcount:1}, kpis: indKpi, tables:[{ headers: pdfHeaders, rows, captionAr:`كشف مفصل — ${u.full_name||u.email} — ${formatMonthAr(year, month)} (${individualData.shift.labelAr})`, captionEn:`Individual Timesheet`} ], orientation:'landscape', filename:`attendance-individual-${u.full_name||u.id}-${year}-${pad(month)}` });
      exportCSV(`attendance-individual-${u.id}-${year}-${pad(month)}`, pdfHeaders, rows);
    } else if (viewMode==='daily') {
      const rows = dailyRows.map((r,i)=> {
        const delayNote = r.hasDelay ? `وردية معدلة: ${r.shift.start}–${r.shift.end}${r.delayReason ? ` (${r.delayReason})` : ''}` : '';
        const baseNote = r.ev.permissionNote || r.leaveType || '';
        const notes = [delayNote, baseNote].filter(Boolean).join(' • ');
        const teamShiftLabel = r.hasDelay ? `${r.teamName} — ${r.shift.labelAr} (معدلة ${r.shift.start}–${r.shift.end})` : `${r.teamName} — ${r.shift.labelAr}`;
        return [
          String(i+1),
          r.user.full_name || r.user.email,
          teamShiftLabel,
          r.rec?.check_in_time ? fmtTime(r.rec.check_in_time) : '—',
          r.rec?.check_out_time ? fmtTime(r.rec.check_out_time) : '—',
          r.ev.netWorkHours,
          String(r.ev.netLateMinutes),
          fmtHM(r.ev.overtimeMinutes),
          r.ev.statusAr + (r.hasDelay ? ' — معدلة' : ''),
          notes,
        ];
      });
      const dayKpi = [
        { label:'الحاضرون', value: String(dailyRows.filter(r=> r.ev.status!=='absent').length)},
        { label:'الغائبون بدون إذن', value: String(dailyRows.filter(r=> r.ev.status==='absent').length)},
        { label:'المتأخرون (صافي)', value: String(dailyRows.filter(r=> r.ev.status==='late'||r.ev.status==='late_overtime').length)},
        { label:'الإضافي اليوم', value: fmtHM(dailyRows.reduce((s,r)=> s+r.ev.overtimeMinutes,0))},
        { label:'أذونات اليوم', value: String(dailyRows.filter(r=> (r.perms?.length||0)>0).length)},
      ];
      exportAttendancePDF({ meta:{ companyName:'Brokly CRM', branchName:`اليوم: ${selectedDay}`, monthYearAr: formatMonthAr(year, month), monthYearEn: selectedDay, shifts: meta.shifts, headcount: dailyRows.length, workingDays:1, department: meta.department, activeShiftLabel: meta.activeShiftLabel }, kpis: dayKpi, tables:[{ headers: pdfHeaders, rows, captionAr:`كشف يومي مجمع بالورديات — ${selectedDay}`, captionEn:`Daily Shift Sheet`} ], orientation:'landscape', filename:`attendance-daily-${selectedDay}` });
      exportCSV(`attendance-daily-${selectedDay}`, pdfHeaders, rows);
    }
    toast.success('تم إنشاء تقرير PDF — نافذة الطباعة جاهزة');
  };

  const openLeavePerm = (userId?: string, date?: string) => {
    setLeavePermUserId(userId || selectedEmployeeId || activeUsers[0]?.id);
    setLeavePermDate(date || (viewMode==='daily' ? selectedDay : monthFrom));
    setLeavePermOpen(true);
  };

  const handleQuickAction = async (action:'checkin'|'checkout', user: AttendanceUser, date:string)=>{
    try{
      const res = await fetch('/api/attendance', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, userId:user.id, date }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error||'Request failed');
      toast.success(action==='checkin' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف');
      setReloadTick(t=>t+1);
    } catch(e:any){ toast.error(e?.message||'فشل التحديث'); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><CalendarCheck2 size={20} /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">سجل الحضور والانصراف، الورديات، والإجازات</h1>
            <p className="text-sm text-muted-foreground" dir="rtl">{shifts.map(s=> `${s.labelAr} ${s.start}–${s.end} · سماح ${s.graceMinutes}د حتى ${formatMinutes(s.toleranceMinutes)}`).join('  •  ')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Attendance, Shifts & Leaves — {formatMonthEn(year, month)} · {activeUsers.length} staff · بدون عمود كود الموظف</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExportPDF} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 hover:bg-primary/90"><Printer size={16}/> تصدير PDF</button>
          <button onClick={()=> setTeamShiftModalOpen(true)} className="h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold flex items-center gap-2 shadow-sm"><Clock size={16}/> تأخير وردية الفريق</button>
          <button onClick={()=> openLeavePerm()} className="h-10 px-4 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-sm font-bold flex items-center gap-2"><ShieldCheck size={16}/> إجازة / إذن</button>
          <button onClick={()=> setManualOpen(true)} className="h-10 px-4 rounded-xl border border-border bg-card text-foreground text-sm font-semibold flex items-center gap-2 hover:bg-muted"><Plus size={16}/> حضور يدوي</button>
          <button onClick={()=> setReloadTick(t=>t+1)} className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted"><RefreshCw size={16}/></button>
        </div>
      </div>

      <MultiShiftSettingsCard shifts={shifts} onSave={setShifts} />

      {/* Active Team Shift Delays Banner */}
      {shiftAdjustments.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center"><Clock size={12} /></div>
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">الورديات المعدلة النشطة — Active Shift Adjustments</h3>
            <span className="text-xs bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full">{shiftAdjustments.length}</span>
          </div>
          <div className="space-y-2">
            {shiftAdjustments.slice(0,4).map(adj=> (
              <div key={adj.id} className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-zinc-900 border border-amber-100 dark:border-zinc-800 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span className="font-bold text-foreground">{adj.teamName}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono text-xs bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 rounded-full">وردية معدلة: {adj.startTime} – {adj.endTime}</span>
                  <span className="text-xs text-muted-foreground">سماح {adj.graceMinutes}د حتى {formatMinutes((() => { const [h,m]=adj.startTime.split(':').map(Number); return h*60+m+adj.graceMinutes; })())}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${adj.isTemporary ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>{adj.isTemporary ? (adj.date ? `مؤقت ${adj.date}` : 'مؤقت') : 'دائم'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {adj.reason && <span className="text-xs text-muted-foreground max-w-[160px] truncate" title={adj.reason}>{adj.reason}</span>}
                  <button onClick={async()=>{ if(confirm('حذف هذا التعديل؟')){ await teamShiftAdjustmentsService.remove(adj.id); setShiftAdjustments(prev=> prev.filter(x=> x.id!==adj.id)); toast.success('تم حذف التعديل'); setReloadTick(t=>t+1); }}} className="text-xs text-red-600 hover:underline">حذف</button>
                </div>
              </div>
            ))}
            {shiftAdjustments.length>4 && <p className="text-xs text-muted-foreground">+ {shiftAdjustments.length-4} تعديلات أخرى</p>}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center"><Calendar size={16} className="text-muted-foreground" /></div>
          <div><p className="text-xs font-bold text-foreground">الشهر / السنة</p><p className="text-xs text-muted-foreground">{formatMonthAr(year, month)} — {formatMonthEn(year, month)}</p></div>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <select value={month} onChange={(e)=> setMonth(parseInt(e.target.value,10))} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
              {MONTHS_AR.map((m,idx)=> <option key={m} value={idx+1}>{m}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>
          <div className="relative w-[110px]">
            <select value={year} onChange={(e)=> setYear(parseInt(e.target.value,10))} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
              {Array.from({length:5},(_,i)=> now.getFullYear()-2+i).map(y=> <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>
          <input type="month" value={`${year}-${pad(month)}`} onChange={(e)=>{ const [yy,mm]=e.target.value.split('-').map(Number); if(yy&&mm){ setYear(yy); setMonth(mm);} }} className="hidden sm:block bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1">
          {([
            ['overview','الملخص','نظرة', LayoutGrid],
            ['individual','فردي','يوم بيوم', User],
            ['daily','يومي','لقطة', CalendarCheck2],
          ] as [ViewMode,string,string,any][]).map(([k,ar,en,Icon])=> (
            <button key={k} onClick={()=> setViewMode(k)} className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode===k ? 'bg-lime-500 text-zinc-950 shadow-sm border border-lime-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800'}`}>
              <Icon size={13} /><span>{ar}</span><span className="hidden sm:inline opacity-60 font-normal">{en}</span>
            </button>
          ))}
        </div>
        {viewMode==='individual' && (
          <div className="flex items-center gap-2 min-w-[220px] flex-1">
            <select value={selectedEmployeeId} onChange={(e)=> setSelectedEmployeeId(e.target.value)} className="flex-1 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
              {activeUsers.map(u=> <option key={u.id} value={u.id}>{u.full_name||u.email}</option>)}
            </select>
          </div>
        )}
        {viewMode==='daily' && (
          <div className="flex items-center gap-2">
            <input type="date" value={selectedDay} min={monthFrom} max={monthTo} onChange={(e)=> setSelectedDay(e.target.value)} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label:'Total Working Days', labelAr:'أيام العمل', value:String(workingDays), icon:<Calendar size={14} className="text-muted-foreground" />},
          { label:'Attendance Rate', labelAr:'معدل الحضور', value:`${kpis.rate}%`, icon:<CheckCircle2 size={14} className="text-emerald-600" />},
          { label:'Total Late (Min) — Net', labelAr:'التأخير الصافي (د)', value:String(kpis.totalDelay), icon:<AlertTriangle size={14} className="text-amber-600" />},
          { label:'Total Overtime (Hrs)', labelAr:'الإضافي (س)', value:kpis.totalOtHours, icon:<Timer size={14} className="text-violet-600" />},
          { label:'Approved Leaves & Perms', labelAr:'إجازات وأذونات', value:`${kpis.totalLeaves} + ${kpis.totalPerms}`, icon:<ShieldCheck size={14} className="text-sky-600" />},
        ].map(k=> (
          <div key={k.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between"><p className="text-lg font-black text-foreground">{k.value}</p>{k.icon}</div>
            <p className="text-xs font-semibold text-foreground">{k.labelAr}</p><p className="text-[10px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e)=> setSearch(e.target.value)} placeholder="بحث بالاسم / Live search by name…" className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
        </div>
        <div className="relative">
          <select value={shiftFilter} onChange={(e)=> setShiftFilter(e.target.value as any)} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none min-w-[150px]">
            <option value="all">All Shifts — كل الورديات</option>
            <option value="shift1">Shift 1 — 12:00–20:00</option>
            <option value="shift2">Shift 2 — 13:00–21:00</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <div className="relative">
          <select value={teamFilter} onChange={(e)=> setTeamFilter(e.target.value)} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none min-w-[150px]">
            <option value="all">All Teams</option>
            {teams.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e)=> setStatusFilter(e.target.value)} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none min-w-[150px]">
            <option value="all">All Statuses — الكل</option>
            <option value="present">Present — حاضر</option>
            <option value="late">Late — متأخر</option>
            <option value="absent">Absent — غياب بدون إذن</option>
            <option value="leave">Leave — إجازة</option>
            <option value="permission">Permission — بإذن</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <span className="text-xs text-muted-foreground">{viewMode==='overview' ? `${filteredOverview.length} موظف` : viewMode==='daily' ? `${dailyRows.length} موظف` : individualData ? `${daysInMonth.length} يوم` : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : viewMode==='overview' ? (
        filteredOverview.length===0 ? (
          <div className="bg-card border border-border rounded-2xl py-16 text-center"><Users size={24} className="mx-auto text-muted-foreground mb-2" /><p className="text-sm font-medium">لا توجد بيانات مطابقة</p></div>
        ) : (
          <>
            <div className="hidden lg:block bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead><tr className="border-b border-border bg-muted/40">
                  {['#','الموظف','القسم / الوردية','حاضر','غياب بدون إذن','إجازة/إذن','تأخير صافي','إضافي','ساعات العمل','المعدل','إجراءات'].map(h=> <th key={h} className="px-3 py-3 text-right text-xs font-bold text-muted-foreground">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {filteredOverview.map((r,i)=> (
                    <tr key={r.user.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{i+1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary dark:bg-primary/15 flex items-center justify-center text-xs font-bold">{(r.user.full_name||r.user.email).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
                          <div><p className="text-sm font-semibold text-foreground truncate max-w-[160px]">{r.user.full_name||'—'}</p><p className="text-xs text-muted-foreground truncate max-w-[160px]">{r.user.email}</p></div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded-full">{r.teamName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${r.shift.id==='shift2' ? 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'}`}>{r.shift.id==='shift2'?'م':'ق'}</span>
                          {r.hasTeamDelay && <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded-full text-[10px] font-bold" title={r.delayReason}>وردية معدلة</span>}
                        </div>
                        {r.hasTeamDelay && r.daily.some(d=> d.hasDelay) && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">{r.daily.find(d=> d.hasDelay)?.shift.start}–{r.daily.find(d=> d.hasDelay)?.shift.end} {r.delayReason ? `· ${r.delayReason}` : ''}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center"><span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{r.present}</span><span className="text-xs text-muted-foreground">/{workingDays}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="text-sm font-bold text-red-600 dark:text-red-400">{r.absent}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="text-xs font-bold text-sky-600 dark:text-sky-400">{r.leave} إجازة</span><span className="text-xs text-lime-600 dark:text-lime-400 ml-1">{r.permCover? `+${r.permCover} إذن`:''}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className={`text-sm font-bold ${r.totalNetLate>0?'text-amber-600 dark:text-amber-400':'text-muted-foreground'}`}>{r.totalNetLate}m</span></td>
                      <td className="px-3 py-2.5 text-center"><span className={`text-sm font-bold ${r.totalOt>0?'text-violet-600 dark:text-violet-400':'text-muted-foreground'}`}>{fmtHM(r.totalOt)}</span></td>
                      <td className="px-3 py-2.5 text-center text-sm font-semibold text-foreground">{fmtHM(r.totalWork)}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold border ${r.rate>=90?'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30': r.rate>=70?'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30':'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30'}`}>{r.rate}%</span></td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={()=> { setViewMode('individual'); setSelectedEmployeeId(r.user.id); }} className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center"><Eye size={14}/></button>
                          <button onClick={()=> openLeavePerm(r.user.id, monthFrom)} className="w-7 h-7 rounded-lg hover:bg-lime-50 text-muted-foreground hover:text-lime-600 flex items-center justify-center" title="إجازة/إذن"><ShieldCheck size={14}/></button>
                          <button onClick={()=> setEditUser(r.user)} className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center"><Pencil size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden space-y-3">
              {filteredOverview.map(r=> (
                <div key={r.user.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{(r.user.full_name||r.user.email).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
                      <div><p className="text-sm font-bold text-foreground">{r.user.full_name||'—'}</p><p className="text-xs text-muted-foreground">{r.teamName} — {r.shift.labelAr}</p></div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${r.rate>=90?'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30': r.rate>=70?'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30':'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30'}`}>{r.rate}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/40 rounded-xl p-2"><p className="text-xs text-muted-foreground">حاضر</p><p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{r.present}/{workingDays}</p></div>
                    <div className="bg-muted/40 rounded-xl p-2"><p className="text-xs text-muted-foreground">الصافي تأخير</p><p className="text-sm font-black text-amber-600 dark:text-amber-400">{r.totalNetLate}m</p></div>
                    <div className="bg-muted/40 rounded-xl p-2"><p className="text-xs text-muted-foreground">إضافي</p><p className="text-sm font-black text-violet-600 dark:text-violet-400">{fmtHM(r.totalOt)}</p></div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={()=> { setViewMode('individual'); setSelectedEmployeeId(r.user.id); }} className="flex-1 h-9 rounded-xl border border-border bg-card text-sm font-semibold flex items-center justify-center gap-1.5"><Eye size={14}/> كشف</button>
                    <button onClick={()=> openLeavePerm(r.user.id)} className="flex-1 h-9 rounded-xl bg-lime-500 text-zinc-950 text-sm font-bold flex items-center justify-center gap-1.5"><ShieldCheck size={14}/> إذن</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      ) : viewMode==='individual' && individualData ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold">{(individualData.user.full_name||individualData.user.email).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
              <div>
                <p className="text-sm font-bold text-foreground">{individualData.user.full_name||individualData.user.email} — {teamNameById.get(individualData.user.team_id||'')||'—'} — {individualData.shift.labelAr}</p>
                <p className="text-xs text-muted-foreground">{formatMonthAr(year, month)} · {workingDays} يوم · {individualData.agg?.present??0} حاضر · {individualData.agg?.totalNetLate??0} د صافي · {fmtHM(individualData.agg?.totalOt||0)} إضافي</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-muted px-2 py-1 rounded-full">{individualData.agg?.rate??0}% حضور</span>
              <button onClick={()=> openLeavePerm(individualData.user.id)} className="h-8 px-3 rounded-lg border border-border text-xs font-bold flex items-center gap-1"><ShieldCheck size={12}/> إذن</button>
              <button onClick={()=> handleExportPDF()} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><Download size={12}/> PDF فردي</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead><tr className="bg-muted/40 border-b border-border">
                {['#','اليوم','التاريخ','الحضور','الانصراف','صافي العمل','تأخير صافي','إضافي','الحالة','الأذونات/ملاحظات'].map(h=> <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {individualData.rows.map(d=> (
                  <tr key={d.date} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.idx}</td>
                    <td className="px-3 py-2 text-xs">{new Date(d.date).toLocaleDateString('ar-EG',{weekday:'short'})}</td>
                    <td className="px-3 py-2 text-xs font-mono">{d.date.slice(5)}</td>
                    <td className="px-3 py-2 text-xs">{d.rec?.check_in_time ? fmtTime(d.rec.check_in_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs">{d.rec?.check_out_time ? fmtTime(d.rec.check_out_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-foreground">{d.ev.netWorkHours}</td>
                    <td className="px-3 py-2 text-xs"><span className={d.ev.netLateMinutes ? 'text-amber-600 dark:text-amber-400 font-bold':'text-muted-foreground'}>{d.ev.netLateMinutes ? `${d.ev.netLateMinutes}m` : '—'}</span>{d.ev.rawLateMinutes!==d.ev.netLateMinutes ? <span className="text-[10px] text-muted-foreground ml-1">({d.ev.rawLateMinutes})</span> : null}</td>
                    <td className="px-3 py-2 text-xs"><span className={d.ev.overtimeMinutes ? 'text-violet-600 dark:text-violet-400 font-bold':'text-muted-foreground'}>{d.ev.overtimeMinutes ? fmtHM(d.ev.overtimeMinutes):'—'}</span></td>
                    <td className="px-3 py-2"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold border ${d.ev.badgeClass}`}>{d.ev.statusAr}</span></td>
                    <td className="px-3 py-2 text-xs max-w-[220px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {d.hasDelay && <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded-full text-[10px] font-bold">وردية معدلة: {d.shift.start}–{d.shift.end}</span>}
                        {d.ev.permissionNote && <span className="text-muted-foreground truncate">{d.ev.permissionNote}</span>}
                        {d.leaveType && !d.ev.permissionNote && <span className="text-muted-foreground">{d.leaveType}</span>}
                        {d.hasDelay && d.delayReason && <span className="text-amber-600 dark:text-amber-400 truncate" title={d.delayReason}>· {d.delayReason}</span>}
                        {!d.hasDelay && !d.ev.permissionNote && !d.leaveType && <span className="text-muted-foreground">—</span>}
                      </div>
                      <button onClick={()=> openLeavePerm(individualData.user.id, d.date)} className="ml-2 text-primary hover:underline text-[11px]">+إذن</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode==='daily' ? (
        dailyRows.length===0 ? (
          <div className="bg-card border border-border rounded-2xl py-12 text-center"><CalendarCheck2 size={22} className="mx-auto text-muted-foreground mb-2" /><p className="text-sm font-medium">لا توجد بيانات لهذا اليوم</p></div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead><tr className="bg-muted/40 border-b border-border">
                {['#','الموظف','القسم / الوردية','حضور','انصراف','صافي','تأخير صافي','إضافي','الحالة','الأذونات/ملاحظات'].map(h=> <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {dailyRows.map((r,i)=> (
                  <tr key={r.user.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i+1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{(r.user.full_name||r.user.email).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
                        <span className="text-sm font-semibold truncate max-w-[150px]">{r.user.full_name||'—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded-full">{r.teamName}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${r.shift.id==='shift2'?'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30':'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'}`}>{r.shift.labelAr}</span>
                        {r.hasDelay && <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded-full text-[10px] font-bold">معدلة {r.shift.start}–{r.shift.end}</span>}
                      </div>
                      {r.hasDelay && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">وردية معدلة: {r.shift.start}–{r.shift.end} · سماح حتى {formatMinutes(r.shift.toleranceMinutes)} {r.delayReason ? `· ${r.delayReason}` : ''}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">{r.rec?.check_in_time ? fmtTime(r.rec.check_in_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-foreground">{r.rec?.check_out_time ? fmtTime(r.rec.check_out_time) : '—'}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-foreground">{r.ev.netWorkHours}</td>
                    <td className="px-3 py-2 text-xs"><span className={r.ev.netLateMinutes?'text-amber-600 dark:text-amber-400 font-bold':'text-muted-foreground'}>{r.ev.netLateMinutes? `${r.ev.netLateMinutes}m`:'—'}</span></td>
                    <td className="px-3 py-2 text-xs"><span className={r.ev.overtimeMinutes?'text-violet-600 dark:text-violet-400 font-bold':'text-muted-foreground'}>{r.ev.overtimeMinutes? fmtHM(r.ev.overtimeMinutes):'—'}</span></td>
                    <td className="px-3 py-2"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold border ${r.ev.badgeClass}`}>{r.ev.statusAr}</span></td>
                    <td className="px-3 py-2 text-xs max-w-[220px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.hasDelay && <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded-full text-[10px] font-bold">وردية معدلة</span>}
                        {r.ev.permissionNote ? <span className="text-muted-foreground truncate">{r.ev.permissionNote}</span> : r.leaveType ? <span className="text-muted-foreground">{r.leaveType}</span> : r.hasDelay ? <span className="text-amber-600 dark:text-amber-400">{r.shift.start}–{r.shift.end} · {r.delayReason || 'تأخير معتمد'}</span> : <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <button onClick={()=> openLeavePerm(r.user.id, selectedDay)} className="text-primary hover:underline text-xs">+إذن/إجازة</button>
                        {selectedDay===todayLocal() && !r.rec?.check_in_time ? <button onClick={()=> handleQuickAction('checkin', r.user, selectedDay)} className="h-6 px-2 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">حضور</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {manualOpen && <ManualAttendanceModal users={users} defaultDate={viewMode==='daily'? selectedDay: monthFrom} onClose={()=> setManualOpen(false)} onSaved={()=> { setManualOpen(false); setReloadTick(t=>t+1); }} />}
      {editUser && <ManualAttendanceModal users={users} defaultDate={viewMode==='daily'? selectedDay: monthFrom} editUserId={editUser.id} onClose={()=> setEditUser(null)} onSaved={()=> { setEditUser(null); setReloadTick(t=>t+1); }} />}
      {leavePermOpen && <LeavePermissionModal users={users as any} defaultUserId={leavePermUserId} defaultDate={leavePermDate} onClose={()=> setLeavePermOpen(false)} onSaved={()=> { setLeavePermOpen(false); setReloadTick(t=>t+1); }} />}
      {teamShiftModalOpen && <TeamShiftDelayModal teams={teams} defaultTeamId={teamFilter !== 'all' ? teamFilter : undefined} defaultDate={viewMode==='daily' ? selectedDay : todayLocal()} onClose={()=> setTeamShiftModalOpen(false)} onSaved={()=> { setTeamShiftModalOpen(false); setReloadTick(t=>t+1); toast.success('تم تحديث ورديات الفريق — أعيد حساب الحضور'); }} />}
    </div>
  );
}

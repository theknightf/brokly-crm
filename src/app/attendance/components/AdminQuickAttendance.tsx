'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, CalendarDays, Clock, Zap, Users, Pencil, Plus,
  Loader2, CheckCircle2, ChevronDown, X, Timer, CalendarRange,
} from 'lucide-react';
import { toast } from 'sonner';
import { teamsService } from '@/lib/services/crmService';
import { companySettingsService } from '@/lib/services/peopleOpsService';
import { cairoMinutesOfISO, isFridayHoliday } from '@/lib/attendanceLogic';

interface RosterUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  team_id?: string | null;
}
interface AttRow {
  user_id: string;
  check_in_time: string | null;
  check_out_time: string | null;
}
interface LeaveRow {
  userId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: string;
}

const CARD = 'rounded-2xl border border-[#212634] bg-[#12141c]';
const INPUT =
  'w-full bg-[#0b0d13] text-zinc-100 border border-[#212634] rounded-xl px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-colors disabled:opacity-50';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}
function addDaysStr(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nowHHMM(): string {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}
function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function to12h(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return hhmm;
  let h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${m[2]} ${suffix}`;
}
function isoToHHMM(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Local wall-clock ISO for an admin-picked date + HH:MM (same approach as ManualAttendanceModal). */
function buildISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time || '')) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type StatusKey = 'complete' | 'present' | 'late' | 'absent' | 'leave' | 'holiday';
const STATUS_META: Record<StatusKey, { ar: string; en: string; cls: string }> = {
  complete: { ar: 'مكتمل', en: 'Complete', cls: 'bg-lime-500/10 text-lime-300 border-lime-500/30' },
  present: { ar: 'حاضر', en: 'Present', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  late: { ar: 'متأخر', en: 'Late', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  absent: { ar: 'غائب', en: 'Absent', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
  leave: { ar: 'إجازة', en: 'On Leave', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  holiday: { ar: 'عطلة', en: 'Holiday', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
};

export default function AdminQuickAttendance() {
  const [date, setDate] = useState(todayLocal());
  const [users, setUsers] = useState<RosterUser[]>([]);
  const [att, setAtt] = useState<Record<string, AttRow>>({});
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [tolerance, setTolerance] = useState(12 * 60 + 20);
  const [loading, setLoading] = useState(true);

  // ── Quick entry bar ──
  const [qEmpId, setQEmpId] = useState('');
  const [qQuery, setQQuery] = useState('');
  const [qOpen, setQOpen] = useState(false);
  const [qIn, setQIn] = useState(nowHHMM());
  const [qOut, setQOut] = useState('');
  const [qBusy, setQBusy] = useState(false);

  // ── Batch logger ──
  const [batchOpen, setBatchOpen] = useState(false);
  const [bEmpId, setBEmpId] = useState('');
  const [bStart, setBStart] = useState(addDaysStr(todayLocal(), -6));
  const [bEnd, setBEnd] = useState(todayLocal());
  const [bIn, setBIn] = useState('10:00');
  const [bOut, setBOut] = useState('18:00');
  const [bExclude, setBExclude] = useState(true);
  const [bBusy, setBBusy] = useState(false);
  const [bResult, setBResult] = useState('');

  // ── Roster ──
  const [rosterQ, setRosterQ] = useState('');
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; in: string; out: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // Close the employee dropdown on outside click (cleanup-safe).
  const qempRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!qOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!qempRef.current?.contains(e.target as Node)) setQOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [qOpen]);

  const teamNameById = useMemo(() => {
    const m = new Map<string, string>();
    teams.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [teams]);

  const activeUsers = useMemo(() => users.filter((u) => u.is_active !== false), [users]);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    try {
      const [dayRes, teamsList] = await Promise.all([
        fetch(`/api/attendance?date=${encodeURIComponent(day)}`, { cache: 'no-store' }).then((r) => r.json()),
        teamsService.getAll().then((rows) => rows.map((x) => ({ id: x.id, name: x.name }))).catch(() => []),
      ]);
      setUsers(dayRes?.users || []);
      const map: Record<string, AttRow> = {};
      (dayRes?.attendance || []).forEach((r: AttRow) => {
        map[r.user_id] = r;
      });
      setAtt(map);
      setTeams(teamsList);
      try {
        const wh = await companySettingsService.getWorkingHours();
        const [h, m] = String(wh.start || '12:00').split(':').map(Number);
        setTolerance(h * 60 + m + Number(wh.lateGraceMinutes ?? 20));
      } catch {}
      try {
        const { leaveService } = await import('@/lib/services/peopleOpsService');
        const all = await leaveService.getAll();
        setLeaves(
          (all || [])
            .filter((l: any) => l.status === 'approved')
            .map((l: any) => ({ userId: l.userId, startDate: l.startDate, endDate: l.endDate, leaveType: l.leaveType, status: l.status }))
        );
      } catch {}
    } catch {
      toast.error('تعذر تحميل الكشف — Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const leaveOn = useCallback(
    (userId: string, day: string): string | null => {
      const hit = leaves.find((l) => l.userId === userId && day >= l.startDate && day <= l.endDate);
      return hit ? hit.leaveType || 'leave' : null;
    },
    [leaves]
  );

  const statusOf = useCallback(
    (u: RosterUser): { key: StatusKey; rec: AttRow | null } => {
      const rec = att[u.id] || null;
      if (leaveOn(u.id, date)) return { key: 'leave', rec };
      if (!rec?.check_in_time) return { key: isFridayHoliday(date) ? 'holiday' : 'absent', rec };
      if (rec.check_out_time) return { key: 'complete', rec };
      const inM = cairoMinutesOfISO(rec.check_in_time);
      return { key: inM > tolerance ? 'late' : 'present', rec };
    },
    [att, date, leaveOn, tolerance]
  );

  const filteredQ = useMemo(() => {
    const q = qQuery.trim().toLowerCase();
    if (!q) return activeUsers.slice(0, 8);
    return activeUsers.filter((u) => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)).slice(0, 8);
  }, [qQuery, activeUsers]);

  const rosterRows = useMemo(() => {
    const q = rosterQ.trim().toLowerCase();
    const list = q
      ? activeUsers.filter((u) => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      : activeUsers;
    return list.map((u) => ({ user: u, ...statusOf(u) }));
  }, [activeUsers, rosterQ, statusOf]);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { complete: 0, present: 0, late: 0, absent: 0, leave: 0, holiday: 0 };
    activeUsers.forEach((u) => {
      c[statusOf(u).key] += 1;
    });
    return c;
  }, [activeUsers, statusOf]);

  // ── Quick submit ──
  const submitQuick = async () => {
    if (!qEmpId) {
      toast.error('اختر الموظف أولاً — Select an employee');
      return;
    }
    const inISO = buildISO(date, qIn);
    if (!inISO) {
      toast.error('وقت الحضور غير صحيح — Invalid check-in time');
      return;
    }
    const outISO = qOut ? buildISO(date, qOut) : null;
    if (qOut && !outISO) {
      toast.error('وقت الانصراف غير صحيح — Invalid check-out time');
      return;
    }
    if (outISO && new Date(outISO).getTime() < new Date(inISO).getTime()) {
      toast.error('الانصراف قبل الحضور — Check-out before check-in');
      return;
    }
    setQBusy(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          userId: qEmpId,
          date,
          checkInTime: inISO,
          checkOutTime: outISO,
          reason: 'Quick log by admin',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Save failed');
      const emp = activeUsers.find((u) => u.id === qEmpId);
      toast.success(`تم تسجيل ${emp?.full_name || ''} — Checked in ${to12h(qIn)}`, { duration: 4000 });
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ — Save failed');
    } finally {
      setQBusy(false);
    }
  };

  // ── Batch submit ──
  const submitBatch = async () => {
    if (!bEmpId) {
      toast.error('اختر الموظف — Select an employee');
      return;
    }
    if (!bStart || !bEnd || bEnd < bStart) {
      toast.error('تحقق من التاريخ — Check the date range');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(bIn)) {
      toast.error('وقت الحضور غير صحيح — Invalid check-in time');
      return;
    }
    setBBusy(true);
    setBResult('');
    try {
      const res = await fetch('/api/admin/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: bEmpId,
          startDate: bStart,
          endDate: bEnd,
          checkInTime: bIn,
          checkOutTime: bOut || null,
          excludeWeekends: bExclude,
          reason: 'Batch approved by admin',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Batch failed');
      const emp = activeUsers.find((u) => u.id === bEmpId);
      setBResult(
        `تم اعتماد ${j.created} يوم لـ ${emp?.full_name || ''} (تخطي ${j.skippedExisting} مسجل، ${j.skippedWeekend} عطلة) — Approved ${j.created} days (${j.skippedExisting} existing, ${j.skippedWeekend} weekend skipped)`
      );
      toast.success(`تم اعتماد ${j.created} يوم — Batch approved`, { duration: 5000 });
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'فشل الاعتماد — Batch failed');
    } finally {
      setBBusy(false);
    }
  };

  // ── Edit submit ──
  const submitEdit = async () => {
    if (!editTarget) return;
    const inISO = buildISO(date, editTarget.in);
    if (!inISO) {
      toast.error('وقت الحضور غير صحيح — Invalid check-in time');
      return;
    }
    const outISO = editTarget.out ? buildISO(date, editTarget.out) : null;
    if (editTarget.out && !outISO) {
      toast.error('وقت الانصراف غير صحيح — Invalid check-out time');
      return;
    }
    setEditBusy(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          userId: editTarget.id,
          date,
          checkInTime: inISO,
          checkOutTime: outISO,
          reason: 'Time corrected by admin',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Save failed');
      toast.success('تم تعديل الوقت — Time updated');
      setEditTarget(null);
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ — Save failed');
    } finally {
      setEditBusy(false);
    }
  };

  const logNow = (u: RosterUser) => {
    setQEmpId(u.id);
    setQQuery(u.full_name || u.email);
    setQOpen(false);
    setQIn(nowHHMM());
    setQOut('');
    setDate(todayLocal());
    toast.info(`جاهز للتسجيل: ${u.full_name} — Ready to log`, { duration: 2500 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const qSelected = activeUsers.find((u) => u.id === qEmpId);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: date nav ── */}
      <div className={`${CARD} p-4 flex flex-wrap items-center gap-3`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-lime-500 text-zinc-950 flex items-center justify-center shrink-0">
            <Zap size={19} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-black text-zinc-50" dir="rtl">تسجيل الحضور السريع</span>
            <span className="block text-[11px] text-zinc-500" dir="ltr">Quick Attendance — instant admin logging, no GPS</span>
          </span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <button
            onClick={() => setDate(addDaysStr(date, -1))}
            className="h-10 px-3.5 rounded-xl border border-[#212634] text-xs font-bold text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <span dir="rtl">أمس</span> <span className="opacity-60" dir="ltr">· Yday</span>
          </button>
          <span className="relative flex items-center gap-2 bg-[#0b0d13] border border-[#212634] rounded-xl px-3 h-10">
            <CalendarDays size={14} className="text-lime-400 shrink-0" />
            <input
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent text-sm text-zinc-100 outline-none"
              dir="ltr"
            />
          </span>
          <button
            onClick={() => setDate(todayLocal())}
            className="h-10 px-3.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-xs font-black transition-colors"
          >
            <span dir="rtl">اليوم</span> <span className="opacity-60" dir="ltr">· Today</span>
          </button>
        </div>
      </div>

      {/* ── Quick entry bar ── */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
          {/* Employee searchable dropdown */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-zinc-200" dir="rtl">الموظف *</span>
              <span className="block text-[10px] text-zinc-500" dir="ltr">Employee — searchable</span>
            </label>
            <div className="relative" ref={qempRef}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  value={qQuery}
                  onChange={(e) => {
                    setQQuery(e.target.value);
                    setQOpen(true);
                    if (!e.target.value) setQEmpId('');
                  }}
                  onFocus={() => setQOpen(true)}
                  placeholder="ابحث بالاسم…"
                  dir="rtl"
                  className={`${INPUT} pl-9 pr-9`}
                />
                {qQuery ? (
                  <button
                    onClick={() => {
                      setQQuery('');
                      setQEmpId('');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                    aria-label="Clear"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                )}
              </div>
              {qOpen && (
                <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-[#212634] bg-[#161922] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]">
                  <div className="max-h-56 overflow-y-auto py-1">
                    {filteredQ.length === 0 && (
                      <p className="px-3.5 py-3 text-xs text-zinc-500 text-center" dir="rtl">لا نتائج مطابقة</p>
                    )}
                    {filteredQ.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setQEmpId(u.id);
                          setQQuery(u.full_name || u.email);
                          setQOpen(false);
                        }}
                        className={`w-full text-start px-3.5 py-2.5 flex items-center gap-2.5 transition-colors ${
                          qEmpId === u.id
                            ? 'bg-lime-500/10 text-lime-300 font-bold'
                            : 'hover:bg-white/5 text-zinc-200'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-full bg-lime-500/15 text-lime-300 flex items-center justify-center text-xs font-black shrink-0" dir="ltr">
                          {(u.full_name || u.email).trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate" dir="ltr">{u.full_name || '—'}</span>
                          <span className="block text-[11px] text-zinc-500 truncate" dir="ltr">
                            {u.role || 'staff'}{teamNameById.get(u.team_id || '') ? ` · ${teamNameById.get(u.team_id || '')}` : ''}
                          </span>
                        </span>
                        {qEmpId === u.id && <CheckCircle2 size={14} className="shrink-0 text-lime-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Check-in time */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-zinc-200" dir="rtl">وقت الحضور *</span>
              <span className="block text-[10px] text-zinc-500" dir="ltr">Check-in · {to12h(qIn)}</span>
            </label>
            <span className="relative flex items-center gap-2 bg-[#0b0d13] border border-[#212634] rounded-xl px-3 h-[46px] focus-within:border-lime-400">
              <Clock size={14} className="text-lime-400 shrink-0" />
              <input
                type="time"
                value={qIn}
                onChange={(e) => setQIn(e.target.value)}
                className="bg-transparent text-sm text-zinc-100 outline-none w-full"
                dir="ltr"
              />
            </span>
          </div>
          {/* Check-out time */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-zinc-200" dir="rtl">وقت الانصراف (اختياري)</span>
              <span className="block text-[10px] text-zinc-500" dir="ltr">Check-out · optional{qOut ? ` · ${to12h(qOut)}` : ''}</span>
            </label>
            <span className="relative flex items-center gap-2 bg-[#0b0d13] border border-[#212634] rounded-xl px-3 h-[46px] focus-within:border-lime-400">
              <Timer size={14} className="text-zinc-500 shrink-0" />
              <input
                type="time"
                value={qOut}
                onChange={(e) => setQOut(e.target.value)}
                className="bg-transparent text-sm text-zinc-100 outline-none w-full"
                dir="ltr"
              />
              {qOut && (
                <button onClick={() => setQOut('')} className="text-zinc-500 hover:text-zinc-200" aria-label="Clear check-out">
                  <X size={13} />
                </button>
              )}
            </span>
          </div>
          {/* Instant button */}
          <button
            onClick={submitQuick}
            disabled={qBusy || !qEmpId}
            className="min-h-[56px] px-6 rounded-2xl bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black flex flex-col items-center justify-center leading-tight disabled:opacity-40 shadow-[0_14px_36px_-12px_rgba(132,204,22,0.65)] transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2 text-[15px]" dir="rtl">
              {qBusy ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
              تسجيل فوري
            </span>
            <span className="text-[10px] font-bold opacity-70" dir="ltr">Instant Check-in · admin-verified</span>
          </button>
        </div>
        {qSelected && (
          <p className="text-[11px] text-zinc-500 mt-2" dir="ltr">
            Logging for <b className="text-zinc-200">{qSelected.full_name}</b> on <b className="text-zinc-200">{date}</b> · {to12h(qIn)}
            {qOut ? ` → ${to12h(qOut)}` : ''} · no GPS required
          </p>
        )}
      </div>

      {/* ── Batch logger ── */}
      <div className={CARD}>
        <button
          onClick={() => setBatchOpen((o) => !o)}
          className="w-full p-4 flex items-center gap-2.5 text-start"
        >
          <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
            <CalendarRange size={17} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-black text-zinc-50" dir="rtl">التسجيل الجماعي الأسبوعي</span>
            <span className="block text-[11px] text-zinc-500" dir="ltr">Weekly / Multi-Day Batch Logger — fill missing days</span>
          </span>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform shrink-0 ${batchOpen ? 'rotate-180' : ''}`} />
        </button>
        {batchOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-[#212634]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">الموظف *</label>
                <select value={bEmpId} onChange={(e) => setBEmpId(e.target.value)} className={INPUT} dir="ltr">
                  <option value="">Select employee…</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">من تاريخ *</label>
                <input type="date" value={bStart} max={bEnd} onChange={(e) => e.target.value && setBStart(e.target.value)} className={INPUT} dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">إلى تاريخ *</label>
                <input type="date" value={bEnd} min={bStart} max={todayLocal()} onChange={(e) => e.target.value && setBEnd(e.target.value)} className={INPUT} dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">
                  الحضور الافتراضي * <span className="text-zinc-500 font-semibold" dir="ltr">· {to12h(bIn)}</span>
                </label>
                <input type="time" value={bIn} onChange={(e) => setBIn(e.target.value)} className={INPUT} dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">
                  الانصراف الافتراضي <span className="text-zinc-500 font-semibold" dir="ltr">· {bOut ? to12h(bOut) : '—'}</span>
                </label>
                <input type="time" value={bOut} onChange={(e) => setBOut(e.target.value)} className={INPUT} dir="ltr" />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setBExclude((v) => !v)}
                  className={`w-full min-h-[46px] rounded-xl border-2 text-xs font-black transition-all px-3 ${
                    bExclude
                      ? 'bg-amber-500/10 border-amber-400 text-amber-200'
                      : 'bg-[#0b0d13] border-[#212634] text-zinc-400'
                  }`}
                >
                  <span dir="rtl">تخطي الجمعة والسبت {bExclude ? '✓' : '○'}</span>
                  <span className="block text-[10px] font-semibold opacity-70" dir="ltr">Exclude Fri/Sat weekends</span>
                </button>
              </div>
            </div>
            <button
              onClick={submitBatch}
              disabled={bBusy || !bEmpId}
              className="mt-3 w-full min-h-[52px] rounded-2xl bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black flex flex-col items-center justify-center leading-tight disabled:opacity-40 shadow-[0_14px_36px_-12px_rgba(132,204,22,0.65)] transition-all active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-[15px]" dir="rtl">
                {bBusy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                اعتماد جماعي للحضور
              </span>
              <span className="text-[10px] font-bold opacity-70" dir="ltr">Batch Approve Attendance · missing days only</span>
            </button>
            {bResult && (
              <p className="mt-2 rounded-xl border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-[11px] text-lime-200 leading-relaxed">{bResult}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Roster ── */}
      <div className={CARD}>
        <div className="p-4 border-b border-[#212634] flex flex-wrap items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-white/5 border border-[#212634] text-zinc-300 flex items-center justify-center shrink-0">
            <Users size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-zinc-50" dir="rtl">كشف اليوم — {date}</span>
            <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-zinc-500" dir="ltr">
              <span className="text-lime-300 font-bold">{counts.complete + counts.present + counts.late} in</span>·
              <span className="text-red-300 font-bold">{counts.absent} absent</span>·
              <span>{counts.leave} leave</span>·<span>{counts.holiday} holiday</span>·
              <span>{activeUsers.length} staff</span>
            </span>
          </span>
          <span className="ms-auto relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            <input
              value={rosterQ}
              onChange={(e) => setRosterQ(e.target.value)}
              placeholder="بحث…"
              dir="rtl"
              className="bg-[#0b0d13] border border-[#212634] rounded-xl pl-3 pr-9 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-lime-400 w-40"
            />
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : rosterRows.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500" dir="rtl">لا يوجد موظفون مطابقون</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-[#212634] text-[11px] text-zinc-500">
                    {['Employee', 'Team', 'Check-in', 'Check-out', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold whitespace-nowrap" dir="ltr">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#212634]/60">
                  {rosterRows.map(({ user: u, key, rec }) => {
                    const meta = STATUS_META[key];
                    return (
                      <tr key={u.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-lime-500/15 text-lime-300 flex items-center justify-center text-[10px] font-black shrink-0" dir="ltr">
                              {(u.full_name || u.email).trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-zinc-100 truncate" dir="ltr">{u.full_name || '—'}</span>
                              <span className="block text-[10px] text-zinc-500" dir="ltr">{u.role || 'staff'}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-zinc-300" dir="ltr">{teamNameById.get(u.team_id || '') || '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-zinc-100 tabular-nums" dir="ltr">{fmtTime(rec?.check_in_time)}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-zinc-100 tabular-nums" dir="ltr">{fmtTime(rec?.check_out_time)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.cls}`}>
                            <span dir="rtl">{meta.ar}</span><span className="opacity-60 ms-1" dir="ltr">{meta.en}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1.5">
                            {rec?.check_in_time ? (
                              <button
                                onClick={() => setEditTarget({ id: u.id, name: u.full_name || u.email, in: isoToHHMM(rec.check_in_time), out: isoToHHMM(rec.check_out_time) })}
                                className="h-8 px-3 rounded-lg border border-[#212634] text-[11px] font-bold text-zinc-300 hover:bg-white/5 hover:text-zinc-100 flex items-center gap-1 transition-colors"
                              >
                                <Pencil size={11} /> <span dir="rtl">تعديل</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => logNow(u)}
                                disabled={key === 'holiday' || key === 'leave'}
                                className="h-8 px-3 rounded-lg bg-lime-500 hover:bg-lime-400 text-zinc-950 text-[11px] font-black flex items-center gap-1 disabled:opacity-30 transition-colors"
                              >
                                <Plus size={11} /> <span dir="rtl">سجّل الآن</span>
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[#212634]/60">
              {rosterRows.map(({ user: u, key, rec }) => {
                const meta = STATUS_META[key];
                return (
                  <div key={u.id} className="p-3.5 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-lime-500/15 text-lime-300 flex items-center justify-center text-xs font-black shrink-0" dir="ltr">
                      {(u.full_name || u.email).trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-zinc-100 truncate" dir="ltr">{u.full_name || '—'}</span>
                      <span className="block text-[11px] text-zinc-500 tabular-nums" dir="ltr">
                        {fmtTime(rec?.check_in_time)} → {fmtTime(rec?.check_out_time)}
                        {teamNameById.get(u.team_id || '') ? ` · ${teamNameById.get(u.team_id || '')}` : ''}
                      </span>
                      <span className={`inline-flex items-center px-2 py-px rounded-full text-[10px] font-black border mt-1 ${meta.cls}`}>
                        <span dir="rtl">{meta.ar}</span>
                      </span>
                    </span>
                    {rec?.check_in_time ? (
                      <button
                        onClick={() => setEditTarget({ id: u.id, name: u.full_name || u.email, in: isoToHHMM(rec.check_in_time), out: isoToHHMM(rec.check_out_time) })}
                        className="h-10 w-10 rounded-xl border border-[#212634] text-zinc-300 flex items-center justify-center shrink-0"
                        aria-label="Edit time"
                      >
                        <Pencil size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => logNow(u)}
                        disabled={key === 'holiday' || key === 'leave'}
                        className="h-10 px-3.5 rounded-xl bg-lime-500 text-zinc-950 text-xs font-black flex items-center gap-1 shrink-0 disabled:opacity-30"
                      >
                        <Plus size={13} /> <span dir="rtl">سجّل</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Edit popover ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => !editBusy && setEditTarget(null)}>
          <div
            className="bg-[#161922] border border-[#212634] rounded-t-3xl sm:rounded-2xl w-full max-w-sm p-5 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="block text-sm font-black text-zinc-50" dir="ltr">{editTarget.name}</span>
            <span className="block text-[11px] text-zinc-500 mb-3" dir="ltr">Edit time · {date}</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">الحضور *</label>
                <input
                  type="time"
                  value={editTarget.in}
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, in: e.target.value } : t))}
                  className={INPUT}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">الانصراف</label>
                <input
                  type="time"
                  value={editTarget.out}
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, out: e.target.value } : t))}
                  className={INPUT}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 pb-[env(safe-area-inset-bottom)]">
              <button
                onClick={() => setEditTarget(null)}
                disabled={editBusy}
                className="flex-1 h-11 rounded-xl border border-[#212634] text-sm font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-50"
              >
                <span dir="rtl">إلغاء</span>
              </button>
              <button
                onClick={submitEdit}
                disabled={editBusy}
                className="flex-1 h-11 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {editBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span dir="rtl">حفظ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

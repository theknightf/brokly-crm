'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, CalendarDays, Clock, Zap, Users, Pencil, Plus, User,
  Loader2, CheckCircle2, ChevronDown, X, Timer, CalendarRange,
  LogIn, LogOut,
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
  attendance_date?: string;
  check_in_time: string | null;
  check_out_time: string | null;
  source?: string | null;
}
interface LeaveRow {
  userId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: string;
}
interface PermRow {
  id: string;
  userId?: string;
  user_id?: string;
  date: string;
  type: string;
  status: string;
}

// ─── Theme tokens (strict light/dark, no hardcoded dark surfaces) ──────────
const CARD = 'rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm';
const INPUT =
  'w-full bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors disabled:opacity-50';
const PRIMARY =
  'bg-primary text-primary-foreground hover:bg-primary/90 font-bold transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_10px_28px_-10px_rgba(132,204,22,0.5)]';
const SECONDARY =
  'border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold transition-colors';

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
function monthStart(iso: string): string {
  return iso.slice(0, 7) + '-01';
}
function nowHHMM(): string {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}
function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDuration(isoIn?: string | null, isoOut?: string | null): string {
  if (!isoIn || !isoOut) return '—';
  const ms = new Date(isoOut).getTime() - new Date(isoIn).getTime();
  if (Number.isNaN(ms) || ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function isoToHHMM(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Local wall-clock ISO for an admin-picked date + HH:MM. */
function buildISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time || '')) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type StatusKey = 'complete' | 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'remote' | 'excused';
const STATUS_META: Record<StatusKey, { label: string; cls: string }> = {
  complete: { label: 'Completed', cls: 'bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-500/10 dark:text-lime-300 dark:border-lime-500/30' },
  present: { label: 'Present', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
  late: { label: 'Late', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30' },
  absent: { label: 'Absent', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30' },
  leave: { label: 'On Leave', cls: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30' },
  holiday: { label: 'Holiday', cls: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30' },
  remote: { label: 'Remote', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30' },
  excused: { label: 'Excused', cls: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/30' },
};

function initialsOf(name: string): string {
  return String(name || '?').trim().split(/\s+/).map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
}

export default function AdminQuickAttendance() {
  const [date, setDate] = useState(todayLocal());
  const [users, setUsers] = useState<RosterUser[]>([]);
  const [att, setAtt] = useState<Record<string, AttRow>>({});
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [tolerance, setTolerance] = useState(12 * 60 + 20);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState('');

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
  const [rowIn, setRowIn] = useState<Record<string, string>>({});
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; in: string; out: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // ── Profile drawer ──
  const [drawerUser, setDrawerUser] = useState<RosterUser | null>(null);

  const qempRef = useQuickEmpDismiss(qOpen, () => setQOpen(false));

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
      setRowIn({});
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
      toast.error('Failed to load roster');
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
      if (rec.source === 'remote') return { key: 'remote', rec };
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
    const c: Record<StatusKey, number> = { complete: 0, present: 0, late: 0, absent: 0, leave: 0, holiday: 0, remote: 0, excused: 0 };
    activeUsers.forEach((u) => {
      c[statusOf(u).key] += 1;
    });
    return c;
  }, [activeUsers, statusOf]);

  async function postEdit(userId: string, day: string, inISO: string | null, outISO: string | null, extra?: { reason?: string; workMode?: string }) {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', userId, date: day, checkInTime: inISO, checkOutTime: outISO, reason: extra?.reason, workMode: extra?.workMode }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || 'Save failed');
    return j;
  }

  // ── State A: inline row check-in at the row's picked time ──
  const rowCheckIn = async (u: RosterUser) => {
    const t = rowIn[u.id] || nowHHMM();
    const inISO = buildISO(date, t);
    if (!inISO) {
      toast.error('Invalid time');
      return;
    }
    setRowBusy(u.id + ':in');
    try {
      await postEdit(u.id, date, inISO, null, { reason: 'Row quick check-in by admin' });
      toast.success(`${u.full_name || 'Employee'} checked in at ${t}`);
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'Check-in failed');
    } finally {
      setRowBusy('');
    }
  };

  // ── State B: check out now ──
  const rowCheckOut = async (u: RosterUser, rec: AttRow | null) => {
    setRowBusy(u.id + ':out');
    try {
      await postEdit(u.id, date, rec?.check_in_time || null, new Date().toISOString(), { reason: 'Row check-out by admin' });
      toast.success(`${u.full_name || 'Employee'} checked out`);
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'Check-out failed');
    } finally {
      setRowBusy('');
    }
  };

  // ── Quick entry bar submit ──
  const submitQuick = async () => {
    if (!qEmpId) {
      toast.error('Select an employee first');
      return;
    }
    const inISO = buildISO(date, qIn);
    if (!inISO) {
      toast.error('Invalid check-in time');
      return;
    }
    const outISO = qOut ? buildISO(date, qOut) : null;
    if (qOut && !outISO) {
      toast.error('Invalid check-out time');
      return;
    }
    if (outISO && new Date(outISO).getTime() < new Date(inISO).getTime()) {
      toast.error('Check-out cannot be before check-in');
      return;
    }
    setQBusy(true);
    try {
      await postEdit(qEmpId, date, inISO, outISO, { reason: 'Quick log by admin' });
      const emp = activeUsers.find((u) => u.id === qEmpId);
      toast.success(`${emp?.full_name || 'Employee'} logged for ${date}`, { duration: 4000 });
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setQBusy(false);
    }
  };

  // ── Batch submit ──
  const submitBatch = async () => {
    if (!bEmpId) {
      toast.error('Select an employee');
      return;
    }
    if (!bStart || !bEnd || bEnd < bStart) {
      toast.error('Check the date range');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(bIn)) {
      toast.error('Invalid check-in time');
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
        `Approved ${j.created} days for ${emp?.full_name || 'employee'} (${j.skippedExisting} already logged, ${j.skippedWeekend} weekends skipped).`
      );
      toast.success(`Batch approved: ${j.created} days`, { duration: 5000 });
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'Batch failed');
    } finally {
      setBBusy(false);
    }
  };

  // ── Edit popover submit ──
  const submitEdit = async () => {
    if (!editTarget) return;
    const inISO = buildISO(date, editTarget.in);
    if (!inISO) {
      toast.error('Invalid check-in time');
      return;
    }
    const outISO = editTarget.out ? buildISO(date, editTarget.out) : null;
    if (editTarget.out && !outISO) {
      toast.error('Invalid check-out time');
      return;
    }
    setEditBusy(true);
    try {
      await postEdit(editTarget.id, date, inISO, outISO, { reason: 'Time corrected by admin' });
      toast.success('Record updated');
      setEditTarget(null);
      await load(date);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setEditBusy(false);
    }
  };

  const qSelected = activeUsers.find((u) => u.id === qEmpId);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: date nav ── */}
      <div className={`${CARD} p-4 flex flex-wrap items-center gap-3`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Zap size={19} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-extrabold text-gray-900 dark:text-gray-100">Quick Attendance</span>
            <span className="block text-[11px] text-gray-500 dark:text-zinc-400">Instant admin logging, no GPS required</span>
          </span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <button
            onClick={() => setDate(addDaysStr(date, -1))}
            className={`h-10 px-3.5 rounded-xl text-xs ${SECONDARY}`}
          >
            Yesterday
          </button>
          <span className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 h-10">
            <CalendarDays size={14} className="text-primary shrink-0" />
            <input
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none"
            />
          </span>
          <button
            onClick={() => setDate(todayLocal())}
            className={`h-10 px-3.5 rounded-xl text-xs ${PRIMARY}`}
          >
            Today
          </button>
        </div>
      </div>

      {/* ── Quick entry bar ── */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Employee *</label>
            <div className="relative" ref={qempRef}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={qQuery}
                  onChange={(e) => {
                    setQQuery(e.target.value);
                    setQOpen(true);
                    if (!e.target.value) setQEmpId('');
                  }}
                  onFocus={() => setQOpen(true)}
                  placeholder="Search by name…"
                  className={`${INPUT} pl-9 pr-9`}
                />
                {qQuery ? (
                  <button
                    onClick={() => {
                      setQQuery('');
                      setQEmpId('');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200"
                    aria-label="Clear"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                )}
              </div>
              {qOpen && (
                <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                  <div className="max-h-56 overflow-y-auto py-1">
                    {filteredQ.length === 0 && (
                      <p className="px-3.5 py-3 text-xs text-gray-500 text-center">No matches</p>
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
                        className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 transition-colors ${
                          qEmpId === u.id
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold shrink-0">
                          {initialsOf(u.full_name || u.email)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate">{u.full_name || '—'}</span>
                          <span className="block text-[11px] text-gray-500 dark:text-zinc-400 truncate">
                            {u.role || 'staff'}{teamNameById.get(u.team_id || '') ? ` · ${teamNameById.get(u.team_id || '')}` : ''}
                          </span>
                        </span>
                        {qEmpId === u.id && <CheckCircle2 size={14} className="shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Check-in *</label>
            <span className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 h-[46px] focus-within:border-primary">
              <Clock size={14} className="text-primary shrink-0" />
              <input
                type="time"
                value={qIn}
                onChange={(e) => setQIn(e.target.value)}
                className="bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none w-full"
              />
            </span>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">
              Check-out <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <span className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 h-[46px] focus-within:border-primary">
              <Timer size={14} className="text-gray-400 shrink-0" />
              <input
                type="time"
                value={qOut}
                onChange={(e) => setQOut(e.target.value)}
                className="bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none w-full"
              />
              {qOut && (
                <button onClick={() => setQOut('')} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200" aria-label="Clear check-out">
                  <X size={13} />
                </button>
              )}
            </span>
          </div>
          <button
            onClick={submitQuick}
            disabled={qBusy || !qEmpId}
            className={`min-h-[56px] px-6 rounded-2xl text-[15px] flex items-center justify-center gap-2 ${PRIMARY}`}
          >
            {qBusy ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
            Instant Check-in
          </button>
        </div>
        {qSelected && (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-2">
            Logging for <b className="text-gray-800 dark:text-zinc-100">{qSelected.full_name}</b> on <b className="text-gray-800 dark:text-zinc-100">{date}</b> · no GPS required
          </p>
        )}
      </div>

      {/* ── Batch logger ── */}
      <div className={CARD}>
        <button
          onClick={() => setBatchOpen((o) => !o)}
          className="w-full p-4 flex items-center gap-2.5 text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center justify-center shrink-0">
            <CalendarRange size={17} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-extrabold text-gray-900 dark:text-gray-100">Weekly / Multi-Day Batch Logger</span>
            <span className="block text-[11px] text-gray-500 dark:text-zinc-400">Fill missing days across a date range</span>
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform shrink-0 ${batchOpen ? 'rotate-180' : ''}`} />
        </button>
        {batchOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-gray-200 dark:border-zinc-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Employee *</label>
                <select value={bEmpId} onChange={(e) => setBEmpId(e.target.value)} className={INPUT}>
                  <option value="">Select employee…</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Start date *</label>
                <input type="date" value={bStart} max={bEnd} onChange={(e) => e.target.value && setBStart(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">End date *</label>
                <input type="date" value={bEnd} min={bStart} max={todayLocal()} onChange={(e) => e.target.value && setBEnd(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Default check-in *</label>
                <input type="time" value={bIn} onChange={(e) => setBIn(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Default check-out</label>
                <input type="time" value={bOut} onChange={(e) => setBOut(e.target.value)} className={INPUT} />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setBExclude((v) => !v)}
                  aria-pressed={bExclude}
                  className={`w-full min-h-[46px] rounded-xl border-2 text-xs font-extrabold transition-all px-3 ${
                    bExclude
                      ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-500/10 dark:border-amber-400 dark:text-amber-200'
                      : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400'
                  }`}
                >
                  Exclude weekends {bExclude ? '· ON' : '· OFF'}
                  <span className="block text-[10px] font-semibold opacity-70">Skips Friday & Saturday</span>
                </button>
              </div>
            </div>
            <button
              onClick={submitBatch}
              disabled={bBusy || !bEmpId}
              className={`mt-3 w-full min-h-[52px] rounded-2xl text-[15px] flex items-center justify-center gap-2 ${PRIMARY}`}
            >
              {bBusy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              Batch Approve Attendance
            </button>
            {bResult && (
              <p className="mt-2 rounded-xl border border-lime-300 dark:border-lime-500/30 bg-lime-50 dark:bg-lime-500/10 px-3 py-2 text-[11px] text-lime-800 dark:text-lime-200 leading-relaxed">{bResult}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Roster ── */}
      <div className={CARD}>
        <div className="p-4 border-b border-gray-200 dark:border-zinc-800 flex flex-wrap items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 flex items-center justify-center shrink-0">
            <Users size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-gray-900 dark:text-gray-100">Daily Roster — {date}</span>
            <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-500 dark:text-zinc-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{counts.complete + counts.present + counts.late} in</span>·
              <span className="text-red-600 dark:text-red-400 font-bold">{counts.absent} absent</span>·
              <span>{counts.leave} leave</span>·<span>{counts.holiday} holiday</span>·
              <span>{activeUsers.length} staff</span>
            </span>
          </span>
          <span className="ms-auto relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={rosterQ}
              onChange={(e) => setRosterQ(e.target.value)}
              placeholder="Search staff…"
              className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-primary w-40"
            />
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : rosterRows.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No matching staff</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-800 text-[11px] text-gray-500 dark:text-zinc-400">
                    {['Employee', 'Team', 'Check-in', 'Check-out', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                  {rosterRows.map(({ user: u, key, rec }) => (
                    <RosterRowDesktop
                      key={u.id}
                      u={u}
                      statusKey={key}
                      rec={rec}
                      team={teamNameById.get(u.team_id || '') || '—'}
                      rowTime={rowIn[u.id] || nowHHMM()}
                      onRowTime={(t) => setRowIn((p) => ({ ...p, [u.id]: t }))}
                      busy={rowBusy}
                      onCheckIn={() => rowCheckIn(u)}
                      onCheckOut={() => rowCheckOut(u, rec)}
                      onEdit={() => setEditTarget({ id: u.id, name: u.full_name || u.email, in: isoToHHMM(rec?.check_in_time), out: isoToHHMM(rec?.check_out_time) })}
                      onProfile={() => setDrawerUser(u)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-zinc-800/60">
              {rosterRows.map(({ user: u, key, rec }) => (
                <RosterRowMobile
                  key={u.id}
                  u={u}
                  statusKey={key}
                  rec={rec}
                  team={teamNameById.get(u.team_id || '') || '—'}
                  rowTime={rowIn[u.id] || nowHHMM()}
                  onRowTime={(t) => setRowIn((p) => ({ ...p, [u.id]: t }))}
                  busy={rowBusy}
                  onCheckIn={() => rowCheckIn(u)}
                  onCheckOut={() => rowCheckOut(u, rec)}
                  onEdit={() => setEditTarget({ id: u.id, name: u.full_name || u.email, in: isoToHHMM(rec?.check_in_time), out: isoToHHMM(rec?.check_out_time) })}
                  onProfile={() => setDrawerUser(u)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Edit popover ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => !editBusy && setEditTarget(null)}>
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full max-w-sm p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-extrabold text-gray-900 dark:text-gray-100">{editTarget.name}</p>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">Edit entry · {date}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Check-in *</label>
                <input
                  type="time"
                  value={editTarget.in}
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, in: e.target.value } : t))}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Check-out</label>
                <input
                  type="time"
                  value={editTarget.out}
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, out: e.target.value } : t))}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 pb-[env(safe-area-inset-bottom)]">
              <button
                onClick={() => setEditTarget(null)}
                disabled={editBusy}
                className={`flex-1 h-11 rounded-xl text-sm ${SECONDARY} disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={editBusy}
                className={`flex-1 h-11 rounded-xl text-sm flex items-center justify-center gap-2 ${PRIMARY} disabled:opacity-50`}
              >
                {editBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile slide-over drawer ── */}
      {drawerUser && (
        <EmployeeDrawer
          user={drawerUser}
          team={teamNameById.get(drawerUser.team_id || '') || '—'}
          onClose={() => setDrawerUser(null)}
          onChanged={() => load(date)}
        />
      )}
    </div>
  );
}

// ─── Roster row: State A (absent) / B (active) / C (completed) ──────────────
interface RowProps {
  u: RosterUser;
  statusKey: StatusKey;
  rec: AttRow | null;
  team: string;
  rowTime: string;
  onRowTime: (t: string) => void;
  busy: string;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onEdit: () => void;
  onProfile: () => void;
}

function StatusPill({ statusKey }: { statusKey: StatusKey }) {
  const meta = STATUS_META[statusKey];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function ProfileButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="View attendance profile"
      aria-label="View attendance profile"
      className="h-9 w-9 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-100 flex items-center justify-center transition-colors shrink-0"
    >
      <User size={14} />
    </button>
  );
}

function RosterRowDesktop(p: RowProps) {
  const { u, statusKey, rec } = p;
  const isActive = statusKey === 'present' || statusKey === 'late' || statusKey === 'remote';
  const isDone = statusKey === 'complete';
  return (
    <tr className="hover:bg-gray-50/70 dark:hover:bg-zinc-800/30">
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-extrabold shrink-0">
            {initialsOf(u.full_name || u.email)}
          </span>
          <span className="min-w-0">
            <button onClick={p.onProfile} className="block text-sm font-bold text-gray-900 dark:text-gray-100 truncate hover:text-primary hover:underline text-left" title="Open attendance profile">
              {u.full_name || '—'}
            </button>
            <span className="block text-[10px] text-gray-500 dark:text-zinc-400">{u.role || 'staff'}</span>
          </span>
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-zinc-300">{p.team}</td>
      <td className="px-4 py-2.5 text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
        {rec?.check_in_time ? (
          fmtTime(rec.check_in_time)
        ) : (
          <input
            type="time"
            value={p.rowTime}
            onChange={(e) => p.onRowTime(e.target.value)}
            aria-label={`Check-in time for ${u.full_name}`}
            className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-primary w-[104px]"
          />
        )}
      </td>
      <td className="px-4 py-2.5 text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
        {fmtTime(rec?.check_out_time)}
      </td>
      <td className="px-4 py-2.5">
        <StatusPill statusKey={isActive && rec?.source === 'remote' ? 'remote' : statusKey} />
      </td>
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-1.5">
          {!rec?.check_in_time ? (
            /* State A: absent — inline check-in */
            <button
              onClick={p.onCheckIn}
              disabled={p.busy === u.id + ':in' || statusKey === 'holiday' || statusKey === 'leave'}
              className={`h-9 px-3.5 rounded-lg text-xs flex items-center gap-1.5 ${PRIMARY}`}
            >
              {p.busy === u.id + ':in' ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
              Check In
            </button>
          ) : !isDone ? (
            /* State B: active — check out + edit */
            <>
              <button
                onClick={p.onCheckOut}
                disabled={p.busy === u.id + ':out'}
                className="h-9 px-3.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 dark:bg-red-500/90 dark:hover:bg-red-500 flex items-center gap-1.5 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {p.busy === u.id + ':out' ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                Check Out
              </button>
              <button
                onClick={p.onEdit}
                className={`h-9 px-3 rounded-lg text-xs flex items-center gap-1 ${SECONDARY}`}
              >
                <Pencil size={12} /> Edit
              </button>
            </>
          ) : (
            /* State C: completed — edit */
            <button
              onClick={p.onEdit}
              className={`h-9 px-3 rounded-lg text-xs flex items-center gap-1 ${SECONDARY}`}
            >
              <Pencil size={12} /> Edit
            </button>
          )}
          <ProfileButton onClick={p.onProfile} />
        </span>
      </td>
    </tr>
  );
}

function RosterRowMobile(p: RowProps) {
  const { u, statusKey, rec } = p;
  const isActive = statusKey === 'present' || statusKey === 'late' || statusKey === 'remote';
  const isDone = statusKey === 'complete';
  return (
    <div className="p-3.5 flex items-center gap-3">
      <button
        onClick={p.onProfile}
        className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold shrink-0"
        aria-label="Open attendance profile"
      >
        {initialsOf(u.full_name || u.email)}
      </button>
      <span className="flex-1 min-w-0">
        <button onClick={p.onProfile} className="block text-sm font-bold text-gray-900 dark:text-gray-100 truncate text-left" title="Open attendance profile">
          {u.full_name || '—'}
        </button>
        <span className="block text-[11px] text-gray-500 dark:text-zinc-400 tabular-nums">
          {rec?.check_in_time ? (
            <>{fmtTime(rec.check_in_time)} → {fmtTime(rec.check_out_time)}</>
          ) : (
            <>Not checked in{p.team !== '—' ? ` · ${p.team}` : ''}</>
          )}
        </span>
        <span className="mt-1 inline-block"><StatusPill statusKey={statusKey} /></span>
        {!rec?.check_in_time && statusKey !== 'holiday' && statusKey !== 'leave' && (
          <span className="block mt-1.5">
            <input
              type="time"
              value={p.rowTime}
              onChange={(e) => p.onRowTime(e.target.value)}
              aria-label={`Check-in time for ${u.full_name}`}
              className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-primary w-[104px]"
            />
          </span>
        )}
      </span>
      <span className="flex flex-col items-stretch gap-1.5 shrink-0">
        {!rec?.check_in_time ? (
          <button
            onClick={p.onCheckIn}
            disabled={p.busy === u.id + ':in' || statusKey === 'holiday' || statusKey === 'leave'}
            className={`h-10 px-3.5 rounded-xl text-xs flex items-center gap-1 ${PRIMARY}`}
          >
            {p.busy === u.id + ':in' ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
            Check In
          </button>
        ) : !isDone ? (
          <>
            <button
              onClick={p.onCheckOut}
              disabled={p.busy === u.id + ':out'}
              className="h-10 px-3.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 dark:bg-red-500/90 flex items-center gap-1 disabled:opacity-50"
            >
              {p.busy === u.id + ':out' ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              Out
            </button>
            <button onClick={p.onEdit} className={`h-9 px-3 rounded-lg text-xs flex items-center justify-center gap-1 ${SECONDARY}`}>
              <Pencil size={12} /> Edit
            </button>
          </>
        ) : (
          <button onClick={p.onEdit} className={`h-10 px-3.5 rounded-xl text-xs flex items-center gap-1 ${SECONDARY}`}>
            <Pencil size={12} /> Edit
          </button>
        )}
        <span className="flex justify-end"><ProfileButton onClick={p.onProfile} /></span>
      </span>
    </div>
  );
}

// ─── Slide-over employee attendance profile drawer ──────────────────────────
type OverrideStatus = 'present' | 'late' | 'remote' | 'excused' | 'absent';

function EmployeeDrawer({
  user, team, onClose, onChanged,
}: {
  user: RosterUser;
  team: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [ovDate, setOvDate] = useState(todayLocal());
  const [ovStatus, setOvStatus] = useState<OverrideStatus>('present');
  const [ovIn, setOvIn] = useState('10:00');
  const [ovOut, setOvOut] = useState('18:00');
  const [ovReason, setOvReason] = useState('');
  const [ovBusy, setOvBusy] = useState(false);
  const [feed, setFeed] = useState<AttRow[]>([]);
  const [feedLeaves, setFeedLeaves] = useState<LeaveRow[]>([]);
  const [feedPerms, setFeedPerms] = useState<PermRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Mount animation (cleanup-safe).
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setShown(false);
    setTimeout(onClose, 250);
  };

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const from = monthStart(todayLocal());
      const to = todayLocal();
      const [rep, perms] = await Promise.all([
        fetch(`/api/attendance/report?from=${from}&to=${to}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/attendance/permissions?from=${from}&to=${to}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ permissions: [] })),
      ]);
      setFeed(((rep?.attendance || []) as AttRow[]).filter((r) => r.user_id === user.id));
      setFeedLeaves([]);
      try {
        const { leaveService } = await import('@/lib/services/peopleOpsService');
        const all = await leaveService.getAll();
        setFeedLeaves(
          (all || [])
            .filter((l: any) => l.status === 'approved' && l.userId === user.id)
            .map((l: any) => ({ userId: l.userId, startDate: l.startDate, endDate: l.endDate, leaveType: l.leaveType, status: l.status }))
        );
      } catch {}
      setFeedPerms(((perms?.permissions || []) as any[]).filter((x) => (x.userId || x.user_id) === user.id));
    } catch {
      setFeed([]);
    } finally {
      setFeedLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = monthStart(todayLocal()); d <= todayLocal(); d = addDaysStr(d, 1)) out.push(d);
    return out.reverse();
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, AttRow>();
    feed.forEach((r) => {
      if (r.attendance_date) m.set(r.attendance_date, r);
    });
    return m;
  }, [feed]);

  const dayStatus = useCallback(
    (day: string): { key: StatusKey; rec: AttRow | null; note?: string } => {
      const rec = byDate.get(day) || null;
      if (feedLeaves.some((l) => day >= l.startDate && day <= l.endDate)) return { key: 'leave', rec };
      const perm = feedPerms.find((x) => x.date === day && x.status === 'approved');
      if (!rec?.check_in_time) {
        if (perm) return { key: 'excused', rec, note: perm.type };
        return { key: isFridayHoliday(day) ? 'holiday' : 'absent', rec };
      }
      if (rec.source === 'remote') return { key: 'remote', rec };
      if (perm) return { key: 'excused', rec, note: perm.type };
      if (rec.check_out_time) return { key: 'complete', rec };
      return { key: 'present', rec };
    },
    [byDate, feedLeaves, feedPerms]
  );

  const submitOverride = async () => {
    if (!ovDate || ovDate > todayLocal()) {
      toast.error('Pick a valid past or current date');
      return;
    }
    if (ovStatus === 'absent') {
      if (!window.confirm(`Clear ${user.full_name}'s record on ${ovDate} (mark absent)?`)) return;
      setOvBusy(true);
      try {
        const res = await fetch(`/api/attendance?userId=${encodeURIComponent(user.id)}&date=${ovDate}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Failed');
        toast.success(j.cleared ? `Record cleared — marked absent on ${ovDate}` : `No record on ${ovDate} — already absent`);
        await loadFeed();
        onChanged();
      } catch (e: any) {
        toast.error(e?.message || 'Failed');
      } finally {
        setOvBusy(false);
      }
      return;
    }
    if (ovStatus === 'excused') {
      setOvBusy(true);
      try {
        const res = await fetch('/api/attendance/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            date: ovDate,
            type: 'mission',
            excusedMinutes: 480,
            reason: ovReason.trim() || 'Excused by admin',
            status: 'approved',
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Failed');
        toast.success(`Excused for ${ovDate} — absence covered`);
        await loadFeed();
        onChanged();
      } catch (e: any) {
        toast.error(e?.message || 'Failed');
      } finally {
        setOvBusy(false);
      }
      return;
    }
    // present / late / remote → timed record (delay auto-computed)
    if (!/^\d{1,2}:\d{2}$/.test(ovIn)) {
      toast.error('Enter a valid check-in time');
      return;
    }
    const inISO = buildISO(ovDate, ovIn);
    if (!inISO) {
      toast.error('Invalid check-in time');
      return;
    }
    const outISO = ovOut ? buildISO(ovDate, ovOut) : null;
    if (ovOut && !outISO) {
      toast.error('Invalid check-out time');
      return;
    }
    setOvBusy(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          userId: user.id,
          date: ovDate,
          checkInTime: inISO,
          checkOutTime: outISO,
          reason: ovStatus === 'remote' ? `Remote work${ovReason.trim() ? ` — ${ovReason.trim()}` : ''}` : ovReason.trim() || `Past override (${ovStatus}) by admin`,
          workMode: ovStatus === 'remote' ? 'remote' : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed');
      toast.success(`Record updated for ${ovDate}`);
      await loadFeed();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setOvBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${user.full_name} attendance profile`}>
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
          <span className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-sm font-extrabold shrink-0">
            {initialsOf(user.full_name || user.email)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-base font-extrabold text-gray-900 dark:text-gray-100 truncate">{user.full_name || '—'}</span>
            <span className="block text-xs text-gray-500 dark:text-zinc-400 truncate">{user.role || 'staff'} · {team}</span>
          </span>
          <button
            onClick={handleClose}
            aria-label="Close profile"
            className="w-9 h-9 rounded-full text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-100 flex items-center justify-center transition-colors shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Past date override */}
          <section className="rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/60 p-4">
            <p className="text-sm font-extrabold text-gray-900 dark:text-gray-100">Past Date Override</p>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">Correct any previous day for this employee</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Date *</label>
                <input type="date" value={ovDate} max={todayLocal()} onChange={(e) => e.target.value && setOvDate(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Status *</label>
                <select value={ovStatus} onChange={(e) => setOvStatus(e.target.value as OverrideStatus)} className={INPUT}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="remote">Remote</option>
                  <option value="excused">Excused</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              {ovStatus !== 'absent' && ovStatus !== 'excused' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Check-in *</label>
                    <input type="time" value={ovIn} onChange={(e) => setOvIn(e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">Check-out</label>
                    <input type="time" value={ovOut} onChange={(e) => setOvOut(e.target.value)} className={INPUT} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-200 mb-1.5">
                  Note <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  value={ovReason}
                  onChange={(e) => setOvReason(e.target.value)}
                  placeholder="Reason for this change…"
                  className={INPUT}
                />
              </div>
              <button
                onClick={submitOverride}
                disabled={ovBusy}
                className={`w-full min-h-[48px] rounded-xl text-sm flex items-center justify-center gap-2 ${PRIMARY}`}
              >
                {ovBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Update Record
              </button>
            </div>
          </section>

          {/* Monthly log feed */}
          <section>
            <p className="text-sm font-extrabold text-gray-900 dark:text-gray-100">Monthly Log</p>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-2">{todayLocal().slice(0, 7)} · newest first</p>
            {feedLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {days.map((d) => {
                  const { key, rec, note } = dayStatus(d);
                  const meta = STATUS_META[key];
                  return (
                    <div key={d} className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-bold text-gray-900 dark:text-gray-100">{fmtDay(d)}</span>
                        <span className="block text-[11px] text-gray-500 dark:text-zinc-400 tabular-nums">
                          {rec?.check_in_time ? `${fmtTime(rec.check_in_time)} → ${fmtTime(rec.check_out_time)} · ${fmtDuration(rec.check_in_time, rec.check_out_time)}` : note || d}
                        </span>
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

// Close the quick-entry employee dropdown on outside click (cleanup-safe).
export function useQuickEmpDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);
  return ref;
}

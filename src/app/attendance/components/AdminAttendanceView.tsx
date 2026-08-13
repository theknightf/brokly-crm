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
} from 'lucide-react';
import { toast } from 'sonner';
import { roleBadgeOf } from '@/lib/ui';
import { teamsService } from '@/lib/services/crmService';
import { exportPDF, exportCSV } from '@/lib/exportReport';
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

interface TeamOption {
  id: string;
  name: string;
}

const OFFICE_TOLERANCE_MIN = 12 * 60 + 30; // 12:30
const OFFICE_END_MIN = 20 * 60; // 20:00

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(sec: number): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function minutesOfDay(iso: string | null): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}

function durationSeconds(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 1000);
}

type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'Leave',
  'checked-out': 'Checked Out',
  'not-checked-in': 'Not Checked In',
};

function statusBadge(status: string) {
  switch (status) {
    case 'present':
      return 'bg-teal-soft text-teal';
    case 'late':
      return 'bg-gold-soft text-gold-dark';
    case 'absent':
      return 'bg-clay-soft text-clay';
    case 'leave':
      return 'bg-dusk-soft text-dusk';
    case 'checked-out':
      return 'bg-muted text-muted-foreground';
    case 'not-checked-in':
      return 'bg-clay-soft text-clay';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function AdminAttendanceView() {
  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState(() => localDay(-6));
  const [customTo, setCustomTo] = useState(() => todayLocal());
  const [users, setUsers] = useState<AttendanceUser[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [manualOpen, setManualOpen] = useState(false);
  const [editUser, setEditUser] = useState<AttendanceUser | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const { from, to, isSingleDay } = useMemo(() => {
    switch (range) {
      case 'yesterday':
        return { from: localDay(-1), to: localDay(-1), isSingleDay: true };
      case 'week': {
        const today = new Date();
        const dow = today.getDay();
        return { from: localDay(-dow), to: todayLocal(), isSingleDay: false };
      }
      case 'month': {
        const today = new Date();
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`,
          to: todayLocal(),
          isSingleDay: false,
        };
      }
      case 'custom':
        return { from: customFrom, to: customTo, isSingleDay: customFrom === customTo };
      default:
        return { from: todayLocal(), to: todayLocal(), isSingleDay: true };
    }
  }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, teamsList] = await Promise.all([
        fetch(`/api/attendance/report?from=${from}&to=${to}`, { cache: 'no-store' }),
        teamsService.getAll().then((rows) =>
          rows.map((x) => ({ id: x.id, name: x.name }))
        ).catch(() => [] as TeamOption[]),
      ]);
      if (!reportRes.ok) throw new Error('Failed to load attendance data');
      const data = await reportRes.json();
      setUsers(data.users || []);
      setRecords(data.attendance || []);
      setTeams(teamsList);
    } catch {
      toast.error('Unable to load attendance data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  const recordByUser = useMemo(() => {
    const map: Record<string, AttendanceRecord[]> = {};
    records.forEach((r) => {
      if (!map[r.user_id]) map[r.user_id] = [];
      map[r.user_id].push(r);
    });
    return map;
  }, [records]);

  const activeUsers = users.filter((u) => u.is_active !== false);

  // Per-user aggregation for the period.
  const rows = useMemo(() => {
    const daysInRange = Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
    const out = activeUsers.map((u) => {
      const recs = recordByUser[u.id] || [];
      let present = 0;
      let late = 0;
      let checkedInNotOut = 0;
      let totalSec = 0;
      let overtimeMin = 0;
      let lastStatus = 'not-checked-in';
      recs.forEach((r) => {
        if (r.check_in_time) {
          present += 1;
          const min = minutesOfDay(r.check_in_time);
          if (min > OFFICE_TOLERANCE_MIN) late += 1;
          if (!r.check_out_time) checkedInNotOut += 1;
          const sec = durationSeconds(r.check_in_time, r.check_out_time);
          totalSec += sec;
          const outMin = minutesOfDay(r.check_out_time);
          if (outMin > OFFICE_END_MIN) overtimeMin += outMin - OFFICE_END_MIN;
        }
      });
      const todayRec = recs.find((r) => r.attendance_date === todayLocal());
      if (todayRec?.check_in_time && !todayRec.check_out_time) lastStatus = 'checked-out';
      else if (todayRec?.check_in_time) lastStatus = minutesOfDay(todayRec.check_in_time) > OFFICE_TOLERANCE_MIN ? 'late' : 'present';
      else if (todayRec) lastStatus = 'not-checked-in';
      else if (isSingleDay) lastStatus = 'absent';
      const absent = Math.max(0, daysInRange - present);
      const attendanceRate = daysInRange ? Math.round((present / daysInRange) * 100) : 0;
      return {
        user: u,
        present,
        late,
        absent,
        checkedInNotOut,
        totalSec,
        totalHours: totalSec / 3600,
        overtimeMin,
        lastStatus,
        attendanceRate,
      };
    });
    return out;
  }, [activeUsers, recordByUser, from, to, isSingleDay]);

  const summary = useMemo(() => {
    const todayRecs = recordByUser;
    let present = 0;
    let late = 0;
    let notCheckedIn = 0;
    activeUsers.forEach((u) => {
      const rec = (todayRecs[u.id] || []).find((r) => r.attendance_date === todayLocal());
      if (rec?.check_in_time) {
        present += 1;
        if (minutesOfDay(rec.check_in_time) > OFFICE_TOLERANCE_MIN) late += 1;
      } else if (isSingleDay) notCheckedIn += 1;
    });
    const totalEmployees = activeUsers.length;
    const totalSec = rows.reduce((s, r) => s + r.totalSec, 0);
    const avgHours = rows.length ? totalSec / 3600 / rows.length : 0;
    const totalOvertime = rows.reduce((s, r) => s + r.overtimeMin, 0);
    const presentSlots = rows.reduce((s, r) => s + r.present, 0);
    const expectedSlots = Math.max(1, activeUsers.length) * Math.max(1, isSingleDay ? 1 : Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1));
    const attendanceRate = expectedSlots ? Math.round((presentSlots / expectedSlots) * 100) : 0;
    return {
      present,
      absentToday: Math.max(0, totalEmployees - present),
      late,
      notCheckedIn,
      avgHours,
      totalOvertime,
      attendanceRate,
      totalEmployees,
    };
  }, [activeUsers, recordByUser, rows, isSingleDay, from, to]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (q && !r.user.full_name.toLowerCase().includes(q) && !r.user.email.toLowerCase().includes(q)) return false;
      if (teamFilter !== 'all' && r.user.team_id !== teamFilter) return false;
      if (statusFilter !== 'all' && r.lastStatus !== statusFilter && !(statusFilter === 'present' && r.lastStatus === 'present')) return false;
      return true;
    });
  }, [rows, search, teamFilter, statusFilter]);

  const handleQuickAction = async (action: 'checkin' | 'checkout', user: AttendanceUser) => {
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId: user.id, date: todayLocal() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      toast.success(action === 'checkin' ? 'Check-in recorded' : 'Check-out recorded');
      setReloadTick((t) => t + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update attendance');
    }
  };

  // ── Reports ──────────────────────────────────────────────────────────
  const dailyReport = () => {
    const headers = ['Employee', 'Status', 'Check In', 'Check Out', 'Working Hours', 'Late (min)', 'Overtime (min)'];
    const rowsData = filteredRows.map((r) => [
      r.user.full_name || r.user.email,
      STATUS_LABELS[r.lastStatus] || r.lastStatus,
      fmtTime(recordByUser[r.user.id]?.find((x) => x.attendance_date === todayLocal())?.check_in_time ?? null),
      fmtTime(recordByUser[r.user.id]?.find((x) => x.attendance_date === todayLocal())?.check_out_time ?? null),
      fmtDuration(r.totalSec),
      String(r.late),
      String(r.overtimeMin),
    ]);
    exportPDF(
      'Daily Attendance Report',
      `${todayLocal()} · Generated ${new Date().toLocaleString()}`,
      [
        { label: 'Present', value: String(summary.present) },
        { label: 'Late', value: String(summary.late) },
        { label: 'Absent', value: String(summary.absentToday) },
        { label: 'Employees', value: String(summary.totalEmployees) },
      ],
      [{ caption: 'Daily Report', headers, rows: rowsData }],
      'attendance-daily'
    );
    exportCSV('attendance-daily', headers, rowsData);
  };

  const monthlyReport = () => {
    const headers = ['Employee', 'Working Days', 'Present', 'Absent', 'Late Days', 'Leave Days', 'Total Hours', 'Avg Hours', 'Overtime (min)'];
    const rowsData = filteredRows.map((r) => [
      r.user.full_name || r.user.email,
      String(Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)),
      String(r.present),
      String(r.absent),
      String(r.late),
      '0',
      r.totalHours.toFixed(1),
      (r.totalHours / Math.max(1, r.present)).toFixed(1),
      String(r.overtimeMin),
    ]);
    exportPDF(
      'Monthly Attendance Report',
      `${from} → ${to} · Generated ${new Date().toLocaleString()}`,
      [
        { label: 'Attendance Rate', value: `${summary.attendanceRate}%` },
        { label: 'Total Hours', value: summary.avgHours ? (summary.avgHours * summary.totalEmployees).toFixed(1) : '0' },
        { label: 'Employees', value: String(summary.totalEmployees) },
      ],
      [{ caption: 'Monthly Report', headers, rows: rowsData }],
      'attendance-monthly'
    );
    exportCSV('attendance-monthly', headers, rowsData);
  };

  const employeeReport = (user: AttendanceUser) => {
    const recs = recordByUser[user.id] || [];
    const headers = ['Date', 'Check In', 'Check Out', 'Working Hours', 'Status'];
    const rowsData = recs.map((r) => [
      r.attendance_date,
      fmtTime(r.check_in_time),
      fmtTime(r.check_out_time),
      fmtDuration(durationSeconds(r.check_in_time, r.check_out_time)),
      r.check_in_time ? (minutesOfDay(r.check_in_time) > OFFICE_TOLERANCE_MIN ? 'Late' : 'Present') : 'Absent',
    ]);
    exportPDF(
      `Attendance Report — ${user.full_name || user.email}`,
      `${from} → ${to} · Generated ${new Date().toLocaleString()}`,
      [
        { label: 'Days Present', value: String(recs.filter((r) => r.check_in_time).length) },
        { label: 'Total Hours', value: fmtDuration(recs.reduce((s, r) => s + durationSeconds(r.check_in_time, r.check_out_time), 0)) },
      ],
      [{ caption: 'Employee Attendance', headers, rows: rowsData }],
      `attendance-${user.full_name || 'employee'}`
    );
    exportCSV(`attendance-${user.full_name || 'employee'}`, headers, rowsData);
  };

  const showEditModal = (user: AttendanceUser) => setEditUser(user);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarCheck2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Attendance</h1>
            <p className="text-sm text-muted-foreground">
              Office hours 12:00 – 20:00 · Arrival after 12:30 = Late
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={dailyReport} className="btn-secondary h-9 px-3 text-sm flex items-center gap-1.5">
            <Printer size={14} /> Daily
          </button>
          <button onClick={monthlyReport} className="btn-secondary h-9 px-3 text-sm flex items-center gap-1.5">
            <Download size={14} /> Monthly
          </button>
          <button
            onClick={() => setManualOpen(true)}
            className="btn-primary h-9 px-3 text-sm flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Manual Attendance
          </button>
        </div>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-wrap">
          {([
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['custom', 'Custom'],
          ] as [RangeKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                range === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input-base text-sm" />
            <span className="text-muted-foreground text-sm">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-base text-sm" />
          </div>
        )}
        <button onClick={() => setReloadTick((t) => t + 1)} className="btn-ghost p-2" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Present Today', value: summary.present, color: 'text-teal', icon: <CheckCircle2 size={16} className="text-teal" /> },
          { label: 'Absent Today', value: summary.absentToday, color: 'text-clay', icon: <XCircle size={16} className="text-clay" /> },
          { label: 'Late Today', value: summary.late, color: 'text-gold-dark', icon: <AlertTriangle size={16} className="text-gold-dark" /> },
          { label: 'Avg Working Hours', value: `${summary.avgHours.toFixed(1)}h`, color: 'text-foreground', icon: <Clock size={16} className="text-muted-foreground" /> },
          { label: 'Total Overtime', value: fmtDuration(summary.totalOvertime * 60), color: 'text-dusk', icon: <Timer size={16} className="text-dusk" /> },
          { label: 'Attendance Rate', value: `${summary.attendanceRate}%`, color: 'text-primary', icon: <Users size={16} className="text-primary" /> },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              {s.icon}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="input-base w-full pl-9 text-sm"
          />
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="input-base text-sm">
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm">
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Table / cards */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <CalendarCheck2 size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No attendance data available yet.</p>
          <p className="text-xs text-muted-foreground mb-4">No records match the current filters.</p>
          <button onClick={() => setManualOpen(true)} className="btn-primary h-9 px-3 text-sm flex items-center gap-1.5 mx-auto">
            <Plus size={14} /> Add Manual Attendance
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-border rounded-2xl overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Check In</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Check Out</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Working Hours</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Late</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overtime</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((r) => {
                  const todayRec = recordByUser[r.user.id]?.find((x) => x.attendance_date === todayLocal());
                  const badge = roleBadgeOf(r.user.role);
                  return (
                    <tr key={r.user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {(r.user.full_name || r.user.email)
                                .split(' ')
                                .map((p) => p[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{r.user.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {badge.label}
                              {r.user.team_id ? ' · Team member' : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${statusBadge(r.lastStatus)}`}>
                          {STATUS_LABELS[r.lastStatus] || r.lastStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{fmtTime(todayRec?.check_in_time ?? null)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{fmtTime(todayRec?.check_out_time ?? null)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{fmtDuration(r.totalSec)}</td>
                      <td className="px-4 py-3 text-sm">{r.late > 0 ? <span className="text-gold-dark font-medium">{r.late}d</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3 text-sm">{r.overtimeMin > 0 ? <span className="text-dusk font-medium">{fmtDuration(r.overtimeMin * 60)}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => employeeReport(r.user)} className="btn-ghost p-1.5" title="View report">
                            <Eye size={14} className="text-muted-foreground" />
                          </button>
                          <button onClick={() => showEditModal(r.user)} className="btn-ghost p-1.5" title="Edit">
                            <Pencil size={14} className="text-muted-foreground" />
                          </button>
                          {isSingleDay && todayRec && !todayRec.check_out_time && todayRec.check_in_time ? (
                            <button
                              onClick={() => handleQuickAction('checkout', r.user)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                            >
                              <LogOut size={12} /> Check Out
                            </button>
                          ) : isSingleDay && !todayRec?.check_in_time ? (
                            <button
                              onClick={() => handleQuickAction('checkin', r.user)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                            >
                              <LogIn size={12} /> Check In
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filteredRows.map((r) => {
              const todayRec = recordByUser[r.user.id]?.find((x) => x.attendance_date === todayLocal());
              const badge = roleBadgeOf(r.user.role);
              return (
                <div key={r.user.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {(r.user.full_name || r.user.email)
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.user.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">{badge.label}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0 ${statusBadge(r.lastStatus)}`}>
                      {STATUS_LABELS[r.lastStatus] || r.lastStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Check In</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{fmtTime(todayRec?.check_in_time ?? null)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Check Out</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{fmtTime(todayRec?.check_out_time ?? null)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Working Hours</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{fmtDuration(r.totalSec)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Late / Overtime</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        {r.late > 0 ? `${r.late}d late` : '—'} · {r.overtimeMin > 0 ? fmtDuration(r.overtimeMin * 60) : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => employeeReport(r.user)} className="btn-secondary h-9 px-3 text-xs flex-1 flex items-center justify-center gap-1.5">
                      <Eye size={13} /> View
                    </button>
                    <button onClick={() => showEditModal(r.user)} className="btn-secondary h-9 px-3 text-xs flex-1 flex items-center justify-center gap-1.5">
                      <Pencil size={13} /> Edit
                    </button>
                    {isSingleDay && !todayRec?.check_in_time ? (
                      <button onClick={() => handleQuickAction('checkin', r.user)} className="btn-primary h-9 px-3 text-xs flex-1 flex items-center justify-center gap-1.5">
                        <LogIn size={13} /> Check In
                      </button>
                    ) : isSingleDay && todayRec?.check_in_time && !todayRec.check_out_time ? (
                      <button onClick={() => handleQuickAction('checkout', r.user)} className="h-9 px-3 text-xs flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 text-white">
                        <LogOut size={13} /> Check Out
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {manualOpen && (
        <ManualAttendanceModal
          users={users}
          defaultDate={isSingleDay ? from : todayLocal()}
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
          defaultDate={isSingleDay ? from : todayLocal()}
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
'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import {
  BarChart3,
  Loader2,
  RefreshCw,
  Users,
  UserCheck,
  DollarSign,
  Target,
  FileDown,
  Clock,
  CalendarCheck,
  CheckSquare,
  Phone,
  FolderKanban,
  GitBranch,
  Receipt,
  Banknote,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import { reportsService } from '@/lib/services/crmService';
import { companySettingsService, type WorkingHours, DEFAULT_WORKING_HOURS } from '@/lib/services/peopleOpsService';
import { buildOfficeHours, formatMinutes, type OfficeHoursConfig } from '@/lib/officeHours';
import { toast } from 'sonner';
import { exportPDF, exportCSV } from '@/lib/exportReport';
import CallLogsReport from './CallLogsReport';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';

const COLORS = [
  '#84cc16',
  '#65a30d',
  '#a3e635',
  '#22c55e',
  '#4d7c0f',
  '#365314',
  '#16a34a',
  '#d9f99d',
];

function formatCurrency(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ج.م`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K ج.م`;
  return `${value.toLocaleString()} ج.م`;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return isoDay(new Date());
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

function monthStartIso(): string {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

function weekStartIso(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  return isoDay(monday);
}

function yearStartIso(): string {
  const now = new Date();
  return isoDay(new Date(now.getFullYear(), 0, 1));
}

function presetRange(key: RangePreset): { from: string; to: string } {
  const today = todayIso();
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: weekStartIso(), to: today };
    case 'month':
      return { from: monthStartIso(), to: today };
    case 'year':
      return { from: yearStartIso(), to: today };
    case 'custom':
    default:
      return { from: daysAgoIso(6), to: today };
  }
}

function countDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

// Local wall-clock minutes (0..1439) from an ISO timestamp. This mirrors what
// the admin's attendance tab shows, so "late after 12:30" is computed the same.
function toLocalMinutes(iso: string | null): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}

interface ActivityRow {
  id: string;
  name: string;
  email: string;
  role: string;
  byHour: Record<number, number>;
  byAction: Record<string, number>;
  total: number;
}

interface AttendanceRow {
  id: string;
  name: string;
  email: string;
  role: string;
  present: number;
  onTime: number;
  late: number;
  lateMinutes: number;
  absent: number;
  records: { date: string; minutes: number }[];
}

function buildActivityRows(activity: any): ActivityRow[] {
  const users = activity?.users || [];
  const rows: ActivityRow[] = users.map((u: any) => ({
    id: u.id,
    name: u.full_name || u.email,
    email: u.email,
    role: u.role,
    byHour: {},
    byAction: {},
    total: 0,
  }));
  const idx = new Map(rows.map((r) => [r.id, r]));
  for (const a of activity?.activity || []) {
    const r = idx.get(a.user_id);
    if (!r) continue;
    const h =
      toLocalMinutes(a.created_at) >= 0 ? Math.floor(toLocalMinutes(a.created_at) / 60) : -1;
    if (h >= 0) r.byHour[h] = (r.byHour[h] || 0) + 1;
    r.byAction[a.action_type || 'Action'] = (r.byAction[a.action_type || 'Action'] || 0) + 1;
    r.total++;
  }
  return rows.sort((a, b) => b.total - a.total);
}

interface HourRow {
  id: string;
  name: string;
  role: string;
  actions: number;
  calls: number;
  byAction: Record<string, number>;
}

// Per-user counts within a single selected hour (used by the hour filter).
// "Calls" = follow-ups whose type is a phone/Video Call.
function buildHourRows(activity: any, hour: number): HourRow[] {
  const users = activity?.users || [];
  const rows: HourRow[] = users.map((u: any) => ({
    id: u.id,
    name: u.full_name || u.email,
    role: u.role,
    actions: 0,
    calls: 0,
    byAction: {},
  }));
  const idx = new Map(rows.map((r) => [r.id, r]));
  for (const a of activity?.activity || []) {
    const r = idx.get(a.user_id);
    if (!r) continue;
    const mins = toLocalMinutes(a.created_at);
    if (mins < 0 || Math.floor(mins / 60) !== hour) continue;
    r.actions++;
    const t = a.action_type || 'Action';
    r.byAction[t] = (r.byAction[t] || 0) + 1;
    if (a.meta === 'Call' || a.meta === 'Video Call') r.calls++;
  }
  return rows.filter((r) => r.actions > 0).sort((a, b) => b.actions - a.actions);
}

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

function buildAttendanceRows(
  attendance: any,
  from: string,
  to: string,
  toleranceMinutes: number
): AttendanceRow[] {
  const users = attendance?.users || [];
  const totalDays = countDays(from, to);
  const rows: AttendanceRow[] = users.map((u: any) => ({
    id: u.id,
    name: u.full_name || u.email,
    email: u.email,
    role: u.role,
    present: 0,
    onTime: 0,
    late: 0,
    lateMinutes: 0,
    absent: totalDays,
    records: [],
  }));
  const idx = new Map(rows.map((r) => [r.id, r]));
  for (const a of attendance?.attendance || []) {
    const r = idx.get(a.user_id);
    if (!r) continue;
    const m = toLocalMinutes(a.check_in_time);
    r.present++;
    r.absent = Math.max(0, r.absent - 1);
    if (m >= 0 && m <= toleranceMinutes) {
      r.onTime++;
      r.records.push({ date: a.attendance_date, minutes: m });
    } else if (m >= 0) {
      r.late++;
      r.lateMinutes += Math.max(0, m - 12 * 60);
      r.records.push({ date: a.attendance_date, minutes: m });
    }
  }
  return rows;
}

interface ReportData {
  totalLeads: number;
  totalCustomers: number;
  totalRevenue: number;
  conversionRate: string;
  leadsByStatus: Record<string, number>;
  leadsBySource: Record<string, number>;
  leadsByPropertyType: Record<string, number>;
  followUpsByStatus: Record<string, number>;
  monthlyLeads: { month: string; leads: number; won: number }[];
  agentPerformance: { name: string; leads: number; won: number; rate: string }[];
  teamPerformance: {
    id: string;
    name: string;
    leaderId: string | null;
    leaderName: string;
    assignedLeads: number;
    closedDeals: number;
    totalRevenue: number;
    conversionRate: number;
    calls: number;
    callDurationSeconds: number;
    expenses: number;
    profit: number;
    profitMargin: number;
    leaderRating: number | null;
    leaderRatingComment: string;
    leaderRatingAt: string | null;
  }[];
  teamAgentPerformance: {
    id: string;
    name: string;
    teamId: string | null;
    teamName: string;
    totalLeads: number;
    pending: number;
    new: number;
    calls: number;
  }[];
  callsByEmployee: {
    userId: string;
    name: string;
    calls: number;
    totalDurationSeconds: number;
    connected: number;
    noAnswer: number;
    incoming: number;
  }[];
  previousPeriod?: {
    from: string;
    to: string;
    totalLeads: number;
    totalCustomers: number;
    totalRevenue: number;
    conversionRate: number;
    leadsChange: number;
    customersChange: number;
    revenueChange: number;
    conversionChange: number;
  } | null;
}

function fmtMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

type TabKey = 'overview' | 'leads' | 'sales' | 'team' | 'attendance' | 'calls';

// Landing cards — a small set of friendly CATEGORY CARDS. `target` is either
// an in-page tab key or a route to an existing dedicated page/section.
type ReportCardTarget = TabKey | string;
const CATEGORY_CARDS: {
  key: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  target: ReportCardTarget;
}[] = [
  { key: 'myPerformance', title: 'My performance', desc: 'Your leads, wins and conversion at a glance', icon: UserCheck, target: 'overview' },
  { key: 'teamPerformance', title: 'Team performance', desc: 'How every agent and team is doing', icon: Users, target: 'team' },
  { key: 'leadStages', title: 'Lead stages', desc: 'See how many leads are New, Pending, Interested and Won', icon: GitBranch, target: 'leads' },
  { key: 'leadsFollowUps', title: 'Leads & follow-ups', desc: 'Where leads come from and follow-up status', icon: BarChart3, target: 'leads' },
  { key: 'salesRevenue', title: 'Sales & revenue', desc: 'Deals closed and money earned', icon: DollarSign, target: 'sales' },
  { key: 'calls', title: 'Calls', desc: 'Call volume, duration and outcomes', icon: Phone, target: 'calls' },
  { key: 'attendance', title: 'Attendance', desc: 'Who was on time, late or absent', icon: Clock, target: 'attendance' },
];

// Secondary, route-based reports kept one tap away under "More reports".
const MORE_CARDS: {
  key: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  target: ReportCardTarget;
  adminOnly?: boolean;
}[] = [
  { key: 'meetings', title: 'Meetings', desc: 'Scheduled site visits and meetings', icon: CalendarCheck, target: '/calendar' },
  { key: 'followUps', title: 'Follow-ups', desc: 'Pending and completed follow-ups', icon: CheckSquare, target: '/follow-ups' },
  { key: 'projects', title: 'Projects', desc: 'Project pipeline and pitches', icon: FolderKanban, target: '/projects' },
  { key: 'expenses', title: 'Expenses', desc: 'Spend by category and team', icon: Receipt, target: '/expenses' },
  { key: 'payroll', title: 'Payroll', desc: 'Payroll entries, bonuses and deductions', icon: Banknote, target: '/admin?tab=payroll', adminOnly: true },
  { key: 'accounts', title: 'Accounts', desc: 'Company accounts and balances', icon: Wallet, target: '/admin?tab=leadSources', adminOnly: true },
  { key: 'kpis', title: 'KPIs', desc: 'Team KPI targets vs actual results', icon: Target, target: '/admin?tab=kpiTargets', adminOnly: true },
];

// Friendly title shown when a category report is open.
const VIEW_TITLES: Record<string, string> = {
  overview: 'My performance',
  team: 'Team performance',
  leads: 'Leads & follow-ups',
  sales: 'Sales & revenue',
  calls: 'Calls',
  attendance: 'Attendance',
};

export default function ReportsScreen() {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<RangePreset>('week');
  const initialRange = presetRange('week');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [activity, setActivity] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [hourFilter, setHourFilter] = useState<number | 'all'>('all');
  const [officeCfg, setOfficeCfg] = useState<OfficeHoursConfig>(() =>
    buildOfficeHours(DEFAULT_WORKING_HOURS)
  );
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [extrasAdmin, setExtrasAdmin] = useState(true);
  // Start at the chooser so every report, including Lead Stages, is discoverable.
  const [view, setView] = useState<'landing' | TabKey>('landing');
  const [userFilter, setUserFilter] = useState<string>('all');

  useEffect(() => {
    loadReports(from, to);
    loadExtras(from, to);
    companySettingsService
      .getWorkingHours()
      .then((w: WorkingHours) => setOfficeCfg(buildOfficeHours(w)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReports = async (f: string, t: string) => {
    setLoading(true);
    try {
      const result = await reportsService.getSummary(f || undefined, t || undefined);
      setData(result as ReportData);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const loadExtras = async (f: string, t: string) => {
    setExtrasLoading(true);
    try {
      const [act, att] = await Promise.all([
        reportsService.getActivity(f, t),
        reportsService.getAttendanceReport(f, t),
      ]);
      setActivity(act);
      setAttendance(att);
      setExtrasAdmin(true);
    } catch {
      setExtrasAdmin(false);
    } finally {
      setExtrasLoading(false);
    }
  };

  const applyRange = (f: string, t: string, preset: RangePreset) => {
    setFrom(f);
    setTo(t);
    setRangePreset(preset);
    loadReports(f, t);
    loadExtras(f, t);
  };

  const leadsByStatusData = data
    ? Object.entries(data.leadsByStatus).map(([name, value]) => ({ name, value }))
    : [];

  const leadsBySourceData = data
    ? Object.entries(data.leadsBySource).map(([name, value]) => ({ name, value }))
    : [];

  const leadsByPropertyData = data
    ? Object.entries(data.leadsByPropertyType).map(([name, value]) => ({ name, value }))
    : [];

  const followUpStatusData = data
    ? Object.entries(data.followUpsByStatus).map(([name, value]) => ({ name, value }))
    : [];

  const activityRows = activity ? buildActivityRows(activity) : [];
  const hourRows = hourFilter === 'all' ? [] : buildHourRows(activity, hourFilter);
  const attendanceRows = attendance
    ? buildAttendanceRows(attendance, from, to, officeCfg.toleranceMinutes)
    : [];
  const actionTypes = Array.from(
    new Set(activityRows.flatMap((r) => Object.keys(r.byAction)))
  ).sort();

  // ── User filter (VERY IMPORTANT per requirements) ────────────────────
  // Builds the list of users from every available source so the dropdown
  // works even before the extras (activity/attendance) finish loading.
  const userOptions: { id: string; name: string }[] = [];
  {
    const map = new Map<string, string>();
    const add = (id: string | undefined | null, name: string | undefined | null) => {
      if (!id || !name) return;
      if (!map.has(id)) map.set(id, name);
    };
    for (const u of activity?.users || []) add(u.id, u.full_name || u.email);
    for (const u of attendance?.users || []) add(u.id, u.full_name || u.email);
    for (const m of data?.teamPerformance || []) add(m.id, m.name);
    for (const c of data?.callsByEmployee || []) add(c.userId, c.name);
    userOptions.push(...Array.from(map.entries()).map(([id, name]) => ({ id, name })));
    userOptions.sort((a, b) => a.name.localeCompare(b.name));
  }

  const selectedUserId = userFilter !== 'all' ? userFilter : null;
  const selectedTeam = selectedUserId
    ? (data?.teamPerformance || []).find((m) => m.id === selectedUserId)
    : null;

  // Per-user scoped copy of the report data: KPI cards and per-user tables
  // (agent performance, team performance, calls) reflect only the selected user.
  const filteredData: ReportData | null = data
    ? {
        ...data,
        totalLeads: selectedTeam ? selectedTeam.assignedLeads : data.totalLeads,
        totalCustomers: selectedTeam ? selectedTeam.closedDeals : data.totalCustomers,
        totalRevenue: selectedTeam ? selectedTeam.totalRevenue : data.totalRevenue,
        conversionRate: selectedTeam ? String(selectedTeam.conversionRate) : data.conversionRate,
        agentPerformance: selectedUserId
          ? data.agentPerformance.filter((a) => a.name === (selectedTeam?.name ?? ''))
          : data.agentPerformance,
        teamPerformance: selectedUserId
          ? data.teamPerformance.filter((m) => m.id === selectedUserId)
          : data.teamPerformance,
        callsByEmployee: selectedUserId
          ? data.callsByEmployee.filter((c) => c.userId === selectedUserId)
          : data.callsByEmployee,
      }
    : null;

  const filteredActivityRows = selectedUserId
    ? activityRows.filter((r) => r.id === selectedUserId)
    : activityRows;
  const filteredHourRows = selectedUserId
    ? hourRows.filter((r) => r.id === selectedUserId)
    : hourRows;
  const filteredAttendanceRows = selectedUserId
    ? attendanceRows.filter((r) => r.id === selectedUserId)
    : attendanceRows;

  const selectedUserName = selectedUserId
    ? userOptions.find((u) => u.id === selectedUserId)?.name
    : undefined;

  const openReport = (target: ReportCardTarget) => {
    if (target === 'overview' || target === 'leads' || target === 'sales' || target === 'team' || target === 'attendance' || target === 'calls') {
      setView(target);
    } else {
      router.push(target);
    }
  };

  const exportReportsPDF = () => {
    if (!filteredData) return;
    const tables: { caption: string; headers: string[]; rows: string[][]; footer?: string }[] = [];
    if (filteredData.monthlyLeads.length) {
      tables.push({
        caption: 'Monthly Leads vs Won (Last 6 Months)',
        headers: ['Month', 'Leads', 'Won'],
        rows: filteredData.monthlyLeads.map((m) => [m.month, String(m.leads), String(m.won)]),
      });
    }
    if (filteredData.agentPerformance.length) {
      tables.push({
        caption: 'Agent Performance',
        headers: ['Agent', 'Leads', 'Won', 'Conversion %'],
        rows: filteredData.agentPerformance
          .sort((a, b) => b.leads - a.leads)
          .map((a) => [a.name, String(a.leads), String(a.won), String(a.rate)]),
      });
    }
    if (filteredData.teamPerformance.length) {
      tables.push({
        caption: 'Team Performance',
        headers: ['Member', 'Assigned', 'Closed', 'Revenue', 'Rate %'],
        rows: filteredData.teamPerformance
          .sort((a, b) => b.closedDeals - a.closedDeals)
          .map((m) => [
            m.name,
            String(m.assignedLeads),
            String(m.closedDeals),
            formatCurrency(m.totalRevenue),
            String(m.conversionRate),
          ]),
      });
    }
    if (filteredActivityRows.length) {
      tables.push({
        caption: `Team Activity — Actions per Hour (${from} → ${to}; office hours ${officeCfg.start}–${officeCfg.end})`,
        headers: ['User', ...officeCfg.officeHours.map((h) => `${h}:00`), 'Total'],
        rows: filteredActivityRows.map((r) => [
          r.name,
          ...officeCfg.officeHours.map((h) => String(r.byHour[h] || 0)),
          String(r.total),
        ]),
      });
    }
    if (filteredAttendanceRows.length) {
      tables.push({
        caption: `Attendance Report (${from} → ${to})`,
        headers: ['User', 'Days Present', 'On Time', 'Late', 'Absent'],
        rows: filteredAttendanceRows
          .sort((a, b) => b.late - a.late)
          .map((r) => [r.name, String(r.present), String(r.onTime), String(r.late), String(r.absent)]),
      });
    }
    exportPDF(
      'Reports & Analytics',
      `Generated for ${from} → ${to}${
        selectedUserId
          ? ` · User: ${selectedUserName ?? selectedUserId}`
          : ' · All users'
      }`,
      [
        { label: 'Total Leads', value: String(filteredData.totalLeads) },
        { label: 'Customers', value: String(filteredData.totalCustomers) },
        { label: 'Revenue', value: formatCurrency(filteredData.totalRevenue) },
        { label: 'Conversion', value: `${filteredData.conversionRate}%` },
      ],
      tables,
      `reports-${todayIso()}`
    );
    toast.success('Preparing PDF report…');
  };

  const exportReportsCSV = () => {
    if (!filteredData) return;
    const headers = ['Metric', 'Value'];
    const rows: string[][] = [
      ['Total Leads', String(filteredData.totalLeads)],
      ['Total Customers', String(filteredData.totalCustomers)],
      ['Total Revenue', String(filteredData.totalRevenue)],
      ['Conversion Rate %', String(filteredData.conversionRate)],
      ...Object.entries(filteredData.leadsByStatus).map(([k, v]) => [`Leads By Status — ${k}`, String(v)]),
      ...Object.entries(filteredData.leadsBySource).map(([k, v]) => [`Leads By Source — ${k}`, String(v)]),
      ...filteredData.agentPerformance
        .sort((a, b) => b.leads - a.leads)
        .map((a) => [`Agent ${a.name}`, `leads ${a.leads}, won ${a.won}, ${a.rate}%`]),
    ];
    exportCSV(`reports-${todayIso()}`, headers, rows);
    toast.success('Exported report data to CSV');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={22} className="text-primary" />
            Reports & Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pick a report to see your numbers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportReportsPDF}
            disabled={loading || !data}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50"
            title="Export report as PDF"
          >
              <FileDown size={15} />
              Export PDF
            </button>
          <button
            onClick={exportReportsCSV}
            disabled={loading || !data}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50"
            title="Export report as CSV"
          >
              <FileDown size={15} />
              Export CSV
            </button>
          <button
            onClick={() => {
              loadReports(from, to);
              loadExtras(from, to);
            }}
            disabled={loading || extrasLoading}
            className="btn-ghost p-2 rounded-lg"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Date range presets */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                const r = presetRange(p.key);
                applyRange(r.from, r.to, p.key);
              }}
              className={`min-h-[40px] px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                rangePreset === p.key
                  ? 'bg-primary text-primary-foreground shadow-[0_8px_22px_-8px_rgba(132,204,22,0.6)]'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="input-base text-sm min-h-[40px] w-auto"
            title="Show data for"
          >
            <option value="all">All users</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                if (e.target.value) applyRange(e.target.value, to, 'custom');
              }}
              className="input-base text-sm min-h-[40px] w-auto"
              title="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              max={todayIso()}
              onChange={(e) => {
                if (e.target.value) applyRange(from, e.target.value, 'custom');
              }}
              className="input-base text-sm min-h-[40px] w-auto"
              title="To"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          Failed to load report data. Please try again.
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-6 py-6">
          {view === 'landing' ? (
            <div className="space-y-8 max-w-6xl">
              {selectedUserId ? (
                <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <Users size={16} className="text-primary flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Showing reports for{' '}
                    <span className="font-semibold text-foreground">
                      {selectedUserName ?? 'this user'}
                    </span>
                    .{' '}
                    <button
                      onClick={() => setUserFilter('all')}
                      className="text-primary font-semibold hover:underline"
                    >
                      View all users
                    </button>
                  </p>
                </div>
              ) : null}

              {/* Big friendly category cards */}
              <div>
                <h2 className="section-header mb-4">Pick a report</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {CATEGORY_CARDS.map((card) => (
                    <button
                      key={card.key}
                      onClick={() => openReport(card.target)}
                      className="card-base !p-6 text-left flex flex-col gap-4 hover:border-primary/50 hover:lime-glow group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <card.icon size={24} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {card.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {card.desc}
                        </p>
                      </div>
                      <span className="btn-primary mt-auto w-full min-h-[44px] inline-flex items-center justify-center gap-2 group-hover:-translate-y-0.5 transition-all">
                        View report
                        <ChevronRight size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary route-based reports */}
              <div>
                <h2 className="section-header mb-4">More reports</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {MORE_CARDS.filter((c) => !c.adminOnly || extrasAdmin).map((card) => (
                    <button
                      key={card.key}
                      onClick={() => openReport(card.target)}
                      className="card-base !p-4 text-left flex items-center gap-3 hover:border-primary/50 group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <card.icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {card.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {card.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-6xl">
              {/* Contextual header with back button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView('landing')}
                  className="btn-secondary min-h-[40px] inline-flex items-center gap-2"
                >
                  <ChevronRight size={16} className="rotate-180" />
                  All reports
                </button>
                <h2 className="section-header">{VIEW_TITLES[view] ?? 'Report'}</h2>
              </div>

              {selectedUserId ? (
                <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <Users size={16} className="text-primary flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Showing reports for{' '}
                    <span className="font-semibold text-foreground">
                      {selectedUserName ?? 'this user'}
                    </span>
                    .{' '}
                    <button
                      onClick={() => setUserFilter('all')}
                      className="text-primary font-semibold hover:underline"
                    >
                      View all users
                    </button>
                  </p>
                </div>
              ) : null}

              {/* Overview tab */}
              <div className={view === 'overview' ? 'block space-y-6' : 'hidden'}>
                <OverviewTab data={filteredData!} showDelta={rangePreset !== 'year' && !selectedUserId} />
              </div>

              {/* Leads tab */}
              <div className={view === 'leads' ? 'block space-y-6' : 'hidden'}>
                <LeadsTab
                  leadsByStatusData={leadsByStatusData}
                  leadsBySourceData={leadsBySourceData}
                  leadsByPropertyData={leadsByPropertyData}
                  followUpStatusData={followUpStatusData}
                />
              </div>

              {/* Sales tab */}
              <div className={view === 'sales' ? 'block space-y-6' : 'hidden'}>
                <SalesTab data={filteredData!} />
              </div>

              {/* Team tab */}
              <div className={view === 'team' ? 'block space-y-6' : 'hidden'}>
                <SimpleTeamPerformance
                  data={filteredData!}
                  monthlyLeads={filteredData!.monthlyLeads}
                  teamOptions={data.teamPerformance.map((team) => ({ id: team.id, name: team.name }))}
                />
                {/* Detailed team analytics remain available below the simplified view. */}
                <div className="hidden">
                <TeamTab
                  data={filteredData!}
                  activityRows={filteredActivityRows}
                  hourRows={filteredHourRows}
                  actionTypes={actionTypes}
                  hourFilter={hourFilter}
                  setHourFilter={setHourFilter}
                  extrasLoading={extrasLoading}
                  extrasAdmin={extrasAdmin}
                  officeCfg={officeCfg}
                />
                </div>
              </div>

              {/* Attendance tab */}
              <div className={view === 'attendance' ? 'block space-y-6' : 'hidden'}>
                <AttendanceTab
                  attendanceRows={filteredAttendanceRows}
                  extrasLoading={extrasLoading}
                  extrasAdmin={extrasAdmin}
                  officeCfg={officeCfg}
                />
              </div>

              {/* Calls tab */}
              <div className={view === 'calls' ? 'block space-y-6' : 'hidden'}>
                <CallsTab data={filteredData!} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tab panels ──────────────────────────────────────────────────────────── */

function SimpleTeamPerformance({
  data,
  monthlyLeads,
  teamOptions,
}: {
  data: ReportData;
  monthlyLeads: { month: string; leads: number; won: number }[];
  teamOptions: { id: string; name: string }[];
}) {
  const [teamId, setTeamId] = useState('all');
  const rows = teamId === 'all'
    ? data.teamAgentPerformance
    : data.teamAgentPerformance.filter((row) => row.teamId === teamId);
  const totals = rows.reduce(
    (sum, row) => ({
      totalLeads: sum.totalLeads + row.totalLeads,
      pending: sum.pending + row.pending,
      new: sum.new + row.new,
      calls: sum.calls + row.calls,
    }),
    { totalLeads: 0, pending: 0, new: 0, calls: 0 }
  );
  const maxTrend = Math.max(1, ...monthlyLeads.map((item) => item.leads));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KPICard icon={<Users size={16} />} label="Total Leads" value={totals.totalLeads} />
        <KPICard icon={<Phone size={16} />} label="Total Calls" value={totals.calls} />
        <KPICard icon={<UserCheck size={16} />} label="Agents / Teams" value={rows.length} />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Leads trend</h2>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </div>
          <BarChart3 size={17} className="text-primary" />
        </div>
        <div className="flex items-end gap-2 h-28">
          {monthlyLeads.slice(-6).map((item) => (
            <div key={item.month} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-muted-foreground">{item.leads}</span>
              <div className="w-full max-w-10 rounded-t-lg bg-primary/80 transition-all" style={{ height: `${Math.max(8, (item.leads / maxTrend) * 76)}px` }} />
              <span className="text-[10px] text-muted-foreground truncate max-w-full">{item.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Team Performance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">A quick view of leads and calls</p>
          </div>
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="input-base w-auto min-w-[150px] text-sm">
            <option value="all">All Teams</option>
            {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Agent Name', 'Total Leads', 'Pending', 'New', 'Calls'].map((label, index) => (
                  <th key={label} className={`px-4 py-3 text-xs font-semibold text-muted-foreground ${index ? 'text-right' : 'text-left'}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{row.name}<span className="block text-[11px] text-muted-foreground">{row.teamName}</span></td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{row.totalLeads}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{row.pending}</td>
                  <td className="px-4 py-3 text-right text-primary">{row.new}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.calls}</td>
                </tr>
              ))}
              <tr className="bg-primary/5 font-bold">
                <td className="px-4 py-3 text-foreground">Totals</td>
                <td className="px-4 py-3 text-right text-foreground">{totals.totalLeads}</td>
                <td className="px-4 py-3 text-right text-amber-600">{totals.pending}</td>
                <td className="px-4 py-3 text-right text-primary">{totals.new}</td>
                <td className="px-4 py-3 text-right text-foreground">{totals.calls}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No team members found.</p>}
      </div>
    </div>
  );
}

function KPICard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <div><p className="text-xl font-bold text-foreground">{value.toLocaleString()}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </div>
  );
}

function OverviewTab({ data, showDelta }: { data: ReportData; showDelta: boolean }) {
  const prev = showDelta ? data.previousPeriod : null;

  const deltaFor = (change?: number): { value: string; direction: 'up' | 'down' | 'flat' } | null => {
    if (prev == null || change === undefined || change === null) return null;
    const abs = Math.abs(change);
    const direction = abs < 0.05 ? 'flat' : change > 0 ? 'up' : 'down';
    return { value: `${change > 0 ? '+' : ''}${abs.toFixed(1)}%`, direction };
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Users size={20} />}
          iconBg="bg-blue-50 text-primary"
          label="Total Leads"
          value={String(data.totalLeads)}
          delta={deltaFor(prev?.leadsChange)}
          deltaTitle={`vs ${prev?.from} → ${prev?.to}`}
        />
        <KPICard
          icon={<UserCheck size={20} />}
          iconBg="bg-emerald-50 text-emerald-600"
          label="Total Customers"
          value={String(data.totalCustomers)}
          delta={deltaFor(prev?.customersChange)}
          deltaTitle={`vs ${prev?.from} → ${prev?.to}`}
        />
        <KPICard
          icon={<DollarSign size={20} />}
          iconBg="bg-purple-50 text-purple-600"
          label="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
          delta={deltaFor(prev?.revenueChange)}
          deltaTitle={`vs ${prev?.from} → ${prev?.to}`}
        />
        <KPICard
          icon={<Target size={20} />}
          iconBg="bg-amber-50 text-amber-600"
          label="Conversion Rate"
          value={`${data.conversionRate}%`}
          delta={deltaFor(prev?.conversionChange)}
          deltaTitle={`vs ${prev?.from} → ${prev?.to}`}
        />
      </div>

      {/* Monthly Trend */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Monthly Leads vs Won (Last 6 Months)
        </h2>
        {data.monthlyLeads.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.monthlyLeads}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="leads"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Leads"
              />
              <Line
                type="monotone"
                dataKey="won"
                stroke="#4d7c0f"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Won"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function LeadsTab({
  leadsByStatusData,
  leadsBySourceData,
  leadsByPropertyData,
  followUpStatusData,
}: {
  leadsByStatusData: { name: string; value: number }[];
  leadsBySourceData: { name: string; value: number }[];
  leadsByPropertyData: { name: string; value: number }[];
  followUpStatusData: { name: string; value: number }[];
}) {
  return (
    <div className="space-y-6">
      {/* Lead Status + Source */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Leads by Status</h2>
          {leadsByStatusData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={leadsByStatusData} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  horizontal={false}
                />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
                <Tooltip />
                <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]}>
                  {leadsByStatusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Where your leads are</h2>
              <p className="text-xs text-muted-foreground mt-0.5">A quick view of each lead’s current stage</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {leadsByStatusData.reduce((sum, item) => sum + item.value, 0)} total
            </span>
          </div>
          {leadsByStatusData.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="space-y-2">
              {leadsByStatusData
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((item, index) => {
                  const total = leadsByStatusData.reduce((sum, current) => sum + current.value, 0);
                  const width = total ? Math.max(5, Math.round((item.value / total) * 100)) : 0;
                  return (
                  <div key={item.name} className="animate-rise-in rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5" style={{ animationDelay: `${index * 45}ms` }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                      <span className="min-w-8 text-right font-bold text-primary">{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Leads by Source</h2>
          {leadsBySourceData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={leadsBySourceData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }: { name?: string | number; percent?: number }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {leadsBySourceData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Property Type + Follow-up Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Leads by Property Type</h2>
          {leadsByPropertyData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leadsByPropertyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]}>
                  {leadsByPropertyData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Follow-ups by Status</h2>
          {followUpStatusData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={followUpStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  dataKey="value"
                  nameKey="name"
                >
                  {followUpStatusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function SalesTab({ data }: { data: ReportData }) {
  const avgDealValue =
    data.totalCustomers > 0 ? data.totalRevenue / data.totalCustomers : 0;

  const revenueByTeam = data.teamPerformance
    .slice()
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map((t) => ({ name: t.name, revenue: t.totalRevenue, deals: t.closedDeals }));

  return (
    <div className="space-y-6">
      {/* Sales KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          icon={<DollarSign size={20} />}
          iconBg="bg-purple-50 text-purple-600"
          label="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
        />
        <KPICard
          icon={<UserCheck size={20} />}
          iconBg="bg-emerald-50 text-emerald-600"
          label="Won Deals"
          value={String(data.totalCustomers)}
        />
        <KPICard
          icon={<Target size={20} />}
          iconBg="bg-blue-50 text-primary"
          label="Avg Deal Value"
          value={data.totalCustomers > 0 ? formatCurrency(avgDealValue) : '—'}
        />
      </div>

      {/* Revenue by Team */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Revenue by Team</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total revenue and closed deals per team
            </p>
          </div>
        </div>
        {revenueByTeam.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenueByTeam} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatCurrency(Number(v))} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                {revenueByTeam.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function TeamTab({
  data,
  activityRows,
  hourRows,
  actionTypes,
  hourFilter,
  setHourFilter,
  extrasLoading,
  extrasAdmin,
  officeCfg,
}: {
  data: ReportData;
  activityRows: ActivityRow[];
  hourRows: HourRow[];
  actionTypes: string[];
  hourFilter: number | 'all';
  setHourFilter: (v: number | 'all') => void;
  extrasLoading: boolean;
  extrasAdmin: boolean;
  officeCfg: OfficeHoursConfig;
}) {
  return (
    <div className="space-y-6">
      {/* Agent Performance Table */}
      {data.agentPerformance.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Agent Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-mobile">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Agent
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Leads
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Won
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Conversion
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.agentPerformance
                  .sort((a, b) => b.leads - a.leads)
                  .map((agent, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-foreground">{agent.name}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {agent.leads}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                        {agent.won}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-xs bg-blue-50 text-primary px-2 py-0.5 rounded-full font-medium">
                          {agent.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Performance Table */}
      {data.teamPerformance.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Team Performance & Profitability
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Per-team calls, deals, revenue, expenses and leader rating — scoped to your
                role
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-mobile">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Team
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Leader
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Leads
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Closed
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Calls
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Revenue
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Expenses
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-emerald-600">
                    Profit
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Margin
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-amber-600">
                    Rating
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.teamPerformance
                  .slice()
                  .sort((a, b) => b.profit - a.profit)
                  .map((member, i) => (
                    <tr
                      key={member.id || i}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {member.name}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {member.leaderName || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {member.assignedLeads}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                        {member.closedDeals}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {member.calls}
                      </td>
                      <td className="py-2.5 px-3 text-right text-foreground">
                        {formatCurrency(member.totalRevenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {formatCurrency(member.expenses)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${member.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                      >
                        {formatCurrency(member.profit)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-xs bg-blue-50 text-primary px-2 py-0.5 rounded-full font-medium">
                          {member.profitMargin}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {member.leaderRating ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold"
                            title={member.leaderRatingComment || 'Leader rating'}
                          >
                            ★ {member.leaderRating}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Team Activity (Actions per Hour) ─────────────────────────── */}
      {extrasAdmin && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Team Activity — Actions per Hour
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every user action (lead / follow-up / comment) grouped by hour · Office hours{' '}
                {officeCfg.start} – {officeCfg.end}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={String(hourFilter)}
                onChange={(e) =>
                  setHourFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="input-base text-sm"
                title="Filter by hour"
              >
                <option value="all">All hours</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {extrasLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : hourFilter !== 'all' ? (
            hourRows.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Showing activity at{' '}
                  <span className="font-semibold text-foreground">{hourLabel(hourFilter)}</span>{' '}
                  · Calls = phone / video-call follow-ups
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                          User
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                          Actions
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                          Calls
                        </th>
                        {actionTypes.map((t) => (
                          <th
                            key={t}
                            className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground"
                          >
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hourRows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-foreground truncate max-w-[160px]">
                              {r.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                              {r.role}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            {r.actions}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {r.calls > 0 ? (
                              <span className="inline-flex items-center text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                                {r.calls} calls
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">0</span>
                            )}
                          </td>
                          {actionTypes.map((t) => (
                            <td
                              key={t}
                              className="py-2.5 px-3 text-right text-muted-foreground"
                            >
                              {r.byAction[t] || 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : activityRows.length === 0 ? (
            <EmptyChart />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground sticky left-0 bg-card">
                        User
                      </th>
                      {officeCfg.officeHours.map((h) => (
                        <th
                          key={h}
                          className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground"
                        >
                          {h}:00
                        </th>
                      ))}
                      <th className="text-center py-2 px-3 text-xs font-semibold text-muted-foreground">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-medium text-foreground sticky left-0 bg-card">
                          <p className="truncate max-w-[160px]">{r.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                            {r.role}
                          </p>
                        </td>
                        {officeCfg.officeHours.map((h) => {
                          const c = r.byHour[h] || 0;
                          return (
                            <td key={h} className="py-2.5 px-2 text-center">
                              {c > 0 ? (
                                <span className="inline-flex w-7 h-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                                  {c}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-center font-bold text-foreground">
                          {r.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {actionTypes.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Breakdown by action
                  </p>
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                          User
                        </th>
                        {actionTypes.map((t) => (
                          <th
                            key={t}
                            className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground"
                          >
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activityRows.map((r) => (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 px-3 font-medium text-foreground">{r.name}</td>
                          {actionTypes.map((t) => (
                            <td key={t} className="py-2 px-3 text-right text-muted-foreground">
                              {r.byAction[t] || 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AttendanceTab({
  attendanceRows,
  extrasLoading,
  extrasAdmin,
  officeCfg,
}: {
  attendanceRows: AttendanceRow[];
  extrasLoading: boolean;
  extrasAdmin: boolean;
  officeCfg: OfficeHoursConfig;
}) {
  return (
    <div className="space-y-6">
      {/* ── Attendance Report ─────────────────────────────────────────── */}
      {extrasAdmin && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Attendance Report</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per-user office attendance for the selected period · Office hours{' '}
              {officeCfg.start} – {officeCfg.end} · Arriving after{' '}
              {formatMinutes(officeCfg.toleranceMinutes)} ={' '}
              <span className="text-amber-600 font-medium">Late</span>
            </p>
          </div>
          {extrasLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : attendanceRows.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                      User
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                      Days Present
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                      On Time
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                      Late
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                      Absent
                    </th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-muted-foreground">
                      Warning
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows
                    .sort((a, b) => b.late - a.late)
                    .map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-foreground truncate max-w-[160px]">
                            {r.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                            {r.role}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-foreground">
                          {r.present}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                          {r.onTime}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-600 font-medium">
                          {r.late}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {r.absent}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex justify-center">
                            {r.late > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                ⚠ {r.late} late{r.late > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs text-emerald-600 font-medium">
                                ✓ On track
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CallsTab({ data }: { data: ReportData }) {
  return (
    <div className="space-y-6">
      {/* Calls by Employee */}
      {data.callsByEmployee.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Calls by Employee
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-mobile">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Employee
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Calls
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-emerald-600">
                    Connected
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    No answer
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-sky-600">
                    Incoming
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.callsByEmployee
                  .slice()
                  .sort((a, b) => b.calls - a.calls)
                  .map((emp, i) => (
                    <tr
                      key={emp.userId || i}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-foreground">{emp.name}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-foreground">
                        {emp.calls}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                        {emp.connected}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {emp.noAnswer}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sky-600 font-medium">
                        {emp.incoming}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {fmtMinutes(emp.totalDurationSeconds)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Call logs */}
      <div className="mt-8 border-t border-border pt-8">
        <CallLogsReport />
      </div>
    </div>
  );
}

function KPICard({
  icon,
  iconBg,
  label,
  value,
  delta,
  deltaTitle,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' } | null;
  deltaTitle?: string;
}) {
  const deltaCls =
    delta?.direction === 'up'
      ? 'text-emerald-600'
      : delta?.direction === 'down'
        ? 'text-red-500'
        : 'text-muted-foreground';
  const deltaArrow =
    delta?.direction === 'up' ? '↑' : delta?.direction === 'down' ? '↓' : '•';

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {delta && (
          <p className={`text-[11px] font-semibold leading-tight ${deltaCls}`} title={deltaTitle}>
            {deltaArrow} {delta.value} <span className="font-normal text-muted-foreground">vs prev.</span>
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
      No data available yet
    </div>
  );
}

'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Clock,
  Calendar,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  ChevronDown,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}
interface DailyAgg {
  user_id: string;
  activity_date: string;
  total_active_seconds: number;
  session_count: number;
  first_login_at: string | null;
  last_logout_at: string | null;
  last_activity_at: string | null;
}
interface Session {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  last_heartbeat_at: string;
  duration_seconds: number;
  is_active: boolean;
  closed_reason: string | null;
}
interface ActivityEvent {
  user_id: string;
  event_type: string;
  event_data: any;
  occurred_at: string;
}

interface DashboardData {
  users: UserProfile[];
  sessions: Session[];
  daily: DailyAgg[];
  online: Record<string, { last_heartbeat_at: string; duration_seconds: number; login_at: string }>;
  last_active: Record<string, string>;
  activity_log: ActivityEvent[];
  not_setup: boolean;
}

function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return '0m';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function aggregatePeriod(
  daily: DailyAgg[],
  period: 'day' | 'week' | 'month',
  userId?: string
): Record<string, number> {
  const result: Record<string, number> = {};
  const now = new Date();
  const filtered = userId ? daily.filter((d) => d.user_id === userId) : daily;

  for (const entry of filtered) {
    const d = new Date(entry.activity_date);
    let key = '';
    if (period === 'day') {
      key = entry.activity_date;
    } else if (period === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      if (d >= weekStart) key = 'This Week';
      else key = 'Previous Week';
    } else {
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        key = 'This Month';
      } else {
        key = 'Previous Month';
      }
    }
    if (key) {
      result[key] = (result[key] || 0) + entry.total_active_seconds;
    }
  }
  return result;
}

export default function ActivityDashboard() {
  const [data, setData] = useState<DashboardData>({
    users: [],
    sessions: [],
    daily: [],
    online: {},
    last_active: {},
    activity_log: [],
    not_setup: false,
  });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (filterUserId) params.set('user_id', filterUserId);
      const res = await fetch(`/api/admin/activity?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData((prev) => ({ ...prev, not_setup: true }));
    } finally {
      setLoading(false);
    }
  }, [from, to, filterUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Auto-refresh every 60s
  useEffect(() => {
    const timer = setInterval(() => setRefreshKey((k) => k + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const { users, sessions, daily, online, last_active, activity_log, not_setup } = data;
  const displayUsers = filterUserId ? users.filter((u) => u.id === filterUserId) : users;

  // Compute per-user totals
  const userStats = displayUsers.map((user) => {
    const today = new Date().toISOString().slice(0, 10);
    const todayAgg = daily.find((d) => d.user_id === user.id && d.activity_date === today);
    const weekAgg = daily.filter((d) => d.user_id === user.id && d.activity_date >= from);
    const totalWeek = weekAgg.reduce((sum, d) => sum + d.total_active_seconds, 0);
    const totalToday = todayAgg?.total_active_seconds || 0;
    const sessionCount = weekAgg.reduce((sum, d) => sum + d.session_count, 0);
    const isOnline = !!online[user.id];
    const lastActive = last_active[user.id] || '';

    return {
      ...user,
      totalToday,
      totalWeek,
      sessionCount,
      isOnline,
      lastActive,
    };
  });

  // Online users count
  const onlineCount = Object.keys(online).length;

  // Activity log by event type
  const eventCounts: Record<string, number> = {};
  activity_log.forEach((e) => {
    eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {not_setup && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Activity tracking tables not yet created. Run migration{' '}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">
            20260805150000_user_activity_tracking.sql
          </code>{' '}
          in Supabase SQL Editor to enable.
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Activity size={20} className="text-primary" />
            User Activity Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Track login sessions, active hours, and usage across your team
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-base text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-base text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">User</label>
          <select
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            className="input-base text-sm min-w-[160px]"
          >
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Total Users</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{users.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={14} className="text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Online Now</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{onlineCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">Today&apos;s Total</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {formatDuration(userStats.reduce((s, u) => s + u.totalToday, 0))}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Period Total</span>
          </div>
          <p className="text-2xl font-bold text-primary">
            {formatDuration(userStats.reduce((s, u) => s + u.totalWeek, 0))}
          </p>
        </div>
      </div>

      {/* Per-user table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">User Activity Overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-mobile">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  User
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Status
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Today
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Total ({from} → {to})
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Sessions
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {userStats.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {user.full_name || 'Unnamed'}
                      </p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.isOnline ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Offline
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-foreground">
                      {formatDuration(user.totalToday)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-blue-600">
                      {formatDuration(user.totalWeek)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-muted-foreground">{user.sessionCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs text-muted-foreground"
                      title={user.lastActive ? new Date(user.lastActive).toLocaleString() : ''}
                    >
                      {user.lastActive ? timeAgo(user.lastActive) : 'Never'}
                    </span>
                  </td>
                </tr>
              ))}
              {userStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No user activity data for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily breakdown (last 7 days) */}
      {!filterUserId && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground">Daily Active Hours (Recent)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-mobile">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                    User
                  </th>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (6 - i));
                    return (
                      <th
                        key={i}
                        className="text-center px-2 py-2.5 text-xs font-semibold text-muted-foreground uppercase min-w-[70px]"
                      >
                        {d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      <span className="text-sm font-medium text-foreground">
                        {user.full_name || user.email}
                      </span>
                    </td>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - (6 - i));
                      const dateStr = d.toISOString().slice(0, 10);
                      const agg = daily.find(
                        (dd) => dd.user_id === user.id && dd.activity_date === dateStr
                      );
                      const sec = agg?.total_active_seconds || 0;
                      const maxSec = 8 * 3600; // 8h scale
                      const pct = Math.min(100, (sec / maxSec) * 100);
                      return (
                        <td key={i} className="px-2 py-2 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${pct}%`, opacity: pct > 0 ? 1 : 0.2 }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatDuration(sec)}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity log */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Activity History</h3>
          <div className="flex gap-2">
            {Object.entries(eventCounts).map(([type, count]) => (
              <span
                key={type}
                className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full"
              >
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full table-mobile">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Time
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  User
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Event
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activity_log.map((event, i) => {
                const user = users.find((u) => u.id === event.user_id);
                return (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.occurred_at)} {formatTime(event.occurred_at)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-foreground">
                        {user?.full_name || user?.email || event.user_id}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          event.event_type === 'login'
                            ? 'bg-emerald-50 text-emerald-700'
                            : event.event_type === 'logout'
                              ? 'bg-red-50 text-red-700'
                              : event.event_type === 'page_view'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {event.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {event.event_data && Object.keys(event.event_data).length > 0
                          ? JSON.stringify(event.event_data).slice(0, 80)
                          : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {activity_log.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No activity events for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

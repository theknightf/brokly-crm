'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck,
  Clock,
  LogIn,
  LogOut,
  Loader2,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  MapPin,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminSettingsService } from '@/lib/services/crmService';
import { roleBadgeOf } from '@/lib/ui';

interface AttendanceUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface AttendanceRecord {
  user_id: string;
  check_in_time: string | null;
  check_out_time: string | null;
}

interface SiteVisitRecord {
  user_id: string;
  project_name?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  verified?: boolean | null;
  within_radius?: boolean | null;
}

function formatTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const LATE_AFTER_MIN = 12 * 60 + 30; // 12:30

function WorkLocationCard() {
  const [lat, setLat] = useState('30.0444');
  const [lng, setLng] = useState('31.2357');
  const [radius, setRadius] = useState('800');
  const [id, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const grouped: any = await adminSettingsService.getAll();
        const item = (grouped?.workLocation || []).find((s: any) => s.name === 'default');
        if (item) {
          setId(item.id);
          try {
            const parsed = JSON.parse(item.color || '{}');
            if (parsed.lat != null) setLat(String(parsed.lat));
            if (parsed.lng != null) setLng(String(parsed.lng));
            if (parsed.radius_m != null) setRadius(String(parsed.radius_m));
            else if (parsed.radiusM != null) setRadius(String(parsed.radiusM));
          } catch {
            // keep defaults
          }
        }
      } catch {
        // settings table may not exist yet — keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    const lats = parseFloat(lat);
    const lngs = parseFloat(lng);
    const rad = parseInt(radius, 10);
    if (Number.isNaN(lats) || Number.isNaN(lngs) || !Number.isFinite(rad) || rad <= 0) {
      toast.error('Enter valid latitude, longitude and radius');
      return;
    }
    setSaving(true);
    try {
      const color = JSON.stringify({
        lat: lats,
        lng: lngs,
        radius_m: rad,
        label: 'Work location',
      });
      if (id) {
        await adminSettingsService.update(id, { name: 'default', color, order: 0, active: true });
      } else {
        const created = await adminSettingsService.create('workLocation', {
          name: 'default',
          color,
          order: 0,
          active: true,
        });
        setId(created.id);
      }
      toast.success('Work location saved — GPS attendance now enforces this radius');
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 mr-2 pb-1">
        <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
          <MapPin size={15} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Work location &amp; GPS radius</p>
          <p className="text-xs text-muted-foreground">
            Check-ins further than this radius are rejected.
          </p>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Latitude</span>
        <input
          type="text"
          inputMode="decimal"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          className="input-base h-8 w-[110px] text-xs"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Longitude</span>
        <input
          type="text"
          inputMode="decimal"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          className="input-base h-8 w-[110px] text-xs"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Radius (m)</span>
        <input
          type="number"
          min={1}
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className="input-base h-8 w-[90px] text-xs"
        />
      </label>
      <button
        onClick={save}
        disabled={saving || loading}
        className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

// Local wall-clock minutes from an ISO timestamp.
function localMinutes(iso: string | null): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}

// Build a safe arrival timestamp for the given date + "HH:MM".
// Falls back to "now" if the inputs are invalid.
function buildArrivalISO(date: string, time: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLocal();
  const d = new Date(`${day}T${time || '12:00'}`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export default function AttendanceTab() {
  const [date, setDate] = useState(() => todayLocal());
  const [users, setUsers] = useState<AttendanceUser[]>([]);
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [siteVisits, setSiteVisits] = useState<SiteVisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [arrival, setArrival] = useState<Record<string, string>>({});

  const load = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?date=${encodeURIComponent(targetDate)}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setUsers(data.users || []);
      const map: Record<string, AttendanceRecord> = {};
      (data.attendance || []).forEach((r: AttendanceRecord) => {
        map[r.user_id] = r;
      });
      setRecords(map);
      setSiteVisits(data.siteVisits || []);
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const mark = async (action: 'checkin' | 'checkout', userId: string) => {
    setActing(userId);
    // Always send an explicit arrival time: use the admin's chosen time,
    // otherwise default to "now" (today) or office start 12:00 (other days).
    let timeISO: string | undefined;
    if (action === 'checkin') {
      const chosen = arrival[userId];
      const effective = chosen || (isToday ? nowHHMM() : '12:00');
      timeISO = buildArrivalISO(date, effective);
    }
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId, date, ...(timeISO ? { time: timeISO } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Request failed');
      }
      toast.success(action === 'checkin' ? 'Arrival confirmed' : 'Check-out recorded');
      await load(date);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update attendance');
    } finally {
      setActing(null);
    }
  };

  const isToday = date === todayLocal();

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const presentCount = Object.values(records).filter((r) => r.check_in_time).length;
  const absentCount = users.length - presentCount;
  const fieldVisits = siteVisits.length;
  const fieldUserIds = new Set(siteVisits.map((s) => s.user_id));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <CalendarCheck size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Attendance</h2>
            <p className="text-xs text-muted-foreground">
              Office hours 12:00 – 20:00 · Arrival after 12:30 = Late · GPS check-ins are radius-verified
            </p>
          </div>
        </div>

        <WorkLocationCard />

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayLocal()}
            onChange={(e) => setDate(e.target.value)}
            className="input-base text-sm"
          />
          <button onClick={() => setDate(todayLocal())} className="btn-secondary text-sm">
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          {
            label: 'Present',
            value: presentCount,
            color: 'text-emerald-600',
            icon: <CheckCircle2 size={16} className="text-emerald-500" />,
          },
          {
            label: 'Not Marked',
            value: absentCount,
            color: 'text-muted-foreground',
            icon: <XCircle size={16} className="text-muted-foreground" />,
          },
          {
            label: 'Field Visits',
            value: fieldVisits,
            color: 'text-violet-600',
            icon: <MapPin size={16} className="text-violet-500" />,
          },
          {
            label: 'Total Users',
            value: users.length,
            color: 'text-foreground',
            icon: <Users size={16} className="text-muted-foreground" />,
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              {stat.icon}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="input-base w-full pl-9 text-sm"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <CalendarCheck size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No users found</p>
            <p className="text-xs text-muted-foreground mb-4">Try a different search term</p>
          </div>
        ) : (
          <table className="w-full table-mobile">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Check-In
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Check-Out
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-52">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((user) => {
                const badge = roleBadgeOf(user.role);
                const rec = records[user.id];
                const checkIn = formatTime(rec?.check_in_time ?? null);
                const checkOut = formatTime(rec?.check_out_time ?? null);
                const minutes = localMinutes(rec?.check_in_time ?? null);
                const status = minutes < 0 ? null : minutes <= LATE_AFTER_MIN ? 'on-time' : 'late';
                const initials = user.full_name
                  ? user.full_name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  : user.email.slice(0, 2).toUpperCase();
                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-muted/30 transition-colors ${!user.is_active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${rec?.check_in_time ? 'bg-emerald-100' : 'bg-muted'}`}
                        >
                          <span
                            className={`text-xs font-bold ${rec?.check_in_time ? 'text-emerald-600' : 'text-muted-foreground'}`}
                          >
                            {initials}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {user.full_name || '—'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {checkIn ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                            <Clock size={14} /> {checkIn}
                          </span>
                          {status === 'late' && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                              ⚠ {Math.max(0, minutes - 12 * 60)}m late
                            </span>
                          )}
                          {status === 'on-time' && (
                            <span className="inline-flex items-center text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                              On time
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      {fieldUserIds.has(user.id) && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide mt-1">
                          <MapPin size={10} /> Field visit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {checkOut ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          <Clock size={14} /> {checkOut}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {acting === user.id ? (
                          <Loader2 size={16} className="animate-spin text-primary" />
                        ) : checkIn && !checkOut ? (
                          <button
                            onClick={() => mark('checkout', user.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <LogOut size={13} /> Check Out
                          </button>
                        ) : checkIn && checkOut ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 size={13} /> Complete
                          </span>
                        ) : (
                          <div className="flex items-center justify-end">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={arrival[user.id] || ''}
                                  onChange={(e) =>
                                    setArrival((s) => ({ ...s, [user.id]: e.target.value }))
                                  }
                                  className="input-base text-xs w-[92px]"
                                  title="Arrival time — leave empty to use now (today) or 12:00 (other days)"
                                />
                                <button
                                  onClick={() => mark('checkin', user.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                                >
                                  <LogIn size={13} /> Confirm Arrival
                                </button>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Empty time → {isToday ? 'now' : '12:00'} · saves{' '}
                                {formatTime(
                                  buildArrivalISO(
                                    date,
                                    arrival[user.id] || (isToday ? nowHHMM() : '12:00')
                                  )
                                )}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Loader2, MapPin, Clock, Timer, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface AttendanceRow {
  id: string;
  attendance_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  duration_seconds?: number;
}

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(sec: number): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function EmployeeAttendanceView() {
  const { user, profile } = useAuth();
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');

  const load = useCallback(async (from: string, to: string) => {
    try {
      const res = await fetch(`/api/attendance/self?from=${from}&to=${to}`, { cache: 'no-store' });
      const json = await res.json();
      const rows = (json?.attendance || []) as AttendanceRow[];
      setHistory(rows);
      const todayRow = rows.find((r) => r.attendance_date === localToday());
      setToday(todayRow || null);
    } catch {
      toast.error('Unable to load attendance data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const from =
      range === 'week'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
        : new Date(now.getFullYear(), now.getMonth(), 1);
    const f = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const to = `${y}-${m}-${String(now.getDate()).padStart(2, '0')}`;
    load(f, to);
  }, [range, load]);

  const getPosition = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });

  const toggle = async () => {
    if (busy || !user) return;
    setBusy(true);
    setGeoStatus('Capturing location…');
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      try {
        const pos = await getPosition();
        lat = pos.lat;
        lng = pos.lng;
      } catch {
        setGeoStatus('Continuing without GPS…');
      }
      const action = today?.check_in_time && !today?.check_out_time ? 'checkout' : 'checkin';
      if (today?.check_out_time) {
        toast.info('You are already checked out for today.');
        setGeoStatus('');
        return;
      }
      const res = await fetch('/api/attendance/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lat, lng }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Update failed');
      toast.success(action === 'checkin' ? 'Checked in' : 'Checked out');
      const now = new Date();
      await load(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        localToday()
      );
    } catch (e: any) {
      toast.error(e?.message || 'Attendance update failed');
    } finally {
      setBusy(false);
      setGeoStatus('');
    }
  };

  const checkedIn = !!today?.check_in_time;
  const checkedOut = !!today?.check_out_time;
  const workedToday = today?.duration_seconds || 0;

  const daySummary = {
    present: history.filter((h) => h.check_in_time).length,
    complete: history.filter((h) => h.check_in_time && h.check_out_time).length,
    totalHours: history.reduce((s, h) => s + (h.duration_seconds || 0), 0),
  };

  const name = profile?.full_name || user?.user_metadata?.full_name || '';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {name ? `${name.split(' ')[0]}'s ` : ''}Attendance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Check in when you arrive and check out when you leave — the time is recorded by the server.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Big check-in/out hero card */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-5 relative overflow-hidden">
            <div className="flex flex-col items-center text-center gap-4">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  checkedIn && !checkedOut
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {checkedIn && !checkedOut ? (
                  <LogOut size={30} />
                ) : checkedOut ? (
                  <CheckCircle2 size={30} className="text-emerald-600" />
                ) : (
                  <LogIn size={30} />
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {checkedOut
                    ? 'Checked out for today'
                    : checkedIn
                      ? 'Checked in'
                      : 'You are not checked in'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {checkedIn ? (
                    <>
                      In at <span className="font-medium text-foreground">{fmtTime(today?.check_in_time)}</span>
                      {today?.check_in_lat != null && (
                        <span className="inline-flex items-center gap-1 ml-2 text-emerald-600">
                          <MapPin size={12} /> GPS
                        </span>
                      )}
                      {checkedOut ? (
                        <span className="ml-2">
                          · Out at <span className="font-medium text-foreground">{fmtTime(today?.check_out_time)}</span>
                        </span>
                      ) : null}
                    </>
                  ) : (
                    'Tap the button below when you arrive'
                  )}
                </p>
                {checkedIn && !checkedOut && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
                    <Timer size={12} className="text-primary" /> Worked so far:{' '}
                    <span className="font-semibold text-foreground">{fmtDuration(workedToday)}</span>
                  </p>
                )}
              </div>

              {geoStatus ? (
                <p className="text-xs text-primary flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> {geoStatus}
                </p>
              ) : null}

              <button
                onClick={toggle}
                disabled={busy || (checkedIn && checkedOut)}
                className={`h-14 px-10 rounded-2xl text-base font-bold flex items-center gap-2.5 disabled:opacity-50 transition-all w-full sm:w-auto justify-center ${
                  checkedIn && !checkedOut
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {busy ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : checkedIn && !checkedOut ? (
                  <LogOut size={22} />
                ) : checkedOut ? (
                  <CheckCircle2 size={22} />
                ) : (
                  <LogIn size={22} />
                )}
                {checkedIn && !checkedOut ? 'Check Out' : 'Check In'}
              </button>
              <p className="text-[11px] text-muted-foreground">
                You cannot edit the time — attendance stamps are recorded by the server.
              </p>
            </div>
          </div>

          {/* Range toggle */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">My attendance</h2>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    range === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {r === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          </div>

          {/* Mini summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Days present', value: daySummary.present },
              { label: 'Days complete', value: daySummary.complete },
              { label: 'Total hours', value: fmtDuration(daySummary.totalHours) },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* History cards (mobile-first) */}
          {history.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Clock size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No attendance data available yet.</p>
              <p className="text-xs text-muted-foreground">Your check-ins will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((row) => (
                <div key={row.id} className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {(() => {
                        const d = new Date(row.attendance_date + 'T00:00:00');
                        return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
                      })()}
                    </p>
                    <p className={`text-xs font-medium mt-0.5 ${
                      row.check_in_time && row.check_out_time
                        ? 'text-emerald-600'
                        : row.check_in_time
                          ? 'text-gold dark:text-gold'
                          : 'text-muted-foreground'
                    }`}>
                      {row.check_in_time && row.check_out_time
                        ? 'Complete'
                        : row.check_in_time
                          ? 'Checked in'
                          : 'Not checked in'}
                    </p>
                  </div>
                  <div className="flex-1 md:flex-none flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <LogIn size={12} /> In {fmtTime(row.check_in_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <LogOut size={12} /> Out {fmtTime(row.check_out_time)}
                    </span>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-sm font-semibold text-foreground">{fmtDuration(row.duration_seconds || 0)}</p>
                    <p className="text-[10px] text-muted-foreground">worked</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Loader2, MapPin, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface AttendanceRow {
  id: string;
  attendance_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
}

// Self-service attendance card: employee checks in/out with optional GPS.
// Uses /api/attendance/self (fallback-safe when migrations are not applied yet).
export default function AttendanceSelfCard() {
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const localToday = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  };

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance/self?from=${localToday()}&to=${localToday()}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      const rows = (json?.attendance || []) as AttendanceRow[];
      setToday(rows[0] || null);
    } catch {
      setToday(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const getPosition = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported — enable HTTPS or location permission.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err.message || 'Location unavailable — check permission.')),
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setGeoStatus('Capturing location…');
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await getPosition();
        lat = pos.lat;
        lng = pos.lng;
        setGeoStatus('Location captured');
      } catch {
        setGeoStatus('Continuing without GPS…');
      }
      const action = today?.check_out_time ? undefined : today ? 'checkout' : 'checkin';
      if (!action) {
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
      if (!res.ok) throw new Error(json.error || 'Attendance update failed');
      toast.success(action === 'checkin' ? 'Checked in' : 'Checked out');
      await loadToday();
    } catch (e: any) {
      toast.error(e?.message || 'Attendance update failed');
    } finally {
      setBusy(false);
      setGeoStatus('');
    }
  };

  const checkedIn = !!today?.check_in_time;
  const checkedOut = !!today?.check_out_time;
  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          checkedIn && !checkedOut
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-primary/10 text-primary'
        }`}
      >
        {checkedIn && !checkedOut ? <LogIn size={20} /> : <LogOut size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {loading ? 'Checking…' : checkedOut ? 'Checked out' : checkedIn ? 'Checked in' : 'Attendance'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {checkedIn ? (
            <>
              In {fmt(today?.check_in_time)}
              {today?.check_in_lat != null ? (
                <span className="inline-flex items-center gap-1 ml-2 text-emerald-600">
                  <MapPin size={10} /> GPS
                </span>
              ) : null}
              {checkedOut ? (
                <span className="ml-2 text-muted-foreground">· Out {fmt(today?.check_out_time)}</span>
              ) : null}
            </>
          ) : (
            'You are not marked present for today.'
          )}
        </p>
        {geoStatus ? (
          <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> {geoStatus}
          </p>
        ) : null}
      </div>
      <button
        onClick={toggle}
        disabled={loading || busy || checkedOut}
        className={`h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors flex-shrink-0 ${
          checkedIn && !checkedOut
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : checkedIn && !checkedOut ? <LogOut size={14} /> : <LogIn size={14} />}
        {checkedIn && !checkedOut ? 'Check out' : 'Check in'}
      </button>
    </div>
  );
}
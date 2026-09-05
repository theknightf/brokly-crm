'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Loader2, MapPin, MapPinOff, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPositionWithFallback, readJsonSafe, type GeoOutcome } from '@/lib/geolocation';

interface AttendanceRow {
  id: string;
  attendance_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
}

// Self-service attendance card: employee checks in/out with staged GPS.
// Dark Slate & Neon Lime hero. Uses /api/attendance/self.
export default function AttendanceSelfCard() {
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState('');
  const [geo, setGeo] = useState<GeoOutcome | null>(null);
  const [loadError, setLoadError] = useState('');

  const localToday = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  };

  const loadToday = useCallback(async () => {
    try {
      setLoadError('');
      const res = await fetch(`/api/attendance/self?from=${localToday()}&to=${localToday()}`, {
        cache: 'no-store',
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error || `Failed to load (HTTP ${res.status})`);
      const rows = (json?.attendance || []) as AttendanceRow[];
      setToday(rows[0] || null);
    } catch (e: any) {
      setToday(null);
      setLoadError(e?.message || 'Could not load attendance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setGeo(null);
    try {
      // ── Staged GPS: high accuracy → network → proceed without fix ──
      setBusyPhase('Getting GPS location…');
      const outcome = await getPositionWithFallback((phase) =>
        setBusyPhase(phase === 'gps' ? 'Getting GPS location…' : 'Trying network location…')
      );
      setGeo(outcome);
      const lat = outcome.fix?.lat ?? null;
      const lng = outcome.fix?.lng ?? null;

      const action = today?.check_out_time ? undefined : today?.check_in_time ? 'checkout' : 'checkin';
      if (!action) {
        toast.info('You are already checked out for today.');
        return;
      }
      setBusyPhase(action === 'checkin' ? 'Checking you in…' : 'Checking you out…');
      const res = await fetch('/api/attendance/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lat, lng, locationVerified: outcome.verified }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error || `Check-${action === 'checkin' ? 'in' : 'out'} failed (HTTP ${res.status})`);
      if (json?.alreadyCheckedIn) {
        toast.info('Already checked in — status refreshed.');
      } else {
        toast.success(
          action === 'checkin'
            ? outcome.verified
              ? 'Checked in — location verified'
              : 'Checked in (without GPS location)'
            : 'Checked out — have a good evening'
        );
      }
      await loadToday();
    } catch (e: any) {
      // Exact server message so the user knows what happened (e.g. out-of-range meters).
      toast.error(e?.message || 'Attendance update failed', { duration: 6000 });
    } finally {
      setBusy(false);
      setBusyPhase('');
    }
  };

  const checkedIn = !!today?.check_in_time;
  const checkedOut = !!today?.check_out_time;
  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="rounded-2xl border border-white/10 bg-[#181b22] p-4 sm:p-5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-4">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
            checkedIn && !checkedOut
              ? 'bg-lime-500/15 text-lime-400 border-lime-500/30'
              : checkedOut
                ? 'bg-white/5 text-zinc-400 border-white/10'
                : 'bg-lime-500 text-zinc-950 border-lime-400'
          }`}
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : checkedOut ? (
            <CheckCircle2 size={20} />
          ) : checkedIn ? (
            <LogOut size={20} />
          ) : (
            <LogIn size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-100" dir="rtl">
            {loading ? 'جارٍ التحميل…' : checkedOut ? 'تم تسجيل الانصراف' : checkedIn ? 'تم تسجيل الحضور' : 'تسجيل الحضور'}
          </p>
          <p className="text-[11px] text-zinc-400" dir="ltr">
            {loading ? 'Loading…' : checkedOut ? 'Checked out' : checkedIn ? 'Checked in' : 'Check-in'}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {checkedIn ? (
              <>
                In {fmt(today?.check_in_time)}
                {today?.check_in_lat != null ? (
                  <span className="inline-flex items-center gap-1 ml-2 text-lime-400">
                    <MapPin size={10} /> GPS
                  </span>
                ) : null}
                {checkedOut ? <span className="ml-2 text-zinc-500">· Out {fmt(today?.check_out_time)}</span> : null}
              </>
            ) : (
              'You are not marked present for today.'
            )}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={loading || busy || checkedOut}
          className={`min-h-[44px] px-5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-all flex-shrink-0 ${
            checkedIn && !checkedOut
              ? 'bg-[#ef4444] hover:bg-red-500 text-white shadow-[0_10px_28px_-10px_rgba(239,68,68,0.6)]'
              : 'bg-lime-500 hover:bg-lime-400 text-zinc-950 shadow-[0_10px_28px_-10px_rgba(132,204,22,0.6)]'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : checkedIn && !checkedOut ? <LogOut size={15} /> : <LogIn size={15} />}
          {busy ? 'Working…' : checkedIn && !checkedOut ? 'Check out' : 'Check in'}
        </button>
      </div>

      {/* Explicit busy phase (GPS vs API) */}
      {busy && busyPhase ? (
        <p className="text-[11px] text-lime-300/90 mt-3 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> {busyPhase}
        </p>
      ) : null}

      {/* Load failure — non-intrusive inline banner */}
      {!loading && loadError ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{loadError}</span>
          <button onClick={() => { setLoading(true); loadToday(); }} className="shrink-0 font-bold underline underline-offset-2">
            Retry
          </button>
        </div>
      ) : null}

      {/* GPS fallback banner — explains + offers manual path, never a dead end */}
      {!busy && geo && !geo.verified && geo.reason && (checkedIn || !loadError) ? (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <MapPinOff size={14} className="text-amber-300 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-200" dir="rtl">تعذّر تحديد الموقع — تم المتابعة بدونه</p>
            <p className="text-[11px] text-amber-200/80 leading-snug">{geo.reason}</p>
            <p className="text-[11px] text-amber-200/70 mt-1" dir="rtl">
              لتفعيل GPS: فعّل الموقع من المتصفح/الهاتف، أو اطلب حضوراً يدوياً من الإدارة.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LogIn, LogOut, Loader2, MapPin, MapPinOff, Clock, Timer,
  CheckCircle2, AlertTriangle, CalendarDays, Hourglass,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getPositionWithFallback, readJsonSafe, type GeoOutcome } from '@/lib/geolocation';
import { companySettingsService } from '@/lib/services/peopleOpsService';

interface AttendanceRow {
  id: string;
  attendance_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  duration_seconds?: number;
  delay_minutes?: number | null;
  is_late?: boolean | null;
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

function fmtShift12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return hhmm;
  let h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${m[2]} ${suffix}`;
}

export default function EmployeeAttendanceView() {
  const { user, profile } = useAuth();
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [leavesUsed, setLeavesUsed] = useState(0);
  const [shift, setShift] = useState({ start: '12:00', end: '20:00', grace: 30 });
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState('');
  const [geo, setGeo] = useState<GeoOutcome | null>(null);
  const [rangeError, setRangeError] = useState<{ message: string; code?: string; distanceM?: number; radiusM?: number; locationLabel?: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  // Live clock — client-only (mounted guard avoids hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (from: string, to: string) => {
    try {
      setLoadError('');
      const res = await fetch(`/api/attendance/self?from=${from}&to=${to}`, { cache: 'no-store' });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error || `Failed to load (HTTP ${res.status})`);
      const rows = (json?.attendance || []) as AttendanceRow[];
      setHistory(rows);
      setToday(rows.find((r) => r.attendance_date === localToday()) || null);
    } catch (e: any) {
      setLoadError(e?.message || 'Unable to load attendance data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Shift window + monthly approved leaves (best-effort, never blocks the view).
  useEffect(() => {
    companySettingsService
      .getWorkingHours()
      .then((w: any) => {
        if (w?.start && w?.end) {
          setShift({ start: w.start, end: w.end, grace: Number(w.lateGraceMinutes ?? 30) });
        }
      })
      .catch(() => {});
    (async () => {
      try {
        const { leaveService } = await import('@/lib/services/peopleOpsService');
        const all = await leaveService.getAll();
        const prefix = localToday().slice(0, 7);
        setLeavesUsed(
          all.filter((l: any) => l.status === 'approved' && String(l.startDate || '').startsWith(prefix)).length
        );
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const nowD = new Date();
    const from =
      range === 'week'
        ? new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - 6)
        : new Date(nowD.getFullYear(), nowD.getMonth(), 1);
    const f = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    load(f, localToday());
  }, [range, load]);

  const toggle = async () => {
    if (busy) return;
    if (!user) {
      toast.error('Please sign in again to check in.');
      return;
    }
    setBusy(true);
    setGeo(null);
    setRangeError(null);
    try {
      setBusyPhase('Getting GPS location…');
      const outcome = await getPositionWithFallback((phase) =>
        setBusyPhase(phase === 'gps' ? 'Getting GPS location…' : 'Trying network location…')
      );
      setGeo(outcome);
      const lat = outcome.fix?.lat ?? null;
      const lng = outcome.fix?.lng ?? null;

      if (today?.check_out_time) {
        toast.info('You are already checked out for today.');
        return;
      }
      const action = today?.check_in_time ? 'checkout' : 'checkin';
      setBusyPhase(action === 'checkin' ? 'Sending check-in…' : 'Sending check-out…');
      const res = await fetch('/api/attendance/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lat, lng, locationVerified: outcome.verified }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        if (json?.code === 'OUT_OF_RANGE') {
          setRangeError({
            message: json.error,
            code: json.code,
            distanceM: json.distanceM,
            radiusM: json.radiusM,
            locationLabel: json.locationLabel,
          });
        }
        throw new Error(json?.error || `Check-${action === 'checkin' ? 'in' : 'out'} failed (HTTP ${res.status})`);
      }
      if (json?.alreadyCheckedIn) {
        toast.info('Already checked in — status refreshed.');
      } else {
        toast.success(
          action === 'checkin'
            ? outcome.verified
              ? 'تم تسجيل الحضور — Checked in (GPS verified)'
              : 'تم تسجيل الحضور — Checked in (no GPS)'
            : 'تم تسجيل الانصراف — Checked out'
        );
      }
      setLoading(true);
      await load(
        range === 'week'
          ? (() => {
              const d = new Date();
              d.setDate(d.getDate() - 6);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })()
          : localToday().slice(0, 7) + '-01',
        localToday()
      );
    } catch (e: any) {
      toast.error(e?.message || 'Attendance update failed', { duration: 6000 });
    } finally {
      setBusy(false);
      setBusyPhase('');
    }
  };

  const checkedIn = !!today?.check_in_time;
  const checkedOut = !!today?.check_out_time;
  const workedToday = today?.duration_seconds || 0;
  const delayToday = Number(today?.delay_minutes || 0);

  const daySummary = useMemo(() => ({
    present: history.filter((h) => h.check_in_time).length,
    complete: history.filter((h) => h.check_in_time && h.check_out_time).length,
    totalHours: history.reduce((s, h) => s + (h.duration_seconds || 0), 0),
  }), [history]);

  const name = profile?.full_name || (user as any)?.user_metadata?.full_name || '';
  const gpsVerified = today?.check_in_lat != null || geo?.verified === true;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <p className="text-xl sm:text-2xl font-bold text-foreground" dir="rtl">
          {name ? `${name.split(' ')[0]} — ` : ''}سجل الحضور اليومي
        </p>
        <p className="text-sm text-muted-foreground mt-0.5" dir="ltr">
          {name ? `${name.split(' ')[0]}'s ` : ''}Attendance — check in on arrival, out on leave.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="rounded-2xl border border-white/10 bg-[#181b22] p-6 animate-pulse">
            <div className="h-10 w-40 mx-auto rounded-lg bg-white/10" />
            <div className="h-4 w-56 mx-auto rounded bg-white/10 mt-3" />
            <div className="h-14 rounded-2xl bg-white/10 mt-5" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-[#181b22] p-4 animate-pulse">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-3 w-48 rounded bg-white/10 mt-2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {!user ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
              Please sign in to use self check-in.
            </div>
          ) : null}

          {loadError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4 flex items-center justify-between gap-2">
              <span className="min-w-0">{loadError}</span>
              <button onClick={() => { setLoading(true); load(localToday().slice(0, 7) + '-01', localToday()); }} className="shrink-0 font-bold underline underline-offset-2">
                Retry
              </button>
            </div>
          ) : null}

          {/* ── Status Hero Card ── */}
          <div className="rounded-2xl border border-white/10 bg-[#181b22] p-5 sm:p-6 mb-4 relative overflow-hidden shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)]">
            <div className="pointer-events-none absolute -top-24 -end-24 w-64 h-64 rounded-full bg-lime-500/10 blur-3xl" />
            <div className="flex flex-col items-center text-center gap-3 relative">
              {/* Live clock */}
              <p className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight text-zinc-50" dir="ltr">
                {mounted && now
                  ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '--:--:--'}
              </p>
              <p className="text-xs text-zinc-400" dir="ltr">
                {mounted && now ? now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}
              </p>

              {/* Shift + geo status row */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-zinc-200" dir="ltr">
                  <Clock size={12} className="text-lime-400" />
                  Shift: {fmtShift12(shift.start)} – {fmtShift12(shift.end)}
                </span>
                {gpsVerified ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1.5 text-[11px] font-bold text-lime-300" dir="ltr">
                    <span className="relative flex w-2 h-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-400" />
                    </span>
                    GPS · In Range
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-300" dir="ltr">
                    <MapPinOff size={12} />
                    No GPS · Manual
                  </span>
                )}
              </div>

              {/* State line */}
              <div>
                <p className="text-base font-bold text-zinc-100" dir="rtl">
                  {checkedOut ? 'تم تسجيل الانصراف اليوم' : checkedIn ? 'تم تسجيل حضورك' : 'لم تسجّل حضورك بعد'}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5" dir="ltr">
                  {checkedOut ? 'Checked out for today' : checkedIn ? 'Checked in' : 'Not checked in yet'}
                </p>
                {checkedIn ? (
                  <p className="text-xs text-zinc-400 mt-1.5" dir="ltr">
                    In at <span className="font-bold text-zinc-100">{fmtTime(today?.check_in_time)}</span>
                    {today?.check_in_lat != null && (
                      <span className="inline-flex items-center gap-1 ml-2 text-lime-400">
                        <MapPin size={11} /> GPS
                      </span>
                    )}
                    {checkedOut ? (
                      <span className="ml-2">
                        · Out at <span className="font-bold text-zinc-100">{fmtTime(today?.check_out_time)}</span>
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {checkedIn && !checkedOut ? (
                  <p className="text-xs text-zinc-400 mt-1.5 flex items-center justify-center gap-1.5">
                    <Timer size={12} className="text-lime-400" />
                    <span dir="rtl">ساعات العمل اليوم:</span>
                    <span className="font-bold text-zinc-100" dir="ltr">{fmtDuration(workedToday)}</span>
                  </p>
                ) : null}
              </div>

              {busy && busyPhase ? (
                <p className="text-xs text-lime-300 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> {busyPhase}
                </p>
              ) : null}

              {/* Big thumb-friendly action */}
              <button
                onClick={toggle}
                disabled={busy || (checkedIn && checkedOut) || !user}
                className={`min-h-[56px] w-full px-8 rounded-2xl text-base font-black flex flex-col items-center justify-center gap-0.5 leading-tight disabled:opacity-50 transition-all active:scale-[0.99] ${
                  checkedIn && !checkedOut
                    ? 'bg-[#ef4444] hover:bg-red-500 text-white shadow-[0_14px_36px_-12px_rgba(239,68,68,0.65)]'
                    : 'bg-lime-500 hover:bg-lime-400 text-zinc-950 shadow-[0_14px_36px_-12px_rgba(132,204,22,0.65)]'
                }`}
              >
                <span className="flex items-center gap-2" dir="rtl">
                  {busy ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : checkedIn && !checkedOut ? (
                    <LogOut size={22} />
                  ) : checkedOut ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <LogIn size={22} />
                  )}
                  {busy ? 'جارٍ التنفيذ…' : checkedIn && !checkedOut ? 'تسجيل الانصراف' : 'تسجيل الحضور'}
                </span>
                <span className="text-[11px] font-bold opacity-70" dir="ltr">
                  {busy ? busyPhase || 'Working…' : checkedIn && !checkedOut ? 'Check-out' : checkedOut ? 'Done for today' : 'Check-in'}
                </span>
              </button>
              <p className="text-[11px] text-zinc-500" dir="rtl">
                لا يمكن تعديل الوقت — يُحفظ تلقائياً من السيرفر
              </p>
            </div>
          </div>

          {/* Out-of-range banner — exact meters, never a dead end */}
          {rangeError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 mb-4 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-300 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-red-200" dir="rtl">خارج نطاق موقع العمل</p>
                <p className="text-xs text-red-200/90 leading-snug" dir="ltr">{rangeError.message}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    onClick={toggle}
                    disabled={busy}
                    className="h-9 px-4 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-zinc-100 hover:bg-white/15 disabled:opacity-50"
                  >
                    Retry with GPS
                  </button>
                  <span className="text-[11px] text-red-200/70" dir="rtl">
                    أو اطلب حضوراً يدوياً من الإدارة — Manual attendance via admin
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* GPS fallback banner */}
          {!busy && geo && !geo.verified && geo.reason && !rangeError ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4 flex items-start gap-2.5">
              <MapPinOff size={16} className="text-amber-300 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-200" dir="rtl">تعذّر تحديد الموقع — تم المتابعة بدونه</p>
                <p className="text-xs text-amber-200/85 leading-snug">{geo.reason}</p>
                <p className="text-[11px] text-amber-200/70 mt-1" dir="rtl">
                  لتفعيل GPS: فعّل الموقع من إعدادات المتصفح/الهاتف واستخدم HTTPS.
                </p>
              </div>
            </div>
          ) : null}

          {/* ── Quick stat pills ── */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <div className="rounded-2xl border border-white/10 bg-[#181b22] px-3 py-3 text-center">
              <Hourglass size={14} className="mx-auto text-lime-400 mb-1" />
              <p className="text-base font-black text-zinc-50" dir="ltr">{fmtDuration(workedToday)}</p>
              <p className="text-[11px] font-bold text-zinc-300 mt-0.5" dir="rtl">ساعات اليوم</p>
              <p className="text-[10px] text-zinc-500" dir="ltr">Hours today</p>
            </div>
            <div className={`rounded-2xl border px-3 py-3 text-center ${delayToday > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-white/10 bg-[#181b22]'}`}>
              <Timer size={14} className={`mx-auto mb-1 ${delayToday > 0 ? 'text-amber-300' : 'text-zinc-400'}`} />
              <p className={`text-base font-black ${delayToday > 0 ? 'text-amber-200' : 'text-zinc-50'}`} dir="ltr">
                {delayToday > 0 ? `${delayToday}m` : '0m'}
              </p>
              <p className="text-[11px] font-bold text-zinc-300 mt-0.5" dir="rtl">تأخير اليوم</p>
              <p className="text-[10px] text-zinc-500" dir="ltr">
                {delayToday > 0 ? 'Delay · deduction may apply' : 'Delay · on time'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#181b22] px-3 py-3 text-center">
              <CalendarDays size={14} className="mx-auto text-sky-400 mb-1" />
              <p className="text-base font-black text-zinc-50" dir="ltr">{leavesUsed}d</p>
              <p className="text-[11px] font-bold text-zinc-300 mt-0.5" dir="rtl">إجازات الشهر</p>
              <p className="text-[10px] text-zinc-500" dir="ltr">Leave used · month</p>
            </div>
          </div>

          {/* Range toggle */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-base font-bold text-foreground" dir="rtl">سجل حضوري</p>
              <p className="text-[11px] text-muted-foreground" dir="ltr">My attendance</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#181b22] p-1">
              {(['week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); setLoading(true); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    range === r ? 'bg-lime-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {r === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          </div>

          {/* Mini summary */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {[
              { labelAr: 'أيام الحضور', labelEn: 'Days present', value: daySummary.present },
              { labelAr: 'أيام مكتملة', labelEn: 'Days complete', value: daySummary.complete },
              { labelAr: 'إجمالي الساعات', labelEn: 'Total hours', value: fmtDuration(daySummary.totalHours) },
            ].map((s) => (
              <div key={s.labelEn} className="rounded-xl border border-white/10 bg-[#181b22] px-3 py-2.5 text-center">
                <p className="text-base font-black text-zinc-50" dir="ltr">{s.value}</p>
                <p className="text-[11px] font-bold text-zinc-300" dir="rtl">{s.labelAr}</p>
                <p className="text-[10px] text-zinc-500" dir="ltr">{s.labelEn}</p>
              </div>
            ))}
          </div>

          {/* History cards */}
          {history.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#181b22] py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
                <Clock size={20} className="text-zinc-500" />
              </div>
              <p className="text-sm font-bold text-zinc-200" dir="rtl">لا توجد بيانات حضور بعد</p>
              <p className="text-xs text-zinc-500" dir="ltr">No attendance yet — your check-ins will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((row) => {
                const done = !!(row.check_in_time && row.check_out_time);
                const partial = !!(row.check_in_time && !row.check_out_time);
                const late = Number(row.delay_minutes || 0) > 0;
                return (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-[#181b22] p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-100" dir="ltr">
                        {(() => {
                          const d = new Date(row.attendance_date + 'T00:00:00');
                          return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
                        })()}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          done
                            ? 'bg-lime-500/10 text-lime-300 border-lime-500/30'
                            : partial
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-white/5 text-zinc-400 border-white/10'
                        }`}>
                          {done ? <CheckCircle2 size={10} /> : partial ? <Hourglass size={10} /> : null}
                          {done ? 'Complete' : partial ? 'Checked in' : 'Absent'}
                        </span>
                        {late ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-300 border border-amber-500/30" dir="ltr">
                            <AlertTriangle size={10} /> Late {row.delay_minutes}m
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex-1 md:flex-none flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400" dir="ltr">
                      <span className="flex items-center gap-1">
                        <LogIn size={12} className="text-lime-400" /> In {fmtTime(row.check_in_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <LogOut size={12} className="text-red-400" /> Out {fmtTime(row.check_out_time)}
                      </span>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-black text-zinc-50" dir="ltr">{fmtDuration(row.duration_seconds || 0)}</p>
                      <p className="text-[10px] text-zinc-500" dir="ltr">worked</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LogIn, LogOut, Loader2, MapPin, MapPinOff, Clock,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
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
    late: history.filter((h) => Number(h.delay_minutes || 0) > 0).length,
    totalHours: history.reduce((s, h) => s + (h.duration_seconds || 0), 0),
  }), [history]);

  const name = (profile?.full_name || '').split(' ')[0];
  const gpsVerified = today?.check_in_lat != null || geo?.verified === true;
  const T = (ar: string, en: string) => (isAr ? ar : en);

  // Time worked so far today (live while checked in, final once checked out).
  const workedLive = (() => {
    if (!today?.check_in_time) return 0;
    if (today.check_out_time) return workedToday || Math.max(0, Math.round((Date.parse(today.check_out_time) - Date.parse(today.check_in_time)) / 1000));
    return now ? Math.max(0, Math.round((now.getTime() - Date.parse(today.check_in_time)) / 1000)) : workedToday;
  })();
  const liveClock = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const state = checkedOut ? 'done' : checkedIn ? 'working' : 'idle';
  const stateText = {
    idle: T('لسه ما سجلتش حضورك', 'Not checked in yet'),
    working: T('شغال دلوقتي', 'Working now'),
    done: T('خلصت النهارده', 'Done for today'),
  }[state];
  const stateTone = {
    idle: 'bg-muted text-muted-foreground',
    working: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    done: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  }[state];

  const dayLabel = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(isAr ? 'ar-EG' : [], { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          {name ? T(`أهلاً ${name}`, `Hi ${name}`) : T('الحضور', 'Attendance')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mounted && now ? now.toLocaleDateString(isAr ? 'ar-EG' : [], { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}
        </p>
      </div>

      {!user ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {T('سجّل دخول تاني عشان تسجل حضورك.', 'Please sign in again to check in.')}
        </div>
      ) : null}

      {loadError ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span className="min-w-0">{loadError}</span>
          <button onClick={() => { setLoading(true); load(localToday().slice(0, 7) + '-01', localToday()); }} className="shrink-0 font-bold underline underline-offset-2">
            {T('حاول تاني', 'Retry')}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3 animate-pulse" aria-busy="true">
          <div className="dash-card h-72" />
          <div className="dash-card h-24" />
          <div className="dash-card h-64" />
        </div>
      ) : (
        <>
          {/* ── Today: ONE card with ONE big button ── */}
          <section className="dash-card overflow-hidden p-5 text-center" aria-label={T('النهارده', 'Today')}>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${stateTone}`}>
              {state === 'working' ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              {stateText}
            </span>

            <p className="mt-3 text-5xl font-black tabular-nums tracking-tight text-foreground" dir="ltr">
              {state === 'idle'
                ? mounted && now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'
                : liveClock(workedLive)}
            </p>
            <p className="text-xs text-muted-foreground">
              {state === 'idle' ? T('الساعة دلوقتي', 'Current time') : T('ساعات الشغل النهارده', 'Worked today')}
            </p>

            <button
              onClick={toggle}
              disabled={busy || checkedOut || !user}
              className={`mt-5 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl text-lg font-extrabold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                state === 'working'
                  ? 'bg-red-600 text-white shadow-[0_14px_36px_-14px_rgba(220,38,38,0.7)] hover:bg-red-700'
                  : state === 'done'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary text-primary-foreground shadow-[0_14px_36px_-14px_rgba(132,204,22,0.8)] hover:brightness-95'
              }`}
            >
              {busy ? <Loader2 size={24} className="animate-spin" /> : state === 'working' ? <LogOut size={24} /> : state === 'done' ? <CheckCircle2 size={24} /> : <LogIn size={24} />}
              {busy
                ? busyPhase || T('جاري التنفيذ…', 'Working…')
                : state === 'working'
                  ? T('سجّل انصراف', 'Check out')
                  : state === 'done'
                    ? T('تم النهارده', 'All done')
                    : T('سجّل حضور', 'Check in')}
            </button>

            {/* In / Out / Shift — plain facts under the button */}
            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[11px] text-muted-foreground">{T('دخول', 'In')}</dt>
                <dd className="text-sm font-bold tabular-nums text-foreground" dir="ltr">{fmtTime(today?.check_in_time)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">{T('خروج', 'Out')}</dt>
                <dd className="text-sm font-bold tabular-nums text-foreground" dir="ltr">{fmtTime(today?.check_out_time)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">{T('الشيفت', 'Shift')}</dt>
                <dd className="text-sm font-bold tabular-nums text-foreground" dir="ltr">{fmtShift12(shift.start)}–{fmtShift12(shift.end)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold">
              {gpsVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300"><MapPin size={11} /> {T('الموقع تمام', 'Location OK')}</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground"><MapPinOff size={11} /> {T('من غير موقع', 'No location')}</span>
              )}
              {delayToday > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300"><AlertTriangle size={11} /> {T(`متأخر ${delayToday} د`, `Late ${delayToday} min`)}</span>
              ) : checkedIn ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={11} /> {T('في الميعاد', 'On time')}</span>
              ) : null}
            </div>
          </section>

          {/* Problems, shown only when they happen */}
          {rangeError ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-red-700 dark:text-red-200">{T('إنت بعيد عن مكان الشغل', 'You are outside the work location')}</p>
                <p className="text-xs leading-snug text-red-700/90 dark:text-red-200/90">{rangeError.message}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={toggle} disabled={busy} className="h-9 rounded-xl border border-border bg-card px-4 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50">
                    {T('جرّب تاني', 'Try again')}
                  </button>
                  <span className="text-[11px] text-red-700/80 dark:text-red-200/70">{T('أو اطلب تسجيل يدوي من الإدارة', 'or ask the admin to log it manually')}</span>
                </div>
              </div>
            </div>
          ) : null}

          {!busy && geo && !geo.verified && geo.reason && !rangeError ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <MapPinOff size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{T('مقدرناش نحدد موقعك، كملنا من غيره', 'We could not get your location, continued without it')}</p>
                <p className="text-xs leading-snug text-amber-800/90 dark:text-amber-200/85">{geo.reason}</p>
              </div>
            </div>
          ) : null}

          {/* ── Summary: four plain numbers + week/month switch ── */}
          <section aria-label={T('ملخصي', 'My summary')} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">{T('سجلي', 'My record')}</h2>
              <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
                {(['week', 'month'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRange(r); setLoading(true); }}
                    aria-pressed={range === r}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold [@media(pointer:coarse)]:min-h-[40px] ${range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {r === 'week' ? T('أسبوع', 'Week') : T('شهر', 'Month')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { l: T('حضور', 'Present'), v: daySummary.present, tone: 'text-foreground' },
                { l: T('مكتمل', 'Complete'), v: daySummary.complete, tone: 'text-foreground' },
                { l: T('تأخير', 'Late'), v: daySummary.late, tone: daySummary.late ? 'text-amber-600 dark:text-amber-300' : 'text-foreground' },
                { l: T('ساعات', 'Hours'), v: fmtDuration(daySummary.totalHours), tone: 'text-foreground' },
              ].map((s) => (
                <div key={s.l} className="dash-card px-2 py-3 text-center">
                  <p className={`text-xl font-extrabold tabular-nums ${s.tone}`} dir="ltr">{s.v}</p>
                  <p className="text-[11px] text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
            {leavesUsed > 0 ? (
              <p className="text-xs text-muted-foreground">{T(`إجازات الشهر ده: ${leavesUsed} يوم`, `Leave this month: ${leavesUsed} day(s)`)}</p>
            ) : null}
          </section>

          {/* ── History: one card, one line per day ── */}
          <section className="dash-card overflow-hidden" aria-label={T('السجل', 'History')}>
            {history.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Clock size={22} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{T('مفيش حضور مسجّل لسه', 'No attendance yet')}</p>
                <p className="text-xs text-muted-foreground">{T('أيامك هتظهر هنا.', 'Your days will show up here.')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((row) => {
                  const done = !!(row.check_in_time && row.check_out_time);
                  const partial = !!(row.check_in_time && !row.check_out_time);
                  const late = Number(row.delay_minutes || 0) > 0;
                  return (
                    <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${done ? 'bg-emerald-500' : partial ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{dayLabel(row.attendance_date)}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" dir="ltr">
                          <span>{fmtTime(row.check_in_time)} → {fmtTime(row.check_out_time)}</span>
                          {late ? <span className="font-semibold text-amber-600 dark:text-amber-300">{T(`متأخر ${row.delay_minutes} د`, `late ${row.delay_minutes}m`)}</span> : null}
                          {partial ? <span className="font-semibold text-amber-600 dark:text-amber-300">{T('من غير انصراف', 'no check-out')}</span> : null}
                        </p>
                      </div>
                      <p className="flex-shrink-0 text-sm font-extrabold tabular-nums text-foreground" dir="ltr">{fmtDuration(row.duration_seconds || 0)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

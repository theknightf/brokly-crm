'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Save, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { companySettingsService, DEFAULT_WORKING_HOURS } from '@/lib/services/peopleOpsService';
import { buildOfficeHours, type OfficeHoursConfig } from '@/lib/officeHours';

interface AttendanceUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface ManualAttendanceModalProps {
  users: AttendanceUser[];
  defaultDate?: string;
  editUserId?: string;
  onClose: () => void;
  onSaved: () => void;
}

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/**
 * Build an ISO timestamp from a local date + "HH:MM" pair.
 * The selected local wall-clock time is the single source of truth — the server
 * stores exactly this instant (converted to UTC internally). We never fall back
 * to "now" for an explicit selection; invalid input returns null so the UI can
 * block the save instead of silently stamping the current time.
 */
function buildISO(date: string, time: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '';
  if (!t) return null;
  const d = new Date(`${date}T${t}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function ManualAttendanceModal({
  users,
  defaultDate,
  editUserId,
  onClose,
  onSaved,
}: ManualAttendanceModalProps) {
  const [userId, setUserId] = useState(editUserId || '');
  const [date, setDate] = useState(defaultDate || todayLocal());
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [officeCfg, setOfficeCfg] = useState<OfficeHoursConfig>(() =>
    buildOfficeHours(DEFAULT_WORKING_HOURS)
  );

  const isEdit = !!editUserId;
  const activeUsers = useMemo(() => users.filter((u) => u.is_active !== false), [users]);
  const selectedUser = users.find((u) => u.id === userId);

  // Default the check-in to the company's shift start (office hours setting).
  useEffect(() => {
    if (editUserId) return;
    setCheckIn(officeCfg.start);
  }, [officeCfg.start, editUserId]);

  // When editing, pre-fill current values from the admin daily endpoint.
  useEffect(() => {
    if (!editUserId) return;
    (async () => {
      const dayRes = await fetch(`/api/attendance?date=${encodeURIComponent(date)}`)
        .then((r) => r.json())
        .catch(() => null);
      const rec = (dayRes?.attendance || []).find((x: any) => x.user_id === editUserId);
      if (rec) {
        if (rec.check_in_time) {
          const d = new Date(rec.check_in_time);
          setCheckIn(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
        if (rec.check_out_time) {
          const d = new Date(rec.check_out_time);
          setCheckOut(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
      }
    })();
  }, [editUserId, date]);

  useEffect(() => {
    companySettingsService
      .getWorkingHours()
      .then((w) => setOfficeCfg(buildOfficeHours(w)))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!userId) {
      toast.error('Select an employee');
      return;
    }
    const checkInISO = buildISO(date, checkIn);
    if (!checkInISO) {
      toast.error('Enter a valid check-in time');
      return;
    }
    const checkOutISO = checkOut ? buildISO(date, checkOut) : null;
    if (checkOut && !checkOutISO) {
      toast.error('Enter a valid check-out time');
      return;
    }
    if (checkOutISO && new Date(checkOutISO).getTime() < new Date(checkInISO).getTime()) {
      toast.error('Check-out cannot be before check-in');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          userId,
          date,
          checkInTime: checkInISO,
          checkOutTime: checkOutISO,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Save failed');
      toast.success(isEdit ? 'Attendance updated' : 'Manual attendance added');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const darkInput =
    'w-full bg-[#12141a] text-zinc-100 border border-white/10 rounded-xl px-3 py-2.5 text-sm placeholder:text-zinc-500 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-colors disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#181b22] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#181b22] rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <p className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <UserPlus size={16} className="text-lime-400" />
              {isEdit ? 'Edit attendance' : 'Add attendance'}
            </p>
            <p className="text-[11px] text-zinc-500" dir="ltr">{isEdit ? 'Edit record' : 'Manual entry'}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100 flex items-center justify-center transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-zinc-400">
            The times you pick are saved exactly as shown. Regular check-ins use the server time.
          </p>

          <div>
            <label className="block text-xs font-bold text-zinc-200 mb-1.5">Employee</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={darkInput} disabled={isEdit}>
              <option value="">Select employee…</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                  {u.role ? ` — ${u.role}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-200 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
              className={darkInput}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-200 mb-1.5">Check-in time</label>
              <input
                type="time"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className={darkInput}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-200 mb-1.5">Check-out time</label>
              <input
                type="time"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className={darkInput}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-200 mb-1.5">
              Reason <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Was on a field visit, sick day, permission…"
              className={`${darkInput} resize-none`}
            />
          </div>

          {selectedUser && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-400" dir="ltr">
              Will be saved as:{' '}
              <span className="font-bold text-zinc-100">
                {date} · {checkIn || '—'}
              </span>
              {checkOut ? (
                <>
                  {' '}
                  → <span className="font-bold text-zinc-100">{checkOut}</span>
                </>
              ) : null}
              <span className="ml-1">(local time)</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 pb-[env(safe-area-inset-bottom)]">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-white/15 text-sm font-bold text-zinc-200 hover:bg-white/5 transition-colors">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || !userId}
              className="h-11 flex-1 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_10px_28px_-10px_rgba(132,204,22,0.6)] transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Attendance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
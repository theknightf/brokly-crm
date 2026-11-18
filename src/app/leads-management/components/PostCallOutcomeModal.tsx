'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PhoneOff, ThumbsUp, ThumbsDown, CalendarClock, CalendarCheck, AlertTriangle, Ban, X, Loader2, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { STATUS_COLORS } from '@/lib/ui';
import { leadsService, followUpsService } from '@/lib/services/crmService';
import type { Lead } from './mockLeads';

export type PostCallOutcome =
  | 'Answered'
  | 'No Answer'
  | 'No Answer At All'
  | 'Interested'
  | 'Not Interested'
  | 'Follow-up'
  | 'Meeting'
  | 'Follow Up After Meeting'
  | 'Schedule Meeting'
  | 'Wrong Phone'
  | 'Closed Number';

interface PostCallOutcomeModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (lead: Lead, outcome: PostCallOutcome) => void;
}

const OUTCOMES: { value: PostCallOutcome; labelEn: string; labelAr: string; icon: React.ReactNode; cls: string; activeCls: string }[] = [
  {
    value: 'Answered',
    labelEn: 'Answered',
    labelAr: 'تم الرد',
    icon: <PhoneCall size={15} />,
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    activeCls: 'bg-emerald-600 text-white border-emerald-600 shadow-md',
  },
  {
    value: 'No Answer',
    labelEn: 'No Answer',
    labelAr: 'لم يتم الرد',
    icon: <PhoneOff size={15} />,
    cls: 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100',
    activeCls: 'bg-zinc-800 text-white border-zinc-800 shadow-md',
  },
  {
    value: 'No Answer At All',
    labelEn: 'No Answer At All',
    labelAr: 'لا يرد نهائياً',
    icon: <PhoneOff size={15} />,
    cls: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    activeCls: 'bg-amber-700 text-white border-amber-700 shadow-md',
  },
  {
    value: 'Interested',
    labelEn: 'Interested',
    labelAr: 'مهتم',
    icon: <ThumbsUp size={15} />,
    cls: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
    activeCls: 'bg-sky-600 text-white border-sky-600 shadow-md',
  },
  {
    value: 'Not Interested',
    labelEn: 'Not Interested',
    labelAr: 'غير مهتم',
    icon: <ThumbsDown size={15} />,
    cls: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    activeCls: 'bg-red-600 text-white border-red-600 shadow-md',
  },
  {
    value: 'Follow-up',
    labelEn: 'Follow-up',
    labelAr: 'متابعة',
    icon: <CalendarClock size={15} />,
    cls: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    activeCls: 'bg-amber-500 text-white border-amber-500 shadow-md',
  },
  {
    value: 'Meeting',
    labelEn: 'Meeting',
    labelAr: 'اجتماع / تحديد موعد',
    icon: <CalendarCheck size={15} />,
    cls: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
    activeCls: 'bg-violet-600 text-white border-violet-600 shadow-md',
  },
  {
    value: 'Follow Up After Meeting',
    labelEn: 'Follow Up After Meeting',
    labelAr: 'متابعة بعد الاجتماع',
    icon: <CalendarClock size={15} />,
    cls: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    activeCls: 'bg-indigo-600 text-white border-indigo-600 shadow-md',
  },
  {
    value: 'Wrong Phone',
    labelEn: 'Wrong Phone',
    labelAr: 'رقم خاطئ',
    icon: <AlertTriangle size={15} />,
    cls: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
    activeCls: 'bg-orange-600 text-white border-orange-600 shadow-md',
  },
  {
    value: 'Closed Number',
    labelEn: 'Closed Number',
    labelAr: 'رقم مغلق',
    icon: <Ban size={15} />,
    cls: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    activeCls: 'bg-red-600 text-white border-red-600 shadow-md',
  },
];

const OUTCOME_TO_STATUS: Record<PostCallOutcome, string> = {
  'Answered': 'Following Up',
  'No Answer': 'No Answer',
  'No Answer At All': 'No Answer At All',
  'Interested': 'Interested',
  'Not Interested': 'Not Interested',
  'Follow-up': 'Following Up',
  'Meeting': 'Meeting',
  'Follow Up After Meeting': 'Follow Up After Meeting',
  'Schedule Meeting': 'Meeting',
  'Wrong Phone': 'Wrong Number',
  'Closed Number': 'Closed Number',
};

function formatToday(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function PostCallOutcomeModal({ lead, open, onClose, onSaved }: PostCallOutcomeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [outcome, setOutcome] = useState<PostCallOutcome | null>(null);
  const { profile } = useAuth();
  const noteRequired = !isAdminRole(profile?.role); // sales cannot change a stage without a written note
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('12:00');
  const [saving, setSaving] = useState(false);
  const [nativeDuration, setNativeDuration] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  // Reset when opening for a new lead + capture native duration if already tracked
  useEffect(() => {
    if (open && lead) {
      setOutcome(null);
      setNotes('');
      setFollowUpDate(addDays(formatToday(), 1));
      setFollowUpTime('12:00');
      setSaving(false);
      // If native CallTracker already captured a call for this number, prefill duration
      try {
        const last = (window as any).__lastNativeCall as { phoneNumber: string; duration: number } | null;
        const normalizedLead = (lead.phone || '').replace(/\D/g, '').slice(-10);
        const normalizedLast = last?.phoneNumber ? String(last.phoneNumber).replace(/\D/g, '').slice(-10) : '';
        if (last && normalizedLast && normalizedLast === normalizedLead) {
          setNativeDuration(Math.max(0, Math.floor(last.duration)));
        } else {
          setNativeDuration(null);
        }
      } catch {
        setNativeDuration(null);
      }
    } else if (!open) {
      setNativeDuration(null);
    }
  }, [open, lead?.id]);

  // Listen for native callEnded while modal is open (Android bridge)
  useEffect(() => {
    if (!open || !lead) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { phoneNumber: string; duration: number } | undefined;
      if (!detail?.phoneNumber || !lead.phone) return;
      const a = detail.phoneNumber.replace(/\D/g, '').slice(-10);
      const b = lead.phone.replace(/\D/g, '').slice(-10);
      if (a && b && a === b) {
        setNativeDuration(Math.max(0, Math.floor(detail.duration)));
      }
    };
    window.addEventListener('brokly:callEnded' as any, handler);
    return () => window.removeEventListener('brokly:callEnded' as any, handler);
  }, [open, lead?.id, lead?.phone]);

  // Body scroll lock + ESC
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      document.body.classList.remove('modal-open');
    };
  }, [open, onClose]);

  // Keyboard: 1-9 and 0 pick an outcome (not while typing), Ctrl/Cmd+Enter saves.
  const saveRef = React.useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
      const idx = e.key === '0' ? 9 : Number(e.key) - 1;
      if (OUTCOMES[idx]) setOutcome(OUTCOMES[idx].value);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !lead || !mounted) return null;

  // Follow-up / Meeting / No Answer all need a next-action date. For No Answer
  // this is the retry reminder: the date lands in Follow-ups & Workspace so
  // the agent is reminded to call back.
  const needsSchedule =
    outcome === 'Follow-up' ||
    outcome === 'Schedule Meeting' ||
    outcome === 'Meeting' ||
    outcome === 'Follow Up After Meeting' ||
    outcome === 'No Answer' ||
    outcome === 'No Answer At All';

  const retryPresets: { label: string; days: number; time: string }[] = [
    { label: 'Tomorrow 10:00', days: 1, time: '10:00' },
    { label: 'In 2 days', days: 2, time: '12:00' },
    { label: 'In 3 days', days: 3, time: '12:00' },
    { label: 'Next week', days: 7, time: '12:00' },
  ];

  const handleSave = async () => {
    if (!lead || !outcome || saving) return;
    setSaving(true);

    const nextFollowUpDate = needsSchedule ? (followUpDate || addDays(formatToday(), 1)) : undefined;
    const nextFollowUpDateTime = needsSchedule && followUpTime ? `${nextFollowUpDate}T${followUpTime}:00` : nextFollowUpDate;
    const durationSeconds = nativeDuration != null ? nativeDuration : 0;
    const nextStatus = OUTCOME_TO_STATUS[outcome];

    // 1. Optimistic feedback: immediately inform parent and close modal without blocking user
    const updatedLead = {
      ...lead,
      actionTakenToday: true,
      contactedToday: true,
      hasBeenCalled: true,
      ...(nextStatus ? { status: nextStatus as any } : {}),
      ...(nextFollowUpDate ? { followUpDue: nextFollowUpDate } : {}),
    };

    if (needsSchedule && nextFollowUpDate) {
      toast.success(`Logged: ${outcome}`, {
        description:
          outcome === 'No Answer'
            ? `Retry reminder set for ${nextFollowUpDate}${followUpTime ? ` at ${followUpTime}` : ''} — find it in Follow-ups & Workspace.`
            : outcome === 'Schedule Meeting'
              ? `Meeting set for ${nextFollowUpDate} — see Calendar.`
              : `Follow-up set for ${nextFollowUpDate}.`,
        duration: 4000,
      });
    } else {
      toast.success(`Logged: ${outcome}`);
    }

    try {
      onSaved?.(updatedLead, outcome);
    } catch {
      /* ignore */
    }
    onClose();

    // 2. Background persistence: POST to /api/call-log (which now atomically persists status, follow-up, and tags)
    fetch('/api/call-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'lead',
        entity_id: lead.id,
        contact_name: lead.name || '',
        contact_phone: lead.phone || '',
        channel: 'Call',
        direction: 'outgoing',
        outcome,
        notes: notes.trim() || '',
        duration_seconds: durationSeconds,
        followUpDateTime: nextFollowUpDateTime,
        next_follow_up_date: nextFollowUpDate,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Failed to save call log');
        }
      })
      .catch((err) => {
        toast.error(err?.message || 'Failed to save call log');
      })
      .finally(() => {
        setSaving(false);
      });
  };

  saveRef.current = () => {
    if (outcome && !saving && !(noteRequired && !notes.trim())) void handleSave();
  };

  // Same colours as the stage badges everywhere else (lib/ui STATUS_COLORS), taken from the stage the outcome sets.
  const stageCls = (v: PostCallOutcome) => STATUS_COLORS[OUTCOME_TO_STATUS[v]] || 'bg-muted text-muted-foreground';
  const byValue = (v: PostCallOutcome) =>OUTCOMES.find((o) => o.value === v)!;
  const GROUPS: { key: string; titleEn: string; titleAr: string; values: PostCallOutcome[] }[] = [
    { key: 'reached', titleEn: 'Reached', titleAr: 'تم التواصل', values: ['Answered', 'Interested', 'Not Interested'] },
    { key: 'missed', titleEn: 'Not reached', titleAr: 'لم يتم التواصل', values: ['No Answer', 'No Answer At All', 'Wrong Phone', 'Closed Number'] },
    { key: 'next', titleEn: 'Next step', titleAr: 'الخطوة التالية', values: ['Follow-up', 'Meeting', 'Follow Up After Meeting'] },
  ];
  const keyOf = (v: PostCallOutcome) => OUTCOMES.findIndex((o) => o.value === v) + 1; // 1..9, 0 for the 10th
  const selected = outcome ? byValue(outcome) : null;

  const scheduleTitle =
    outcome === 'Schedule Meeting' || outcome === 'Meeting'
      ? 'Meeting schedule'
      : outcome === 'No Answer' || outcome === 'No Answer At All'
        ? 'Retry — remind me to call back'
        : 'Follow-up schedule';

  const modalContent = (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-call-title"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-[81] w-full sm:max-w-2xl bg-card rounded-t-2xl sm:rounded-2xl shadow-modal flex flex-col overflow-hidden slide-up-enter max-h-[96dvh] sm:max-h-[90vh]">
        {/* Header: who was called, duration, close */}
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 border-b border-border flex-shrink-0">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <PhoneCall size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="post-call-title" className="text-sm sm:text-base font-bold text-foreground leading-tight">
              Call outcome <span className="font-normal text-muted-foreground text-xs">· نتيجة المكالمة</span>
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {lead.name || `Lead ${lead.id}`}
              {lead.phone ? ` · ${lead.phone}` : ''}
              {nativeDuration != null ? ` · ${nativeDuration}s` : ''}
            </p>
          </div>
          {nativeDuration != null && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold">
              <PhoneCall size={11} /> {nativeDuration}s saved
            </span>
          )}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform flex-shrink-0"
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: everything on one screen. Only scrolls on very small phones. */}
        <div className="overflow-y-auto flex-1 overscroll-contain min-h-0 px-4 py-3 sm:px-5 space-y-3">
          {/* 1. Outcome, grouped. Keys 1-9, 0 pick an outcome. */}
          <div role="radiogroup" aria-label="Call outcome" className="space-y-2.5">
            {GROUPS.map((g) => (
              <div key={g.key}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {g.titleEn} <span className="font-normal normal-case">· {g.titleAr}</span>
                </p>
                <div className={`grid gap-1.5 ${g.values.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                  {g.values.map((v) => {
                    const o = byValue(v);
                    const active = outcome === v;
                    const k = keyOf(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setOutcome(v)}
                        className={`relative min-h-[52px] rounded-xl border-2 flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-bold transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${stageCls(v)} ${
                          active ? 'border-current ring-2 ring-current shadow-md' : 'border-transparent hover:brightness-95'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/60' : 'bg-white/70 shadow-sm'}`}>
                          {o.icon}
                        </span>
                        <span className="leading-tight min-w-0">
                          <span className="block truncate">{o.labelEn}</span>
                          <span className="block text-[10px] font-normal opacity-80 truncate">{o.labelAr}</span>
                        </span>
                        <kbd className={`hidden sm:flex absolute top-1 right-1.5 text-[9px] font-semibold opacity-50`}>{k === 10 ? 0 : k}</kbd>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 2. Next action, only when the outcome needs one. Presets + exact date/time. */}
          {needsSchedule && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2.5 animate-in fade-in">
              <p className="text-xs font-bold text-violet-700 flex items-center gap-1.5">
                <CalendarCheck size={13} />
                {scheduleTitle}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {retryPresets.map((p) => {
                  const active = followUpDate === addDays(formatToday(), p.days) && followUpTime === p.time;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setFollowUpDate(addDays(formatToday(), p.days));
                        setFollowUpTime(p.time);
                      }}
                      className={`h-8 px-3 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
                        active ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-violet-700 border border-violet-200 hover:bg-violet-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Date · التاريخ</span>
                  <input type="date" value={followUpDate} min={formatToday()} onChange={(e) => setFollowUpDate(e.target.value)} className="input-base h-9 text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Time · الوقت</span>
                  <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className="input-base h-9 text-sm" />
                </label>
              </div>
            </div>
          )}

          {/* 3. Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-foreground">
              Call notes · ملاحظات{' '}
              <span className="font-normal text-muted-foreground text-[11px]">
                {noteRequired ? '(required — the stage changes with it)' : '(optional)'}
              </span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Quick remarks — e.g. wants 3BR in New Zayed, budget 2M..."
              className="input-base resize-none min-h-[64px] py-2 text-sm"
            />
          </label>
        </div>

        {/* Footer: always visible. Shows what will be saved. */}
        <div className="flex items-center gap-2 px-4 py-3 sm:px-5 border-t border-border bg-card flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="hidden sm:block flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
            {selected ? (
              <>
                Stage → <span className={`rounded-full px-2 py-0.5 font-semibold ${stageCls(selected.value)}`}>{OUTCOME_TO_STATUS[selected.value]}</span>
                {needsSchedule && followUpDate ? ` · next action ${followUpDate}${followUpTime ? ` ${followUpTime}` : ''}` : ''}
              </>
            ) : (
              'Pick an outcome · Ctrl+Enter to save'
            )}
          </p>
          <button onClick={onClose} className="btn-secondary h-11 px-4 text-sm font-semibold flex-shrink-0 max-sm:flex-1" type="button">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!outcome || saving || (noteRequired && !notes.trim())}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-[0_6px_20px_-6px_rgba(132,204,22,0.65)] hover:shadow-[0_10px_28px_-6px_rgba(132,204,22,0.8)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[124px] flex-shrink-0 max-sm:flex-[2]"
            type="button"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={2.5} />
                Save log
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

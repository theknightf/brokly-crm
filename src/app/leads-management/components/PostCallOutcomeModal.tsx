'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PhoneOff, ThumbsUp, CalendarClock, CalendarCheck, AlertTriangle, Ban, X, Loader2, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { leadsService } from '@/lib/services/crmService';
import type { Lead } from './mockLeads';

export type PostCallOutcome = 'Answered' | 'No Answer' | 'Interested' | 'Follow-up' | 'Schedule Meeting' | 'Wrong Phone' | 'Closed Number';

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
    value: 'Interested',
    labelEn: 'Interested',
    labelAr: 'مهتم',
    icon: <ThumbsUp size={15} />,
    cls: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
    activeCls: 'bg-sky-600 text-white border-sky-600 shadow-md',
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
    value: 'Schedule Meeting',
    labelEn: 'Schedule Meeting',
    labelAr: 'تحديد موعد',
    icon: <CalendarCheck size={15} />,
    cls: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
    activeCls: 'bg-violet-600 text-white border-violet-600 shadow-md',
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
  'Interested': 'Interested',
  'Follow-up': 'Following Up',
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

  if (!open || !lead || !mounted) return null;

  const needsSchedule = outcome === 'Follow-up' || outcome === 'Schedule Meeting';

  const handleSave = async () => {
    if (!lead || !outcome || saving) return;
    setSaving(true);
    try {
      const nextFollowUpDate = needsSchedule ? (followUpDate || addDays(formatToday(), 1)) : undefined;
      const nextFollowUpDateTime = needsSchedule && followUpTime ? `${nextFollowUpDate}T${followUpTime}:00` : nextFollowUpDate;
      // Prefer native CallTracker duration (CallLog) when available
      const durationSeconds = nativeDuration != null ? nativeDuration : 0;

      const res = await fetch('/api/call-log', {
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
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to log call');
      }

      // Schedule follow-up/meeting if needed
      if (needsSchedule && nextFollowUpDate) {
        try {
          await leadsService.scheduleFollowUp(lead.id, nextFollowUpDate);
        } catch {
          // ignore — call log already saved
        }
      }

      // Persist lead status update (best-effort, mirrors DB trigger)
      const nextStatus = OUTCOME_TO_STATUS[outcome];
      if (nextStatus) {
        try {
          await leadsService.updateStatus(lead.id, nextStatus);
        } catch {
          // ignore
        }
      }

      // Closed number tagging
      if (outcome === 'Closed Number') {
        try {
          const tags = Array.from(new Set([...(((lead as any).tags as string[] | undefined) || []), 'closed_number']));
          await leadsService.update(lead.id, { tags } as any);
        } catch {
          /* non-fatal */
        }
      }

      // Wrong phone tagging
      if (outcome === 'Wrong Phone') {
        try {
          const tags = Array.from(new Set([...(((lead as any).tags as string[] | undefined) || []), 'wrong_number']));
          await leadsService.update(lead.id, { tags } as any);
        } catch {
          /* non-fatal */
        }
      }

      toast.success(`Logged: ${outcome}`);
      try {
        onSaved?.(lead, outcome);
      } catch {
        /* parent handler errors must not break modal */
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save log');
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-call-title"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-[81] w-full max-w-lg bg-card rounded-2xl shadow-modal flex flex-col overflow-hidden slide-up-enter max-h-[92dvh] sm:max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-border flex-shrink-0 bg-card">
          <div className="min-w-0 flex-1">
            <h2 id="post-call-title" className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <PhoneCall size={15} />
              </span>
              Call Outcome
            </h2>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {lead.name || `Lead ${lead.id}`} {lead.phone ? `· ${lead.phone}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform flex-shrink-0 ml-3"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 overscroll-contain min-h-0 p-5 sm:p-6 space-y-5">
          {nativeDuration != null && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-xs flex items-center gap-2 animate-in fade-in">
              <PhoneCall size={13} />
              <span>
                Native duration captured: <span className="font-bold">{nativeDuration}s</span> — will be saved with this log.
              </span>
            </div>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Select outcome *</p>
            <div className="grid grid-cols-2 gap-2.5">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={`h-[68px] rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all active:scale-[0.98] px-2 ${
                    outcome === o.value ? o.activeCls : `${o.cls} border-border`
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center ${outcome === o.value ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                    {o.icon}
                  </span>
                  <span className="leading-tight text-center">
                    {o.labelEn}
                    <span className="block text-[10px] font-normal opacity-80">{o.labelAr}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {needsSchedule && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
              <p className="text-xs font-bold text-violet-700 flex items-center gap-1.5">
                <CalendarCheck size={13} />
                {outcome === 'Schedule Meeting' ? 'Meeting schedule' : 'Follow-up schedule'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Date</span>
                  <input
                    type="date"
                    value={followUpDate}
                    min={formatToday()}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="input-base h-9 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Time</span>
                  <input
                    type="time"
                    value={followUpTime}
                    onChange={(e) => setFollowUpTime(e.target.value)}
                    className="input-base h-9 text-sm"
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {outcome === 'Schedule Meeting'
                  ? 'This meeting will appear on Calendar & Follow-ups.'
                  : 'A follow-up will be created for this date.'}
              </p>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              Call Notes <span className="font-normal text-muted-foreground text-[11px]">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Quick remarks — e.g. wants 3BR in New Zayed, budget 2M..."
              className="input-base resize-none min-h-[84px] py-2.5 text-sm"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 sm:p-5 border-t border-border bg-card flex-shrink-0">
          <button onClick={onClose} className="btn-secondary h-11 px-5 text-sm font-semibold" type="button">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!outcome || saving}
            className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-[0_6px_20px_-6px_rgba(132,204,22,0.65)] hover:shadow-[0_10px_28px_-6px_rgba(132,204,22,0.8)] hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 min-w-[124px]"
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
                Save Log
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

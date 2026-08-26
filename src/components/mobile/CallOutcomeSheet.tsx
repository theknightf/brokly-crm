'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  Phone,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  UserX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { followUpsService, leadsService } from '@/lib/services/crmService';
import { createClient } from '@/lib/supabase/client';

export interface CallItem {
  id: string;
  contactName: string;
  contactPhone?: string;
  entityType?: 'lead' | 'follow_up';
  /** follow-up id to reschedule when the user picks "call back later" */
  rescheduleId?: string;
  /** project name (e.g. lead.project) — used to load the project pitch */
  projectName?: string;
}

export type CallChannel = 'Call' | 'WhatsApp';

export type Direction = 'outgoing' | 'incoming';

interface CallItemTarget {
  item: CallItem;
  channel: CallChannel;
  direction: Direction;
}

export type CallOutcome =
  | 'Reached'
  | 'Interested'
  | 'Site Visit'
  | 'Meeting'
  | 'Won Deal'
  | 'Not Interested'
  | 'Call back later'
  | 'No Answer'
  | 'Wrong Number'
  | 'Busy'
  | 'Other'
  | 'WhatsApp Sent'
  | 'Customer Replied'
  | 'No Reply'
  | 'WhatsApp Follow-up';

const OUTCOMES: { value: CallOutcome; icon: React.ReactNode; cls: string }[] = [
  {
    value: 'Reached',
    icon: <CheckCircle2 size={14} />,
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  {
    value: 'Interested',
    icon: <ThumbsUp size={14} />,
    cls: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  {
    value: 'Site Visit',
    icon: <CalendarCheck size={14} />,
    cls: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  {
    value: 'Meeting',
    icon: <CalendarClock size={14} />,
    cls: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  {
    value: 'Won Deal',
    icon: <Trophy size={14} />,
    cls: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  },
  {
    value: 'Not Interested',
    icon: <ThumbsDown size={14} />,
    cls: 'border-red-200 bg-red-50 text-red-700',
  },
  {
    value: 'Call back later',
    icon: <CalendarClock size={14} />,
    cls: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  {
    value: 'No Answer',
    icon: <UserX size={14} />,
    cls: 'border-muted bg-muted/50 text-muted-foreground',
  },
  {
    value: 'Wrong Number',
    icon: <Phone size={14} />,
    cls: 'border-muted bg-muted/50 text-muted-foreground',
  },
  {
    value: 'Busy',
    icon: <Clock size={14} />,
    cls: 'border-muted bg-muted/50 text-muted-foreground',
  },
  {
    value: 'Other',
    icon: <MessageCircle size={14} />,
    cls: 'border-muted bg-muted/50 text-muted-foreground',
  },
];

const CALLBACK_DAYS = [1, 2, 3, 5, 7, 14, 30];

/** Outcomes that gate onto the CRM lead pipeline and should move the lead. */
const OUTCOME_TO_STATUS: Partial<Record<CallOutcome, string>> = {
  Interested: 'Interested',
  'Site Visit': 'Meeting',
  'Won Deal': 'Done Deal',
  'Not Interested': 'Not Interested',
  'No Answer': 'No Answer',
  'Wrong Number': 'Wrong Number',
  'Customer Replied': 'Following Up',
};

/** WhatsApp-specific quick outcomes shown when the action is a WhatsApp touch. */
const WHATSAPP_OUTCOMES: { value: CallOutcome; icon: React.ReactNode; cls: string }[] = [
  {
    value: 'WhatsApp Sent',
    icon: <MessageCircle size={14} />,
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  {
    value: 'Customer Replied',
    icon: <ThumbsUp size={14} />,
    cls: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  {
    value: 'No Reply',
    icon: <UserX size={14} />,
    cls: 'border-muted bg-muted/50 text-muted-foreground',
  },
  {
    value: 'WhatsApp Follow-up',
    icon: <CalendarClock size={14} />,
    cls: 'border-amber-200 bg-amber-50 text-amber-700',
  },
];

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

interface ProjectPitch {
  summary: string;
  whyBuy: string;
  sellingPoints: string[];
}

interface CallOutcomeSheetProps {
  item: CallItem;
  channel: CallChannel;
  direction?: Direction;
  onClose: () => void;
  /** Called after the log is saved so parents can refresh their lists. */
  onSaved?: (item: CallItem) => Promise<void> | void;
  /** Timestamp (ms) when the agent tapped the dialer (tel:) link. Used to
   *  estimate real call length via the visibilitychange gap, so managers can
   *  spot suspiciously short "completed" calls. */
  initiatedAt?: number;
}

const SHORT_CALL_SECONDS = 8;

export function CallOutcomeSheet({
  item,
  channel,
  direction: initialDirection,
  onClose,
  onSaved,
  initiatedAt,
}: CallOutcomeSheetProps) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const [callbackDays, setCallbackDays] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [pitch, setPitch] = useState<ProjectPitch | null>(null);
  const [pitchLoading, setPitchLoading] = useState(false);
  const [shortCall, setShortCall] = useState(false);
  const [duplicateToday, setDuplicateToday] = useState(false);
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('12:00');
  const [meetingLocation, setMeetingLocation] = useState('In Company');
  const [meetingNotes, setMeetingNotes] = useState('');
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    setOutcome(null);
    setDirection(initialDirection || 'outgoing');
    setCallbackDays(3);
    setNote('');
    setSaving(false);
    setPitch(null);
    setPitchLoading(false);
    setShortCall(false);
    setDuplicateToday(false);
    setMeetingDate('');
    setMeetingTime('12:00');
    setMeetingLocation('In Company');
    setMeetingNotes('');
    startedAtRef.current = Date.now();

    // PWA call-arrival verification: if we know when the dialer was opened and
    // the gap back to this sheet is under the threshold, flag it softly —
    // the agent may have a legitimate reason (no answer, wrong number) and can
    // note it, but the manager sees an estimated_duration_seconds to spot-check.
    if (initiatedAt) {
      const gapSeconds = Math.round((Date.now() - initiatedAt) / 1000);
      if (gapSeconds < SHORT_CALL_SECONDS) setShortCall(true);
    }

    // Soft duplicate-call warning: already logged a call for this lead today?
    if (item.entityType === 'lead' || !item.entityType) {
      (async () => {
        try {
          const res = await fetch(
            `/api/call-log?entity_type=lead&entity_id=${encodeURIComponent(item.id)}`,
            { cache: 'no-store' }
          );
          const body = await res.json().catch(() => null);
          const calls: any[] = body?.calls || body?.call_logs || [];
          const today = new Date().toDateString();
          if (calls.some((c) => c?.created_at && new Date(c.created_at).toDateString() === today)) {
            setDuplicateToday(true);
          }
        } catch {
          // best-effort
        }
      })();
    }

    // Load the project pitch so the agent can read it while on the call.
    let cancelled = false;
    (async () => {
      if (!item.id) return;
      setPitchLoading(true);
      try {
        const params = new URLSearchParams({
          entity_type: item.entityType || 'lead',
          entity_id: item.id,
        });
        if (item.projectName) params.set('project', item.projectName);
        const res = await fetch(`/api/projects/pitch?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (body?.pitch) setPitch(body.pitch);
      } catch {
        // pitch is best-effort — never block the call flow
      } finally {
        if (!cancelled) setPitchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  const outcomes = channel === 'WhatsApp' ? WHATSAPP_OUTCOMES : OUTCOMES;

  const save = async () => {
    if (!outcome || saving) return;
    setSaving(true);
    try {
      const durationSeconds = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      // Real-world estimate from the dialer tap to now (via visibilitychange).
      const estimatedDurationSeconds = initiatedAt
        ? Math.max(0, Math.round((Date.now() - initiatedAt) / 1000))
        : durationSeconds;
      const clientRef =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const res = await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: item.entityType || 'lead',
          entity_id: item.id,
          contact_name: item.contactName,
          contact_phone: item.contactPhone || '',
          channel,
          direction,
          outcome,
          notes: note.trim() || '',
          duration_seconds: durationSeconds,
          estimated_duration_seconds: estimatedDurationSeconds,
          client_ref: clientRef,
        }),
      });

      // The activity-log backend may not be provisioned yet (call_logs table
      // missing). That must never block the outcome flow — the lead status
      // change below still applies. Other errors (auth, etc.) are real.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status !== 503) throw new Error(body.error || 'Failed to save call log');
      }

      // Reflect the call outcome on the lead's pipeline stage (client-side,
      // so "change status after a call" always works — even offline-ish).
      if (item.entityType === 'lead' || !item.entityType) {
        const nextStatus = OUTCOME_TO_STATUS[outcome];
        if (nextStatus) {
          try {
            await leadsService.updateStatus(item.id, nextStatus);
          } catch {
            // ignore — the follow-up lifecycle below is what really matters
          }
        }
      }

      const scheduleFollowUp = async (newDate: string, label: string) => {
        if (item.rescheduleId) {
          try {
            await followUpsService.update(item.rescheduleId, {
              dueDate: newDate,
              status: 'Pending',
              notes: `${note.trim() ? note.trim() + ' — ' : ''}${label} after ${callbackDays} day(s)`,
            });
            toast.success(`Follow-up rescheduled to ${newDate}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Call logged, but reschedule failed');
          }
        } else if (item.entityType === 'lead' || !item.entityType) {
          // No scheduled follow-up yet — create one for this lead so the
          // callback appears on the Follow-ups page on the chosen date.
          try {
            const supabase = createClient();
            const {
              data: { user: currentUser },
            } = await supabase.auth.getUser();
            const created = await followUpsService.create(
              {
                title: `Follow up: ${item.contactName}`,
                contactName: item.contactName,
                contactPhone: item.contactPhone || '',
                contactType: 'Lead',
                type: 'Call',
                status: 'Pending',
                priority: 'Medium',
                dueDate: newDate,
                dueTime: '09:00',
                agent: '',
                agentInitials: '',
                notes:
                  (note.trim() ? note.trim() + ' — ' : '') +
                  `${label} after ${callbackDays} day(s)`,
                propertyInterest: '',
                relationshipStatus: 'New',
              },
              currentUser?.id || ''
            );
            // Link the fresh follow-up back to the lead so the DB trigger and
            // future edits stay consistent.
            if (created?.id) {
              await supabase
                .from('follow_ups')
                .update({ lead_id: item.id })
                .eq('id', created.id)
                .then(({ error }) => {
                  if (error) throw error;
                });
            }
            toast.success(`Follow-up scheduled for ${newDate}`);
          } catch {
            toast.success('Call logged');
          }
        }
      };

      const scheduleMeeting = async () => {
        const targetDate = meetingDate || futureDate(0);
        const locationNote = `Meeting at ${meetingLocation}${
          item.projectName ? ` — ${item.projectName}` : ''
        }`;
        if (item.entityType === 'lead' || !item.entityType) {
          try {
            const supabase = createClient();
            const {
              data: { user: currentUser },
            } = await supabase.auth.getUser();
            const created = await followUpsService.create(
              {
                title: `Meeting: ${item.contactName}`,
                contactName: item.contactName,
                contactPhone: item.contactPhone || '',
                contactType: 'Lead',
                type: 'Meeting',
                status: 'Pending',
                priority: 'High',
                dueDate: targetDate,
                dueTime: meetingTime || '12:00',
                agent: '',
                agentInitials: '',
                notes: [locationNote, meetingNotes.trim(), note.trim()].filter(Boolean).join(' — '),
                propertyInterest: '',
                relationshipStatus: 'New',
              },
              currentUser?.id || ''
            );
            if (created?.id) {
              await supabase
                .from('follow_ups')
                .update({ lead_id: item.id })
                .eq('id', created.id)
                .then(({ error }) => {
                  if (error) throw error;
                });
            }
            toast.success(`Meeting scheduled for ${targetDate} at ${meetingTime}`);
          } catch {
            toast.success('Call logged');
          }
        } else if (item.rescheduleId) {
          try {
            await followUpsService.update(item.rescheduleId, {
              dueDate: targetDate,
              dueTime: meetingTime,
              type: 'Meeting',
              status: 'Pending',
              notes: [locationNote, meetingNotes.trim(), note.trim()].filter(Boolean).join(' — '),
            });
            toast.success(`Meeting scheduled for ${targetDate} at ${meetingTime}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Call logged, but scheduling failed');
          }
        }
      };

      if (outcome === 'Call back later') {
        scheduleFollowUp(futureDate(callbackDays), 'Call back');
      }

      if (outcome === 'WhatsApp Follow-up') {
        scheduleFollowUp(futureDate(callbackDays), 'WhatsApp follow-up');
      }

      if (outcome === 'Site Visit' || outcome === 'Meeting') {
        await scheduleMeeting();
      }

      toast.success('Call logged');
      if (onSaved) await onSaved(item);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save call log');
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-card rounded-2xl p-5 pb-6 shadow-2xl slide-up-enter max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {channel === 'Call' ? 'How did the call go?' : 'How did the chat go?'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Log the outcome of your {channel === 'Call' ? 'call' : 'WhatsApp'} with{' '}
              {item.contactName}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {channel === 'Call' && (
          <div className="flex items-center gap-2 mb-4 rounded-xl border border-border bg-muted/40 p-1">
            <button
              onClick={() => setDirection('outgoing')}
              className={`flex-1 h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                direction === 'outgoing'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <ArrowUpRight size={14} />
              Outgoing
            </button>
            <button
              onClick={() => setDirection('incoming')}
              className={`flex-1 h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                direction === 'incoming'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <ArrowDownLeft size={14} />
              Incoming
            </button>
          </div>
        )}

        {pitchLoading ? (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Loading project pitch…
          </div>
        ) : pitch && (pitch.summary || pitch.whyBuy || pitch.sellingPoints.length > 0) ? (
          <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1.5 flex items-center gap-1.5">
              <MessageCircle size={13} />
              Project Pitch — say this
            </p>
            {pitch.summary && (
              <p className="text-[13px] leading-snug text-foreground mb-1.5">{pitch.summary}</p>
            )}
            {pitch.whyBuy && (
              <p className="text-[13px] leading-snug text-muted-foreground mb-1.5">
                <span className="font-semibold text-foreground">Why buy: </span>
                {pitch.whyBuy}
              </p>
            )}
            {pitch.sellingPoints.length > 0 && (
              <ul className="mt-1 space-y-1">
                {pitch.sellingPoints.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[13px] text-muted-foreground"
                  >
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-primary" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {outcomes.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`h-11 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                outcome === o.value
                  ? `${o.cls} ring-2 ring-primary/40`
                  : 'border-border text-muted-foreground bg-card'
              }`}
            >
              {o.icon}
              {o.value}
            </button>
          ))}
        </div>

        {(outcome === 'Call back later' || outcome === 'WhatsApp Follow-up') && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <CalendarClock size={13} className="text-amber-600" />
              {outcome === 'WhatsApp Follow-up' ? 'Follow up after' : 'Call back after'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CALLBACK_DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setCallbackDays(d)}
                  className={`px-3 h-9 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${
                    callbackDays === d
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-muted-foreground'
                  }`}
                >
                  {d} day{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {(outcome === 'Site Visit' || outcome === 'Meeting') && (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <CalendarCheck size={13} className="text-primary" />
              Schedule meeting
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={meetingDate || futureDate(0)}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="border border-input bg-background text-foreground rounded-lg px-2.5 h-9 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Time</label>
                <input
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="border border-input bg-background text-foreground rounded-lg px-2.5 h-9 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Location</label>
              <div className="grid grid-cols-3 gap-1.5">
                {['In Company', 'Developer Branch', 'Project Site'].map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setMeetingLocation(loc)}
                    className={`h-9 rounded-lg text-[11px] font-semibold transition-colors active:scale-95 ${
                      meetingLocation === loc
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              placeholder="Meeting notes (optional)"
              className="w-full border border-input bg-background text-foreground rounded-lg px-2.5 h-9 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              This meeting appears on the unified Calendar automatically.
            </p>
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Add a quick note… (optional)"
          className="mt-3 w-full border border-input bg-background text-foreground rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />

        <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
          <button
            onClick={onClose}
            className="h-12 rounded-xl border border-border text-muted-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Skip
          </button>
          <button
            onClick={save}
            disabled={!outcome || saving}
            className="h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold px-6 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {outcome === 'Call back later' || outcome === 'WhatsApp Follow-up'
              ? 'Save & schedule'
              : outcome === 'Site Visit' || outcome === 'Meeting'
                ? 'Save & schedule meeting'
                : 'Save log'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Arms a pending call when the user taps Call/WhatsApp, then shows the
 * outcome sheet automatically when the app regains focus (visibilitychange).
 */
export function useCallOutcome() {
  const pendingRef = useRef<CallItemTarget | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [target, setTarget] = useState<CallItemTarget | null>(null);

  const arm = useCallback(
    (item: CallItem, channel: CallChannel, direction: Direction = 'outgoing') => {
      pendingRef.current = { item, channel, direction };
      // Fallback: on desktop (or when the phone dialer never triggers a
      // visibility event) show the sheet shortly after the tap so the popup
      // reliably appears even if the browser stays in the foreground.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          setTarget(pendingRef.current);
          pendingRef.current = null;
        }
      }, 1500);
    },
    []
  );

  const reveal = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    if (pendingRef.current) {
      setTarget(pendingRef.current);
      pendingRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('visibilitychange', reveal);
    window.addEventListener('pageshow', reveal);
    window.addEventListener('focus', reveal);
    return () => {
      document.removeEventListener('visibilitychange', reveal);
      window.removeEventListener('pageshow', reveal);
      window.removeEventListener('focus', reveal);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reveal]);

  const sheet = target ? (
    <CallOutcomeSheet
      item={target.item}
      channel={target.channel}
      direction={target.direction}
      onClose={() => setTarget(null)}
    />
  ) : null;

  return { arm, sheet };
}

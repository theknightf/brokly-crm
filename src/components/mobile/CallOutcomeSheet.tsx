'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
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
}

export type CallChannel = 'Call' | 'WhatsApp';

export type CallOutcome =
  | 'Reached'
  | 'Interested'
  | 'Site Visit'
  | 'Won Deal'
  | 'Not Interested'
  | 'Call back later'
  | 'No Answer'
  | 'Wrong Number'
  | 'Busy'
  | 'Other';

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

/** Outcomes that map onto a CRM pipeline stage and should move the lead. */
const OUTCOME_TO_STATUS: Partial<Record<CallOutcome, string>> = {
  Interested: 'Interested',
  'Site Visit': 'Meeting',
  'Won Deal': 'Done Deal',
  'Not Interested': 'Not Interested',
  'No Answer': 'No Answer',
  'Wrong Number': 'Wrong Number',
};

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

interface CallOutcomeSheetProps {
  item: CallItem;
  channel: CallChannel;
  onClose: () => void;
  /** Called after the log is saved so parents can refresh their lists. */
  onSaved?: (item: CallItem) => Promise<void> | void;
}

export function CallOutcomeSheet({ item, channel, onClose, onSaved }: CallOutcomeSheetProps) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [callbackDays, setCallbackDays] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOutcome(null);
    setCallbackDays(3);
    setNote('');
    setSaving(false);
  }, [item]);

  const save = async () => {
    if (!outcome || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: item.entityType || 'lead',
          entity_id: item.id,
          contact_name: item.contactName,
          contact_phone: item.contactPhone || '',
          channel,
          direction: 'outgoing',
          outcome,
          notes: note.trim() || '',
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

      if (outcome === 'Call back later') {
        const newDate = futureDate(callbackDays);
        if (item.rescheduleId) {
          try {
            await followUpsService.update(item.rescheduleId, {
              dueDate: newDate,
              status: 'Pending',
              notes: `${note.trim() ? note.trim() + ' — ' : ''}Call back after ${callbackDays} day(s)`,
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
                  `Call back after ${callbackDays} day(s)`,
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

        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
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

        {outcome === 'Call back later' && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <CalendarClock size={13} className="text-amber-600" />
              Call back after
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
            {outcome === 'Call back later' ? 'Save & schedule' : 'Save log'}
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
  const pendingRef = useRef<{ item: CallItem; channel: CallChannel } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [target, setTarget] = useState<{ item: CallItem; channel: CallChannel } | null>(null);

  const arm = useCallback((item: CallItem, channel: CallChannel) => {
    pendingRef.current = { item, channel };
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
  }, []);

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
    <CallOutcomeSheet item={target.item} channel={target.channel} onClose={() => setTarget(null)} />
  ) : null;

  return { arm, sheet };
}

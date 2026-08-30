'use client';
import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Loader2, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { leadsService } from '@/lib/services/crmService';
import type { Lead } from './mockLeads';

const OUTCOMES = [
  'Connected',
  'No Answer',
  'Busy',
  'Callback Later',
  'Interested',
  'Not Interested',
  'WhatsApp Sent',
  'Customer Replied',
  'No Reply',
];

interface LogCallModalProps {
  lead: Lead;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Quick "Log call" for a lead — result, short note, optional next follow-up.
 * Reuses the existing /api/call-log system + follow-up scheduling.
 */
export default function LogCallModal({ lead, onClose, onDone }: LogCallModalProps) {
  const [channel, setChannel] = useState('Call');
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('outgoing');
  const [outcome, setOutcome] = useState('Connected');
  const [durationMin, setDurationMin] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);

  const durationSec = Math.max(0, Math.floor(Number(durationMin || 0) * 60));
  const isShort = durationSec > 0 && durationSec < 30;
  const isLong = durationSec > 45 * 60;
  const needsNotes = durationSec >= 30;

  const handleSave = async () => {
    if (saving) return;
    if (needsNotes && notes.trim().length < 20) {
      toast.error('Calls ≥30s require a summary note (min 20 chars)');
      return;
    }
    if (isShort && outcome !== 'Not Interested') {
      toast.error('Calls <30s are forced to NOT_INTERESTED');
      return;
    }
    setSaving(true);
    try {
      const finalOutcome = isShort ? 'NOT_INTERESTED' : outcome;
      const res = await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'lead',
          entity_id: lead.id,
          contact_name: lead.name || '',
          contact_phone: lead.phone || '',
          channel,
          direction,
          outcome: finalOutcome,
          notes: notes.trim() || '',
          duration_seconds: durationSec,
          is_flagged: isLong,
          followUpDateTime: followUp || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to log the call');
      }
      if (followUp && finalOutcome === 'FOLLOW_UP') {
        await leadsService.scheduleFollowUp(lead.id, followUp).catch(() => {});
      }
      toast.success(isShort ? 'Call logged as NOT_INTERESTED (<30s)' : isLong ? 'Call logged & flagged for review (>45m)' : 'Call logged');
      onDone();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log the call');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Log call" subtitle={lead.name || 'Lead'} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-base">Channel</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="input-base"
            >
              {['Call', 'WhatsApp', 'SMS', 'Email'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">Direction</span>
            <div className="inline-flex p-1 rounded-xl bg-muted self-stretch">
              {(
                [
                  { v: 'incoming', label: 'Incoming', Icon: ArrowDownLeft },
                  { v: 'outgoing', label: 'Outgoing', Icon: ArrowUpRight },
                ] as const
              ).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDirection(v)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-colors ${
                    direction === v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">Call result {isShort && <span className="text-destructive text-[11px]">· &lt;30s → NOT_INTERESTED only</span>}</span>
            <select
              value={isShort ? 'Not Interested' : outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="input-base"
              disabled={isShort}
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o} disabled={isShort && o !== 'Not Interested'}>
                  {o}
                </option>
              ))}
            </select>
            {isShort && <span className="text-xs text-destructive">Calls &lt;30s auto-forced to NOT_INTERESTED and excluded from KPI</span>}
            {isLong && <span className="text-xs text-amber-600">Calls &gt;45m will be flagged for supervisor review</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">
              <PhoneCall size={12} className="inline mr-1 text-muted-foreground" />
              Duration (minutes)
            </span>
            <input
              type="number"
              min={0}
              className="input-base"
              placeholder="e.g. 5"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="label-base">Short note</span>
          <textarea
            className="input-base min-h-20 resize-none"
            placeholder="What was discussed?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label-base">
            <CalendarClock size={12} className="inline mr-1 text-muted-foreground" />
            Next follow-up (optional)
          </span>
          <input
            type="date"
            className="input-base"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save call
          </button>
        </div>
      </div>
    </Modal>
  );
}

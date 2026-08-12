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

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
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
          outcome,
          notes: notes.trim() || '',
          duration_seconds: Math.max(0, Math.floor(Number(durationMin || 0) * 60)),
        }),
      });
      if (!res.ok) throw new Error('Failed to log the call');
      if (followUp) {
        await leadsService.scheduleFollowUp(lead.id, followUp).catch(() => {});
      }
      toast.success('Call logged');
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
            <span className="label-base">Call result</span>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="input-base"
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
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

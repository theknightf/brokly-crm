'use client';
import React, { useState } from 'react';
import {
  ArrowDownLeft,
  MessageCircle,
  Phone,
  StickyNote,
  CheckCircle2,
  ThumbsUp,
  UserX,
  CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { leadCommentsService } from '@/lib/services/crmService';
import { QuickNoteSheet } from './QuickNoteSheet';
import { useCallOutcome, CallChannel, CallOutcomeSheet, Direction, CallItem } from './CallOutcomeSheet';

interface LeadQuickActionsProps {
  lead: { id: string; name: string; phone?: string };
}

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
}

const WA_QUICK: { label: string; icon: React.ReactNode; outcome: string; cls: string }[] = [
  {
    label: 'WA Sent',
    icon: <CheckCircle2 size={13} />,
    outcome: 'WhatsApp Sent',
    cls: 'bg-emerald-50 text-emerald-700 active:bg-emerald-100',
  },
  {
    label: 'Customer Replied',
    icon: <ThumbsUp size={13} />,
    outcome: 'Customer Replied',
    cls: 'bg-sky-50 text-sky-700 active:bg-sky-100',
  },
  {
    label: 'No Reply',
    icon: <UserX size={13} />,
    outcome: 'No Reply',
    cls: 'bg-muted text-muted-foreground active:bg-muted/80',
  },
  {
    label: 'WA Follow-up',
    icon: <CalendarClock size={13} />,
    outcome: 'WhatsApp Follow-up',
    cls: 'bg-amber-50 text-amber-700 active:bg-amber-100',
  },
];

// Mobile-only large tap targets shown on every lead card, stacked vertically so
// a single thumb can reach every action without re-gripping the phone.
export function LeadQuickActions({ lead }: LeadQuickActionsProps) {
  const { user } = useAuth();
  const [showNote, setShowNote] = useState(false);
  const [incoming, setIncoming] = useState<{ item: CallItem; direction: Direction } | null>(null);
  const { arm, sheet } = useCallOutcome();

  const handleNote = async (body: string) => {
    await leadCommentsService.create(lead.id, `[Mobile] ${body}`, user?.id || '');
  };

  const armCall = (channel: CallChannel) => {
    arm(
      { id: lead.id, contactName: lead.name, contactPhone: lead.phone, entityType: 'lead' },
      channel
    );
  };

  const handleWaQuick = async (outcome: string) => {
    try {
      await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'lead',
          entity_id: lead.id,
          contact_name: lead.name,
          contact_phone: lead.phone || '',
          channel: 'WhatsApp',
          direction: 'outgoing',
          outcome,
        }),
      });
      toast.success(outcome);
    } catch {
      toast.error('Could not log action');
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        {lead.phone ? (
          <>
            <a
              href={`tel:${lead.phone}`}
              onClick={() => armCall('Call')}
              className="h-11 rounded-xl bg-primary/10 text-primary flex items-center gap-2.5 px-3 active:scale-[0.98] transition-transform"
              aria-label="Call"
            >
              <Phone size={16} className="flex-shrink-0" />
              <span className="text-xs font-semibold">Call</span>
              <span className="text-xs text-primary/60 truncate ml-auto" dir="ltr">
                {lead.phone}
              </span>
            </a>
            <a
              href={waLink(lead.phone)}
              target="_blank"
              rel="noreferrer"
              onClick={() => armCall('WhatsApp')}
              className="h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center gap-2.5 px-3 active:scale-[0.98] transition-transform"
            >
              <MessageCircle size={18} className="flex-shrink-0" />
              <span className="text-xs font-semibold">WhatsApp</span>
              <span className="text-xs font-mono ml-auto" dir="ltr">
                {lead.phone}
              </span>
            </a>

            {/* WhatsApp outcome quick pills — one per row, compact tap targets */}
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-emerald-100 ml-1">
              {WA_QUICK.map((a) => (
                <button
                  key={a.outcome}
                  onClick={() => handleWaQuick(a.outcome)}
                  className={`h-9 rounded-lg px-3 flex items-center gap-2 text-xs font-semibold transition-all active:scale-[0.98] ${a.cls}`}
                  aria-label={a.label}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            disabled
            className="h-11 rounded-xl bg-muted text-muted-foreground/50 flex items-center gap-2.5 px-3"
            aria-label="No phone"
          >
            <Phone size={18} className="flex-shrink-0" />
            <span className="text-xs font-semibold">Call</span>
          </button>
        )}

        <button
          onClick={() =>
            setIncoming({
              item: { id: lead.id, contactName: lead.name, contactPhone: lead.phone, entityType: 'lead' },
              direction: 'incoming',
            })
          }
          className="h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center gap-2.5 px-3 active:scale-[0.98] transition-transform"
          aria-label="Log incoming call"
        >
          <ArrowDownLeft size={18} className="flex-shrink-0" />
          <span className="text-xs font-semibold">Incoming call</span>
          {lead.phone && (
            <span className="text-xs font-mono ml-auto" dir="ltr">
              {lead.phone}
            </span>
          )}
        </button>

        <button
          onClick={() => setShowNote(true)}
          className="h-11 rounded-xl bg-secondary text-secondary-foreground flex items-center gap-2.5 px-3 active:scale-[0.98] transition-transform"
          aria-label="Add note"
        >
          <StickyNote size={18} className="flex-shrink-0" />
          <span className="text-xs font-semibold">Add note</span>
        </button>
      </div>

      <QuickNoteSheet
        open={showNote}
        title={`Note — ${lead.name}`}
        onClose={() => setShowNote(false)}
        onSave={handleNote}
      />
      {incoming && (
        <CallOutcomeSheet
          item={incoming.item}
          channel="Call"
          direction={incoming.direction}
          onClose={() => setIncoming(null)}
        />
      )}
      {sheet}
    </>
  );
}
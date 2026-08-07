'use client';
import React, { useState } from 'react';
import { MessageCircle, Phone, StickyNote } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { leadCommentsService } from '@/lib/services/crmService';
import { QuickNoteSheet } from './QuickNoteSheet';
import { useCallOutcome, CallChannel } from './CallOutcomeSheet';

interface LeadQuickActionsProps {
  lead: { id: string; name: string; phone?: string };
}

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
}

// Mobile-only large tap targets shown on every lead card.
export function LeadQuickActions({ lead }: LeadQuickActionsProps) {
  const { user } = useAuth();
  const [showNote, setShowNote] = useState(false);
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

  return (
    <>
      <div className="grid grid-cols-3 gap-2 w-full">
        {lead.phone ? (
          <>
            <a
              href={`tel:${lead.phone}`}
              onClick={() => armCall('Call')}
              className="h-12 rounded-xl bg-primary/10 text-primary flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
              aria-label="Call"
            >
              <Phone size={18} />
              <span className="text-[10px] font-semibold">Call</span>
            </a>
            <a
              href={waLink(lead.phone)}
              target="_blank"
              rel="noreferrer"
              onClick={() => armCall('WhatsApp')}
              className="h-12 rounded-xl bg-emerald-50 text-emerald-600 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
              aria-label="WhatsApp"
            >
              <MessageCircle size={18} />
              <span className="text-[10px] font-semibold">WhatsApp</span>
            </a>
          </>
        ) : (
          <button
            disabled
            className="h-12 rounded-xl bg-muted text-muted-foreground/50 flex flex-col items-center justify-center gap-0.5"
            aria-label="No phone"
          >
            <Phone size={18} />
            <span className="text-[10px] font-semibold">Call</span>
          </button>
        )}
        <button
          onClick={() => setShowNote(true)}
          className="h-12 rounded-xl bg-secondary text-secondary-foreground flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
          aria-label="Add note"
        >
          <StickyNote size={18} />
          <span className="text-[10px] font-semibold">Note</span>
        </button>
      </div>
      <QuickNoteSheet
        open={showNote}
        title={`Note — ${lead.name}`}
        onClose={() => setShowNote(false)}
        onSave={handleNote}
      />
      {sheet}
    </>
  );
}

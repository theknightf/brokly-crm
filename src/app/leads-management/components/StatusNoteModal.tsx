'use client';
import React, { useEffect, useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import Modal from '@/components/ui/Modal';

/**
 * Sales users cannot change a lead's stage without a written note. This asks for it first; the note is saved as a
 * lead comment (so it counts as an action) and only then is the stage changed.
 */
export default function StatusNoteModal({
  open,
  leadLabel,
  status,
  count = 1,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadLabel: string;
  status: string;
  count?: number;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  const note = text.trim();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Write a note first"
      subtitle={count > 1 ? `${count} leads → ${status}` : `${leadLabel} → ${status}`}
      size="sm"
    >
      <div className="space-y-3 p-5">
        <p className="text-sm text-muted-foreground">
          The stage changes only after you write what happened{count > 1 ? '. The same note is added to every selected lead' : ''}.
        </p>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && note) onConfirm(note);
          }}
          rows={4}
          maxLength={1000}
          placeholder="What happened? e.g. spoke with the client, wants 3BR in New Zayed…"
          className="input-base w-full resize-none text-sm"
          aria-label="Note"
          dir="auto"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Ctrl + Enter to confirm</span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={!note}
              onClick={() => onConfirm(note)}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <StickyNote size={14} /> Save note & change stage
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

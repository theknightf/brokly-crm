'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface QuickNoteSheetProps {
  open: boolean;
  title: string;
  placeholder?: string;
  initialNote?: string;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}

// Mobile-only bottom sheet to quickly log a note (auto-save on keyboard done).
export function QuickNoteSheet({
  open,
  title,
  placeholder = 'Write a quick note…',
  initialNote = '',
  onClose,
  onSave,
}: QuickNoteSheetProps) {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setNote(initialNote);
      const t = window.setTimeout(() => textareaRef.current?.focus(), 250);
      return () => window.clearTimeout(t);
    }
  }, [open, initialNote]);

  const handleSave = async () => {
    if (!note.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(note.trim());
      toast.success('Note saved');
      onClose();
    } catch {
      toast.error('Could not save note');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl p-4 pb-safe shadow-2xl slide-up-enter">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
          }}
          rows={3}
          placeholder={placeholder}
          className="w-full border border-input bg-background text-foreground rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <button
          onClick={handleSave}
          disabled={!note.trim() || saving}
          className="mt-3 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Save note
        </button>
      </div>
    </div>
  );
}

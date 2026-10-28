'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  NOTE_EDIT_WINDOW_MS,
  NOTE_MAX,
  type CallItem,
  type NoteItem,
} from '@/lib/leadWorkShared';
import {
  CallLinkSelect,
  EmptyState,
  ErrorState,
  SkeletonRows,
  api,
  fmtDateTime,
} from './shared';

interface Props {
  notes: NoteItem[];
  setNotes: React.Dispatch<React.SetStateAction<NoteItem[]>>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  calls: CallItem[];
  /** Call chosen with the "Add note" row action. */
  linkedCallId: string;
  onLinkChange: (callId: string) => void;
  meId: string;
  isAdmin: boolean;
  /** Called after a note is saved so the parent can refresh counts. */
  onChanged?: () => void;
}

/** Author within 15 minutes, or an admin at any time (the API and RLS enforce it too). */
const canChange = (n: NoteItem, meId: string, isAdmin: boolean) =>
  isAdmin || (n.authorId === meId && Date.now() - new Date(n.createdAt).getTime() <= NOTE_EDIT_WINDOW_MS);

export default function NotesTab(p: Props) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Re-evaluate the 15-minute window while the tab is open.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const linkedCall = p.calls.find((c) => c.id === p.linkedCallId) || null;
  const remaining = NOTE_MAX - body.length;

  const save = async () => {
    if (savingRef.current) return;
    const text = body.trim();
    if (!text) return toast.error('Write something first');
    if (!linkedCall?.leadId) return toast.error('Choose the call this note is about');

    savingRef.current = true;
    setSaving(true);
    const tempId = `tmp-${Date.now()}`;
    const temp: NoteItem = {
      id: tempId,
      leadId: linkedCall.leadId,
      leadName: linkedCall.leadName,
      callId: linkedCall.id,
      authorId: p.meId,
      authorName: 'You',
      body: text,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      edited: false,
    };
    p.setNotes((prev) => [temp, ...prev]);
    const previousBody = body;
    setBody('');
    try {
      const j = await api<{ note: NoteItem }>(`/api/leads/${linkedCall.leadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: text, callId: linkedCall.id }),
      });
      p.setNotes((prev) => prev.map((n) => (n.id === tempId ? j.note : n)));
      toast.success('Note saved');
      p.onChanged?.();
    } catch (e: any) {
      p.setNotes((prev) => prev.filter((n) => n.id !== tempId));
      setBody(previousBody);
      toast.error(e?.message || 'Could not save the note');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveEdit = async (note: NoteItem) => {
    const text = editBody.trim();
    if (!text) return toast.error('Write something first');
    if (text === note.body) return setEditingId(null);
    if (busyId) return;
    setBusyId(note.id);
    const before = note;
    p.setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, body: text, edited: true, updatedAt: new Date().toISOString() } : n))
    );
    setEditingId(null);
    try {
      const j = await api<{ note: NoteItem }>(`/api/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: text }),
      });
      p.setNotes((prev) => prev.map((n) => (n.id === note.id ? j.note : n)));
      toast.success('Note updated');
    } catch (e: any) {
      p.setNotes((prev) => prev.map((n) => (n.id === note.id ? before : n)));
      toast.error(e?.message || 'Could not update the note');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (note: NoteItem) => {
    if (busyId) return;
    setBusyId(note.id);
    setConfirmDeleteId(null);
    const index = p.notes.findIndex((n) => n.id === note.id);
    p.setNotes((prev) => prev.filter((n) => n.id !== note.id));
    try {
      await api(`/api/notes/${note.id}`, { method: 'DELETE' });
      toast.success('Note deleted');
      p.onChanged?.();
    } catch (e: any) {
      p.setNotes((prev) => {
        const next = prev.slice();
        next.splice(Math.min(index, next.length), 0, note);
        return next;
      });
      toast.error(e?.message || 'Could not delete the note');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div>
          <label htmlFor="note-link" className="mb-1 block text-xs font-semibold text-muted-foreground">
            Link to a call
          </label>
          <CallLinkSelect id="note-link" calls={p.calls} value={p.linkedCallId} onChange={p.onLinkChange} />
        </div>
        <div>
          <label htmlFor="note-body" className="mb-1 block text-xs font-semibold text-muted-foreground">
            Note
          </label>
          <textarea
            id="note-body"
            rows={3}
            maxLength={NOTE_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
            placeholder="What happened on this call?"
            className="input-base resize-none text-base sm:text-sm"
          />
          <div className="mt-1 flex items-center justify-between">
            <span
              className={`text-xs tabular-nums ${remaining < 40 ? 'text-amber-600' : 'text-muted-foreground'}`}
              aria-live="polite"
            >
              {body.length}/{NOTE_MAX}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !body.trim()}
              className="btn-primary inline-flex min-h-[44px] items-center gap-2 px-5 text-sm disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save note
            </button>
          </div>
        </div>
      </section>

      {p.loading ? (
        <SkeletonRows rows={3} />
      ) : p.error ? (
        <ErrorState message={p.error} onRetry={p.onRetry} />
      ) : p.notes.length === 0 ? (
        <EmptyState text="No notes yet" />
      ) : (
        <ol className="space-y-3">
          {p.notes.map((n) => {
            const call = n.callId ? p.calls.find((c) => c.id === n.callId) : null;
            const mine = canChange(n, p.meId, p.isAdmin) && !n.id.startsWith('tmp-');
            const editing = editingId === n.id;
            return (
              <li
                key={n.id}
                className={`rounded-xl border border-border bg-card p-3 ${n.id.startsWith('tmp-') ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{n.authorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(n.createdAt)}
                      {n.edited && <span className="ms-2 italic">edited</span>}
                    </p>
                    {(n.leadName || call) && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {n.leadName || 'Lead'}
                        {call ? ` · call ${fmtDateTime(call.createdAt)}` : n.callId ? ' · linked call' : ''}
                      </p>
                    )}
                  </div>
                  {mine && !editing && (
                    <div className="flex flex-shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="Edit note"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditBody(n.body);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => setConfirmDeleteId(n.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={3}
                      maxLength={NOTE_MAX}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="input-base resize-none text-base sm:text-sm"
                      aria-label="Edit note"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {editBody.length}/{NOTE_MAX}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="btn-ghost inline-flex min-h-[40px] items-center gap-1 px-3 text-sm"
                        >
                          <X size={14} /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(n)}
                          disabled={!!busyId}
                          className="btn-primary inline-flex min-h-[40px] items-center gap-1 px-4 text-sm"
                        >
                          <Check size={14} /> Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{n.body}</p>
                )}

                {confirmDeleteId === n.id && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-red-500/10 p-2 text-sm">
                    <span className="text-red-600 dark:text-red-400">Delete this note?</span>
                    <span className="flex gap-2">
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="btn-ghost min-h-[36px] px-3 text-xs">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(n)}
                        className="min-h-[36px] rounded-lg bg-red-500 px-3 text-xs font-semibold text-white"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

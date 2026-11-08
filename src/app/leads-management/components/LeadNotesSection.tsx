'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, MessageSquare, PhoneCall, Pin, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { leadCommentsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { parseLeadNotes } from '@/lib/leadNotes';

/**
 * One place for everything written about a lead.
 * Comments (lead_comments), the notes typed while logging a call (call_logs.notes) and the note kept on the
 * lead record itself (leads.notes) are shown as ONE feed, newest first, with one box to add to it.
 * Adding a note always writes a comment: that is the entry that is attributed, timestamped and counted as an action.
 */

type Kind = 'note' | 'call' | 'record';
interface Entry {
  key: string;
  kind: Kind;
  at: string; // ISO
  author: string;
  body: string;
  commentId?: string;
  userId?: string;
  meta?: { direction?: string; outcome?: string; seconds?: number };
}

interface Props {
  leadId: string;
  /** The free-text note stored on the lead record (leads.notes), if any. */
  leadNotes?: string;
}

const AUTO_SYNC_TEXT = 'Auto-synced from phone call log';
// Calls logged from the app also write a comment "[Call • outcome • 12s] text"; we show the call entry, not both.
const CALL_COMMENT_RE = /^\[(Call|WhatsApp)\s*•/i;

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function initials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

export default function LeadNotesSection({ leadId, leadNotes }: Props) {
  const { user, profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);
  const [comments, setComments] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [openRecord, setOpenRecord] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, callsRes] = await Promise.all([
        leadCommentsService.getByLead(leadId).catch(() => []),
        fetch(`/api/call-log?entity_type=lead&entity_id=${encodeURIComponent(leadId)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setComments((c as any[]) || []);
      setCalls(callsRes?.calls || callsRes?.call_logs || []);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const callNotes: Entry[] = [];

    for (const c of calls) {
      const n = String(c.notes || '').trim();
      if (!n || n === AUTO_SYNC_TEXT) continue; // calls without a written note stay in Call History only
      callNotes.push({
        key: `call-${c.id}`,
        kind: 'call',
        at: c.created_at,
        author: c.agent_name || 'Agent',
        body: n,
        meta: { direction: c.direction, outcome: c.outcome, seconds: c.duration_seconds },
      });
    }

    const callTexts = callNotes.map((e) => e.body.toLowerCase());
    for (const c of comments) {
      const body = String(c.body || '');
      // Skip the automatic copy of a call note (same text as a call entry, or the "[Call • …]" wrapper).
      const duplicateOfCall = CALL_COMMENT_RE.test(body) && callTexts.some((t) => body.toLowerCase().includes(t));
      if (duplicateOfCall) continue;
      out.push({
        key: `c-${c.id}`,
        kind: 'note',
        at: c.createdAt,
        author: c.authorName || 'Team member',
        body,
        commentId: c.id,
        userId: c.userId,
      });
    }

    out.push(...callNotes);

    // The note on the lead record: only when it adds something the feed does not already say.
    // Only what a person wrote on the record: the machine call lines are already shown as call entries.
    const rec = parseLeadNotes(leadNotes).humanText.trim();
    if (rec) {
      const feed = out.map((e) => e.body.toLowerCase()).join('\n');
      if (!feed.includes(rec.toLowerCase())) {
        out.push({ key: 'record', kind: 'record', at: '', author: 'Lead record', body: rec });
      }
    }

    return out.sort((a, b) => {
      if (a.kind === 'record') return -1; // pinned on top
      if (b.kind === 'record') return 1;
      return a.at < b.at ? 1 : -1;
    });
  }, [comments, calls, leadNotes]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      note: entries.filter((e) => e.kind === 'note').length,
      call: entries.filter((e) => e.kind === 'call').length,
      record: entries.filter((e) => e.kind === 'record').length,
    }),
    [entries]
  );
  const shown = entries.filter((e) => filter === 'all' || e.kind === filter || (filter === 'note' && e.kind === 'record'));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !user?.id || submitting) return;
    setSubmitting(true);
    try {
      const created: any = await leadCommentsService.create(leadId, body, user.id);
      setComments((prev) => [...prev, created]);
      setText('');
      toast.success('Note added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add the note');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await leadCommentsService.delete(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      toast.success('Note deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete the note');
    }
  };

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
    }`;

  return (
    <section aria-label="Notes" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        <span className="text-xs text-muted-foreground">({counts.all})</span>
        <div className="ms-auto flex gap-1.5" role="group" aria-label="Filter notes">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={chip(filter === 'all')}>
            All
          </button>
          <button type="button" aria-pressed={filter === 'note'} onClick={() => setFilter('note')} className={chip(filter === 'note')}>
            Notes {counts.note + counts.record}
          </button>
          <button type="button" aria-pressed={filter === 'call'} onClick={() => setFilter('call')} className={chip(filter === 'call')}>
            Calls {counts.call}
          </button>
        </div>
      </div>

      {/* One box to add to the feed */}
      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit();
          }}
          rows={2}
          placeholder="Add a note about this lead…"
          aria-label="New note"
          disabled={submitting}
          className="input-base w-full resize-y text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Ctrl + Enter to save</span>
          <button type="submit" disabled={submitting || !text.trim()} className="btn-primary flex items-center gap-1.5 !py-1.5 text-xs">
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Add note
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
          {entries.length === 0 ? 'No notes yet. Add the first one above.' : 'Nothing in this filter.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((e) => {
            const canDelete = e.kind === 'note' && (isAdmin || e.userId === user?.id);
            const long = e.body.length > 240 || e.body.split('\n').length > 4;
            const expanded = e.kind === 'record' ? openRecord : true;
            return (
              <li key={e.key} className={`rounded-xl px-3 py-2.5 ${e.kind === 'record' ? 'border border-dashed border-border bg-card' : 'bg-muted/40'}`}>
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      e.kind === 'call' ? 'bg-sky-500/15 text-sky-600' : e.kind === 'record' ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {e.kind === 'call' ? <PhoneCall size={12} /> : e.kind === 'record' ? <Pin size={12} /> : initials(e.author)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs font-semibold text-foreground">{e.author}</span>
                      {e.kind === 'call' && (
                        <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                          {e.meta?.direction === 'incoming' ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                          Call{e.meta?.outcome ? ` · ${e.meta.outcome}` : ''}
                          {e.meta?.seconds ? ` · ${e.meta.seconds}s` : ''}
                        </span>
                      )}
                      {e.kind === 'record' && <span className="text-[10px] text-muted-foreground">pinned · from the lead record</span>}
                      {e.at && <span className="text-[10px] text-muted-foreground">{fmt(e.at)}</span>}
                    </div>
                    <p
                      className={`mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground ${e.kind === 'record' && !expanded ? 'line-clamp-3' : ''}`}
                      dir="auto"
                    >
                      {e.body}
                    </p>
                    {e.kind === 'record' && long && (
                      <button type="button" onClick={() => setOpenRecord((v) => !v)} className="mt-0.5 text-xs font-semibold text-primary hover:underline">
                        {openRecord ? 'Show less' : 'Show all'}
                      </button>
                    )}
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(e.commentId!)}
                      className="btn-ghost shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      title="Delete note"
                      aria-label="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

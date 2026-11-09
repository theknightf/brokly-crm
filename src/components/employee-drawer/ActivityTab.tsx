'use client';
import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, PhoneCall, StickyNote } from 'lucide-react';
import { formatDuration, type CallItem, type NoteItem } from '@/lib/leadWorkShared';
import { EmptyState, ErrorState, ResultPill, SkeletonRows, fmtDateTime } from './shared';

/**
 * Calls and the notes written about them, in ONE timeline (newest first).
 * A note typed while logging a call is shown inside that call's card; every other note is its own entry.
 * "Actions" in the reports are exactly the written notes, so the count here matches the leaderboard.
 */

type Entry =
  | { key: string; at: string; kind: 'call'; call: CallItem; notes: NoteItem[] }
  | { key: string; at: string; kind: 'note'; note: NoteItem };

const MATCH_WINDOW_MS = 15 * 60 * 1000;

interface Props {
  calls: CallItem[];
  notes: NoteItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function ActivityTab({ calls, notes, loading, error, onRetry }: Props) {
  const [filter, setFilter] = useState<'all' | 'calls' | 'notes'>('all');

  const entries = useMemo<Entry[]>(() => {
    const byCall = new Map<string, NoteItem[]>();
    const loose: NoteItem[] = [];

    for (const n of notes) {
      // 1) explicitly linked to a call
      let target = n.callId ? calls.find((c) => c.id === n.callId) : undefined;
      // 2) typed in the call dialog: same customer, written within minutes of the call
      if (!target && n.leadId) {
        const t = new Date(n.createdAt).getTime();
        let best: { c: CallItem; d: number } | null = null;
        for (const c of calls) {
          if (c.leadId !== n.leadId) continue;
          const d = Math.abs(new Date(c.createdAt).getTime() - t);
          if (d <= MATCH_WINDOW_MS && (!best || d < best.d)) best = { c, d };
        }
        if (best && (n.kind === 'comment' ? !!n.callOutcome : true)) target = best.c;
      }
      if (target) byCall.set(target.id, [...(byCall.get(target.id) || []), n]);
      else loose.push(n);
    }

    const out: Entry[] = [
      ...calls.map((c) => ({ key: `c-${c.id}`, at: c.createdAt, kind: 'call' as const, call: c, notes: byCall.get(c.id) || [] })),
      ...loose.map((n) => ({ key: `n-${n.id}`, at: n.createdAt, kind: 'note' as const, note: n })),
    ];
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [calls, notes]);

  const shown = entries.filter((e) => filter === 'all' || (filter === 'calls' ? e.kind === 'call' : e.kind === 'note' || e.notes.length > 0));
  const written = notes.length;

  if (loading && entries.length === 0) return <SkeletonRows rows={4} />;
  if (error && entries.length === 0) return <ErrorState message={error} onRetry={onRetry} />;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter activity">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={chip(filter === 'all')}>
          All {entries.length}
        </button>
        <button type="button" aria-pressed={filter === 'calls'} onClick={() => setFilter('calls')} className={chip(filter === 'calls')}>
          Calls {calls.length}
        </button>
        <button type="button" aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')} className={chip(filter === 'notes')}>
          Notes (actions) {written}
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState text="No activity in this range" />
      ) : (
        <ol className="space-y-3">
          {shown.map((e) =>
            e.kind === 'call' ? (
              <li key={e.key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600">
                    {e.call.direction === 'incoming' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PhoneCall size={12} className="text-muted-foreground" aria-hidden />
                      {e.call.leadId ? (
                        <a href={`/leads-management?lead=${e.call.leadId}`} className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline">
                          {e.call.leadName || e.call.phone || 'Lead'}
                        </a>
                      ) : (
                        <span className="truncate text-sm font-semibold text-foreground">{e.call.leadName || e.call.phone || 'Unknown'}</span>
                      )}
                      <ResultPill result={e.call.result} />
                      <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(e.call.durationSeconds)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(e.call.createdAt)}</p>

                    {e.notes.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {e.notes
                          .slice()
                          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
                          .map((n) => (
                            <li key={n.id} className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <StickyNote size={11} aria-hidden /> Note · {fmtDateTime(n.createdAt)}
                                {n.callOutcome ? ` · ${n.callOutcome}` : ''}
                                {n.leadStatus ? ` · ${n.leadStatus}` : ''}
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground" dir="auto">
                                {n.body}
                              </p>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11px] italic text-muted-foreground">No note written for this call</p>
                    )}
                  </div>
                </div>
              </li>
            ) : (
              <li key={e.key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <StickyNote size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.note.leadId ? (
                        <a href={`/leads-management?lead=${e.note.leadId}`} className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline">
                          {e.note.leadName || 'Lead'}
                        </a>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{e.note.leadName || 'Note'}</span>
                      )}
                      {e.note.leadStatus && (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{e.note.leadStatus}</span>
                      )}
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Note</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(e.note.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground" dir="auto">
                      {e.note.body}
                    </p>
                  </div>
                </div>
              </li>
            )
          )}
        </ol>
      )}
    </div>
  );
}

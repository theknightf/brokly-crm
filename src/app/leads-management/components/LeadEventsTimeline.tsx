'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, CalendarClock, Flag, Loader2, MessageSquare, Plus, RefreshCw, UserCheck } from 'lucide-react';

/**
 * Read-only history of a lead (lead_events), newest first. Loaded when shown, 20 at a time ("Load more").
 * Every row: who did it, what changed (from → to), date and time in Cairo.
 */

interface LeadEvent {
  id: string;
  type: 'created' | 'assigned' | 'stage' | 'priority' | 'next_action' | 'note';
  at: string;
  actor: string;
  from: string | null;
  to: string | null;
  refId: string | null;
}

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const dateOnly = (v: string | null) => {
  if (!v) return '—';
  try {
    return new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return v;
  }
};

const META: Record<LeadEvent['type'], { icon: React.ReactNode; tone: string }> = {
  created: { icon: <Plus size={14} />, tone: 'bg-lime-500/15 text-lime-600 dark:text-lime-400' },
  assigned: { icon: <UserCheck size={14} />, tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  stage: { icon: <ArrowLeftRight size={14} />, tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  priority: { icon: <Flag size={14} />, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  next_action: { icon: <CalendarClock size={14} />, tone: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  note: { icon: <MessageSquare size={14} />, tone: 'bg-primary/10 text-primary' },
};

function describe(e: LeadEvent): React.ReactNode {
  const chip = (v: string | null) => (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground" dir="auto">
      {v || '—'}
    </span>
  );
  switch (e.type) {
    case 'created':
      return <>Lead created</>;
    case 'assigned':
      return e.from ? (
        <>Reassigned {chip(e.from)} → {chip(e.to)}</>
      ) : (
        <>Assigned to {chip(e.to)}</>
      );
    case 'stage':
      return <>Stage {chip(e.from)} → {chip(e.to)}</>;
    case 'priority':
      return <>Priority {chip(e.from)} → {chip(e.to)}</>;
    case 'next_action':
      if (!e.to) return <>Next action date cleared (was {dateOnly(e.from)})</>;
      return e.from ? (
        <>Next action date {chip(dateOnly(e.from))} → {chip(dateOnly(e.to))}</>
      ) : (
        <>Next action date set to {chip(dateOnly(e.to))}</>
      );
    case 'note':
      return <>Note added</>;
    default:
      return null;
  }
}

export default function LeadEventsTimeline({ leadId, onOpenNote }: { leadId: string; onOpenNote?: (noteId: string) => void }) {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (before?: string) => {
      const qs = new URLSearchParams({ limit: '20' });
      if (before) qs.set('before', before);
      const res = await fetch(`/api/leads/${leadId}/events?${qs}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Could not load the activity');
      return j as { events: LeadEvent[]; nextBefore: string | null };
    },
    [leadId]
  );

  const first = useCallback(() => {
    setLoading(true);
    setError('');
    load()
      .then((j) => {
        setEvents(j.events || []);
        setNextBefore(j.nextBefore);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    first();
  }, [first]);

  const more = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const j = await load(nextBefore);
      setEvents((prev) => [...prev, ...(j.events || [])]);
      setNextBefore(j.nextBefore);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-primary" aria-label="Loading activity" />
      </div>
    );
  }
  if (error && events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button type="button" onClick={first} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</p>;
  }

  return (
    <div>
      <ol className="relative space-y-3 ps-1">
        {events.map((e, i) => {
          const m = META[e.type];
          return (
            <li key={e.id} className="relative flex gap-3">
              {/* the line joining the dots */}
              {i < events.length - 1 && <span className="absolute start-[15px] top-8 bottom-[-12px] w-px bg-border" aria-hidden />}
              <span className={`relative z-[1] mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.tone}`} aria-hidden>
                {m.icon}
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2">
                <p className="flex flex-wrap items-center gap-1 text-sm text-foreground">{describe(e)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground/80" dir="auto">
                    {e.actor}
                  </span>
                  <time dateTime={e.at} className="tabular-nums">
                    {fmt(e.at)}
                  </time>
                  {e.type === 'note' && e.refId && onOpenNote && (
                    <button type="button" onClick={() => onOpenNote(e.refId!)} className="font-semibold text-primary hover:underline">
                      View note
                    </button>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {nextBefore && (
        <button
          type="button"
          onClick={more}
          disabled={loadingMore}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          {loadingMore && <Loader2 size={14} className="animate-spin" />} Load more
        </button>
      )}
    </div>
  );
}

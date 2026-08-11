'use client';
import React, { useState, useEffect } from 'react';
import { History, Loader2 } from 'lucide-react';

interface TimelineEvent {
  id: string;
  actionType: string;
  detail: string;
  createdAt: string;
}

interface LeadTimelineProps {
  leadId: string;
}

const ACTION_COLORS: Record<string, string> = {
  'Lead Added': 'bg-emerald-100 text-emerald-700',
  'Lead Updated': 'bg-sky-100 text-sky-700',
  'Lead Assigned': 'bg-violet-100 text-violet-700',
  'Lead Reserved': 'bg-amber-100 text-amber-700',
  'Done Deal': 'bg-emerald-100 text-emerald-700',
  'Lead Deleted': 'bg-red-100 text-red-700',
  'Recommended Unit Added': 'bg-primary/10 text-primary',
  'Recommended Unit Removed': 'bg-muted text-muted-foreground',
  'Site Visit Scheduled': 'bg-blue-100 text-blue-700',
  'Site Visit Completed': 'bg-teal-100 text-teal-700',
};

function colorFor(action: string): string {
  for (const key of Object.keys(ACTION_COLORS)) {
    if (action.includes(key)) return ACTION_COLORS[key];
  }
  return 'bg-muted text-muted-foreground';
}

export default function LeadTimeline({ leadId }: LeadTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`/api/lead-activity?entity_type=lead&entity_id=${encodeURIComponent(leadId)}`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((body) => {
        if (mounted) setEvents(body.events || []);
      })
      .catch(() => {
        if (mounted) setEvents([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [leadId]);

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return `${sameDay ? '' : d.toLocaleDateString() + ' '}${d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <History size={12} /> Timeline
      </p>
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2 py-1">
              <span
                className={`mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${colorFor(e.actionType)}`}
              >
                {e.actionType}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground truncate">{e.detail || '—'}</p>
                <p className="text-[10px] text-muted-foreground">{formatTime(e.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

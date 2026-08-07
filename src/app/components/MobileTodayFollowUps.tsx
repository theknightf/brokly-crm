'use client';
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  MessageCircle,
  Phone,
  StickyNote,
} from 'lucide-react';
import Link from 'next/link';
import { followUpsService } from '@/lib/services/crmService';
import { QuickNoteSheet } from '@/components/mobile/QuickNoteSheet';
import { useCallOutcome, CallItem, CallChannel } from '@/components/mobile/CallOutcomeSheet';

interface Item {
  id: string;
  contactName: string;
  contactPhone?: string;
  dueDate: string;
  propertyInterest?: string;
}

const todayStr = () => new Date().toISOString().split('T')[0];

function dueLabel(due: string): { text: string; cls: string; overdue: boolean } {
  const today = todayStr();
  if (due < today) return { text: 'Overdue', cls: 'bg-red-100 text-red-600', overdue: true };
  if (due === today)
    return { text: 'Due today', cls: 'bg-amber-100 text-amber-700', overdue: false };
  return { text: due, cls: 'bg-muted text-muted-foreground', overdue: false };
}

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
}

export default function MobileTodayFollowUps() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteTarget, setNoteTarget] = useState<Item | null>(null);
  const { arm, sheet } = useCallOutcome();
  const armCall = (item: Item, channel: CallChannel) => {
    arm(
      {
        id: item.id,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        entityType: 'follow_up',
        rescheduleId: item.id,
      },
      channel
    );
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [overdue, pending] = await Promise.all([
          followUpsService.getOverdue(5),
          followUpsService.getTodayAndPending(5),
        ]);
        if (!alive) return;
        const seen = new Set<string>();
        const merged = [...overdue, ...pending].filter((f) => {
          if (seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });
        merged.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        setItems(merged as Item[]);
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-secondary text-primary flex items-center justify-center">
            <CalendarClock size={16} />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground leading-tight">Today & Pending</h2>
            <p className="text-[11px] text-muted-foreground">Follow-ups that need your attention</p>
          </div>
        </div>
        <Link
          href="/follow-ups"
          className="text-xs font-semibold text-primary px-3 py-2 rounded-lg active:scale-95 transition-transform"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center rounded-2xl border border-border bg-card">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
            <AlertTriangle size={18} className="text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-foreground">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-0.5">No follow-ups due today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const d = dueLabel(item.dueDate);
            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-card p-3.5 ${
                  d.overdue
                    ? 'border-red-200'
                    : d.text === 'Due today'
                      ? 'border-amber-200'
                      : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{item.contactName}</p>
                    {item.propertyInterest && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.propertyInterest}
                      </p>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${d.cls}`}
                    >
                      {d.overdue ? <AlertTriangle size={10} /> : null}
                      {d.text}
                    </span>
                  </div>
                  {item.contactPhone ? (
                    <div className="flex gap-2 shrink-0">
                      <a
                        href={`tel:${item.contactPhone}`}
                        onClick={() => armCall(item, 'Call')}
                        className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center active:scale-90 transition-transform"
                        aria-label="Call"
                      >
                        <Phone size={19} />
                      </a>
                      <a
                        href={waLink(item.contactPhone)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => armCall(item, 'WhatsApp')}
                        className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center active:scale-90 transition-transform"
                        aria-label="WhatsApp"
                      >
                        <MessageCircle size={19} />
                      </a>
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => setNoteTarget(item)}
                  className="mt-3 w-full h-11 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <StickyNote size={14} />
                  Add note
                </button>
              </div>
            );
          })}
        </div>
      )}

      <QuickNoteSheet
        open={noteTarget !== null}
        title={noteTarget ? `Note — ${noteTarget.contactName}` : 'Note'}
        onClose={() => setNoteTarget(null)}
        onSave={async (text) => {
          if (noteTarget) await followUpsService.update(noteTarget.id, { notes: text });
        }}
      />

      {sheet}
    </div>
  );
}

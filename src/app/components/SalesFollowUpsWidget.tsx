'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Calendar,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  StickyNote,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { followUpsService } from '@/lib/services/crmService';
import { useFollowUpSync } from '@/hooks/useFollowUpSync';
import { QuickNoteSheet } from '@/components/mobile/QuickNoteSheet';
import { useCallOutcome, CallChannel } from '@/components/mobile/CallOutcomeSheet';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { toast } from 'sonner';

export interface FollowUpItem {
  id: string;
  title?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  dueDate: string;
  dueTime?: string;
  priority?: string;
  status?: string;
  notes?: string;
  propertyInterest?: string;
  leadId?: string;
  agent?: string;
  agentInitials?: string;
}

type TabKey = 'today' | 'overdue' | 'upcoming' | 'all';

const todayStr = () => new Date().toISOString().split('T')[0];

function formatDisplayDate(dateStr: string, timeStr?: string) {
  if (!dateStr) return '—';
  const today = todayStr();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  let dayLabel = dateStr;
  if (dateStr === today) dayLabel = 'Today';
  else if (dateStr === tomorrow) dayLabel = 'Tomorrow';
  else {
    const d = new Date(dateStr + 'T00:00:00');
    if (!Number.isNaN(d.getTime())) {
      dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  let formattedTime = '';
  if (timeStr && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      formattedTime = ` at ${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }

  return `${dayLabel}${formattedTime}`;
}

function dueStatus(due: string): { label: string; cls: string; isOverdue: boolean; isToday: boolean } {
  const today = todayStr();
  if (due < today) {
    return {
      label: 'Overdue',
      cls: 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900',
      isOverdue: true,
      isToday: false,
    };
  }
  if (due === today) {
    return {
      label: 'Due Today',
      cls: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
      isOverdue: false,
      isToday: true,
    };
  }
  return {
    label: 'Upcoming',
    cls: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    isOverdue: false,
    isToday: false,
  };
}

function waLink(phone: string, name?: string): string {
  return getWhatsAppLinkForLead(phone, name);
}

export default function SalesFollowUpsWidget() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [allFollowUps, setAllFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<FollowUpItem | null>(null);

  const { arm, sheet } = useCallOutcome();

  const loadData = useCallback(async () => {
    try {
      const list = await followUpsService.getAll();
      const items = (Array.isArray(list) ? list : []) as FollowUpItem[];
      setAllFollowUps(items);
    } catch {
      // Keep existing data on transient network hiccups
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep widget in real-time sync with follow-up changes, tab changes, and PWA focus
  useFollowUpSync(loadData);

  const today = todayStr();

  // Active (non-completed/cancelled) follow-ups
  const activeItems = allFollowUps.filter(
    (f) => f.status !== 'Completed' && f.status !== 'Cancelled'
  );

  const overdueList = activeItems.filter((f) => f.dueDate < today);
  const todayList = activeItems.filter((f) => f.dueDate === today);
  const upcomingList = activeItems.filter((f) => f.dueDate > today);

  const counts = {
    today: todayList.length,
    overdue: overdueList.length,
    upcoming: upcomingList.length,
    all: activeItems.length,
  };

  const currentList =
    activeTab === 'today'
      ? todayList
      : activeTab === 'overdue'
      ? overdueList
      : activeTab === 'upcoming'
      ? upcomingList
      : activeItems;

  const handleComplete = async (id: string, contactName: string) => {
    setCompletingId(id);
    const now = new Date().toISOString();
    try {
      await followUpsService.updateStatus(id, 'Completed', now);
      toast.success(`Follow-up with ${contactName} completed!`);
      // Optimistic local update
      setAllFollowUps((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: 'Completed' } : f))
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete follow-up');
    } finally {
      setCompletingId(null);
    }
  };

  const armCall = (item: FollowUpItem, channel: CallChannel) => {
    arm(
      {
        id: item.id,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        entityType: 'follow_up',
        rescheduleId: item.id,
        projectName: item.propertyInterest,
      },
      channel
    );
  };

  return (
    <div className="card-base border border-border bg-card p-4 sm:p-5 shadow-sm rounded-2xl">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarClock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground leading-tight">
                Scheduled Follow-ups
              </h2>
              {counts.overdue > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 animate-pulse">
                  <AlertTriangle size={10} />
                  {counts.overdue} overdue
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live pipeline queue synchronized with your lead activities
            </p>
          </div>
        </div>

        <Link
          href={`/follow-ups?tab=${activeTab === 'all' ? 'today' : activeTab}`}
          className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 group py-1"
        >
          <span>See all follow-ups</span>
          <ArrowUpRight
            size={13}
            className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </Link>
      </div>

      {/* Quick summary segmented tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl overflow-x-auto mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`flex-1 min-w-[100px] min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'today'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock size={13} />
          <span>Today</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'today'
                ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {counts.today}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('overdue')}
          className={`flex-1 min-w-[100px] min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'overdue'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle size={13} className={counts.overdue > 0 ? 'text-red-500' : ''} />
          <span>Overdue</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              counts.overdue > 0
                ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {counts.overdue}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 min-w-[100px] min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'upcoming'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar size={13} />
          <span>Upcoming</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'upcoming'
                ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {counts.upcoming}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`hidden sm:flex flex-1 min-w-[80px] min-h-[44px] items-center justify-center gap-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'all'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>All Active</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
            {counts.all}
          </span>
        </button>
      </div>

      {/* Content list */}
      {loading ? (
        <div className="flex items-center justify-center h-36">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : currentList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border border-dashed border-border bg-muted/20">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
            <Sparkles size={18} />
          </div>
          <p className="text-sm font-bold text-foreground">
            {activeTab === 'today'
              ? 'All caught up for today!'
              : activeTab === 'overdue'
              ? 'No overdue follow-ups!'
              : activeTab === 'upcoming'
              ? 'No upcoming follow-ups scheduled'
              : 'No active follow-ups'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === 'today'
              ? 'Great job keeping in touch with your leads.'
              : 'Schedule a new follow-up directly from any lead card.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {currentList.slice(0, 6).map((item) => {
            const due = dueStatus(item.dueDate);
            const isCompleting = completingId === item.id;
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between p-3.5 rounded-xl border bg-card/60 transition-all hover:shadow-sm hover:border-primary/40 ${
                  due.isOverdue
                    ? 'border-red-200 dark:border-red-900/60 bg-red-50/20'
                    : due.isToday
                    ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/20'
                    : 'border-border'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.leadId ? (
                          <Link
                            href={`/leads-management?leadId=${item.leadId}`}
                            className="text-sm font-bold text-foreground hover:text-primary transition-colors truncate"
                          >
                            {item.contactName}
                          </Link>
                        ) : (
                          <p className="text-sm font-bold text-foreground truncate">
                            {item.contactName}
                          </p>
                        )}
                        {item.priority && (
                          <span
                            className={`px-1.5 py-px text-[9px] font-bold rounded ${
                              item.priority === 'High'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                                : item.priority === 'Medium'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {item.priority}
                          </span>
                        )}
                      </div>
                      {item.propertyInterest && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.propertyInterest}
                        </p>
                      )}
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${due.cls}`}
                    >
                      {due.isOverdue && <AlertTriangle size={9} />}
                      {formatDisplayDate(item.dueDate, item.dueTime)}
                    </span>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-muted-foreground/90 line-clamp-2 mt-2 bg-muted/40 p-1.5 rounded-lg">
                      {item.notes}
                    </p>
                  )}
                </div>

                {/* Quick actions row */}
                <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    {item.contactPhone && (
                      <>
                        <a
                          href={`tel:${item.contactPhone}`}
                          onClick={() => armCall(item, 'Call')}
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground active:scale-90 transition-all"
                          title="Call contact"
                          aria-label="Call contact"
                        >
                          <Phone size={14} />
                        </a>
                        <a
                          href={waLink(item.contactPhone, item.contactName)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => armCall(item, 'WhatsApp')}
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white active:scale-90 transition-all"
                          title="Message on WhatsApp"
                          aria-label="Message on WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </a>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setNoteTarget(item)}
                      className="min-h-[44px] h-11 px-3 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold flex items-center gap-1 hover:bg-secondary/80 active:scale-95 transition-all"
                      title="Add note"
                    >
                      <StickyNote size={12} />
                      <span className="hidden sm:inline">Note</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleComplete(item.id, item.contactName)}
                    disabled={isCompleting}
                    className="min-h-[44px] h-11 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 hover:bg-primary/90 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {isCompleting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    <span>Done</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Note Sheet */}
      <QuickNoteSheet
        open={noteTarget !== null}
        title={noteTarget ? `Note — ${noteTarget.contactName}` : 'Note'}
        onClose={() => setNoteTarget(null)}
        onSave={async (text) => {
          if (noteTarget) {
            await followUpsService.update(noteTarget.id, { notes: text });
            toast.success('Note updated');
            loadData();
          }
        }}
      />

      {sheet}
    </div>
  );
}

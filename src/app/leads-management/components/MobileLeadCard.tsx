'use client';
import React, { useEffect, useState } from 'react';
import {
  Pencil,
  Trash2,
  PhoneCall,
  MessageCircle,
  StickyNote,
  CalendarClock,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  ThumbsUp,
  UserX,
  AlertTriangle,
  TrendingUp,
  Send,
  MapPin,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lead, LeadStatus } from './mockLeads';
import { PIPELINE_STAGES, OUTCOME_STAGES, nextPipelineStage } from './leadStages';
import StatusBadge from '@/components/ui/StatusBadge';
import { leadsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';

interface MobileLeadCardProps {
  lead: Lead;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onView: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: LeadStatus) => void;
  onOpenLogCall?: (lead: Lead) => void;
  onAddNote?: (lead: Lead) => void;
}

type TimelineEvent = {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  ts: string; // ISO
};

const WA_ICON: Record<string, { Icon: any; color: string; bg: string }> = {
  'WhatsApp Sent': { Icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'Customer Replied': { Icon: ThumbsUp, color: 'text-sky-600', bg: 'bg-sky-100' },
  'No Reply': { Icon: UserX, color: 'text-muted-foreground', bg: 'bg-muted' },
  'WhatsApp Follow-up': { Icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-100' },
};

const CALL_ICON: Record<string, { Icon: any; color: string; bg: string }> = {
  Connected: { Icon: PhoneCall, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  Interested: { Icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-100' },
  'Not Interested': { Icon: UserX, color: 'text-muted-foreground', bg: 'bg-muted' },
  'No Answer': { Icon: PhoneCall, color: 'text-amber-600', bg: 'bg-amber-100' },
  'Closed Number': { Icon: PhoneCall, color: 'text-red-600', bg: 'bg-red-100' },
  'Callback Later': { Icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  Busy: { Icon: PhoneCall, color: 'text-amber-600', bg: 'bg-amber-100' },
};

function formatEgyBudget(min?: number, max?: number) {
  if (min == null && max == null) return '—';
  const parts: string[] = [];
  if (min != null) parts.push(min.toLocaleString('en-EG'));
  if (max != null) parts.push(max.toLocaleString('en-EG'));
  return `${parts.join('–')} ج.م`;
}

function formatFollowUpShort(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatTimeline(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${dd}/${mm}/${yy} • ${time}`;
}

function isOverdue(d?: string | null) {
  if (!d) return false;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

function getInitials(name: string, fallback = '—') {
  const n = (name || fallback).trim();
  if (!n) return '—';
  return n
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function MobileLeadCard({
  lead,
  selected,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenLogCall,
  onAddNote,
}: MobileLeadCardProps) {
  const { user } = useAuth();
  const [statusOpen, setStatusOpen] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // ── Fetch call-log + activity timeline for this lead ──
  useEffect(() => {
    let alive = true;
    setLoadingTimeline(true);
    (async () => {
      const events: TimelineEvent[] = [];
      try {
        const [callsRes, activityRes] = await Promise.all([
          fetch(`/api/call-log?entity_type=lead&entity_id=${encodeURIComponent(lead.id)}`, {
            cache: 'no-store',
          })
            .then((r) => r.json().catch(() => ({})))
            .catch(() => ({})),
          fetch(
            `/api/lead-activity?lead_id=${encodeURIComponent(lead.id)}&limit=20`,
            { cache: 'no-store' }
          )
            .then((r) => r.json().catch(() => ({})))
            .catch(() => ({})),
        ]);

        const calls: any[] = callsRes?.calls || callsRes?.call_logs || [];
        calls.forEach((c: any) => {
          const outcome = c.outcome || c.channel || 'Call';
          const isWa = (c.channel || '').toLowerCase().includes('whatsapp');
          const styleMap = isWa ? WA_ICON : CALL_ICON;
          const matched = styleMap[outcome] || {
            Icon: isWa ? Send : PhoneCall,
            color: isWa ? 'text-sky-600' : 'text-emerald-600',
            bg: isWa ? 'bg-sky-100' : 'bg-emerald-100',
          };
          const Icon = matched.Icon;
          events.push({
            id: `call-${c.id}`,
            label: isWa ? outcome : (c.direction === 'incoming' ? 'Incoming call' : `Call · ${outcome}`),
            icon: <Icon size={12} className={matched.color} />,
            color: matched.color,
            ts: c.created_at || c.createdAt || new Date().toISOString(),
          });
        });

        const activity: any[] = activityRes?.activity || activityRes?.items || activityRes?.logs || [];
        activity.forEach((a: any) => {
          const type = a.action_type || a.type || '';
          let label = type;
          let icon: React.ReactNode = <Clock size={12} className="text-muted-foreground" />;
          let color = 'text-muted-foreground';
          if (type === 'lead_status_updated' || type === 'Lead Status Updated') {
            label = `Status → ${a.detail || a.meta?.to_status || a.meta?.new_status || 'updated'}`;
            icon = <TrendingUp size={12} className="text-violet-600" />;
            color = 'text-violet-600';
          } else if (type === 'lead_assigned' || type === 'Lead Assigned') {
            label = `Assigned to ${a.meta?.assignee_name || a.detail || 'someone'}`;
            icon = <ArrowUpRight size={12} className="text-sky-600" />;
            color = 'text-sky-600';
          } else if (type === 'note_added' || type === 'Note Added' || type === 'comment_added') {
            label = 'Note added';
            icon = <StickyNote size={12} className="text-amber-600" />;
            color = 'text-amber-600';
          } else if (type === 'follow_up_scheduled') {
            label = 'Follow-up scheduled';
            icon = <CalendarClock size={12} className="text-amber-600" />;
            color = 'text-amber-600';
          }
          events.push({
            id: `act-${a.id}`,
            label,
            icon,
            color,
            ts: a.created_at || a.createdAt || new Date().toISOString(),
          });
        });
      } catch {
        /* timeline is best-effort; empty state is fine */
      }
      if (!alive) return;
      events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      setTimeline(events.slice(0, 6));
      setLoadingTimeline(false);
    })();
    return () => {
      alive = false;
    };
  }, [lead.id]);

  const initials = getInitials(lead.name || '', lead.id?.toString().slice(0, 2));
  const overdue = isOverdue(lead.followUpDue);
  const nextStage = nextPipelineStage(lead.status || 'Fresh Leads');

  // ── Inline quick-note entry ──
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const submitNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setNoteSaving(true);
    try {
      const res = await fetch('/api/lead-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, body: text, user_id: user?.id || '' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // graceful fallback: hit the bulk service
        const { leadCommentsService } = await import('@/lib/services/crmService');
        await leadCommentsService.create(lead.id, text, user?.id || '');
      }
      toast.success('Note added');
      setNoteText('');
      setNoteOpen(false);
    } catch (err) {
      try {
        const { leadCommentsService } = await import('@/lib/services/crmService');
        await leadCommentsService.create(lead.id, text, user?.id || '');
        toast.success('Note added');
        setNoteText('');
        setNoteOpen(false);
      } catch {
        toast.error('Could not save note');
      }
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div
      className={`bg-card border rounded-2xl shadow-sm transition-all ${
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      }`}
    >
      {/* ── 1. Top Header Row ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(lead.id, e.target.checked)}
          className="w-5 h-5 min-w-[20px] rounded border-input accent-primary cursor-pointer flex-shrink-0"
          aria-label={`Select ${lead.name || lead.id}`}
        />
        <button
          onClick={() => onView(lead)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[44px]"
          aria-label={`Open ${lead.name || lead.id}`}
        >
          <div className="w-11 h-11 min-w-[44px] rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground text-[15px] truncate leading-tight">
              {lead.name || `Lead ${lead.id}`}
            </p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <MapPin size={11} className="flex-shrink-0" />
              {lead.location || '—'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(lead)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl hover:bg-secondary text-muted-foreground flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Edit lead"
          >
            <Pencil size={17} />
          </button>
          <button
            onClick={() => onDelete(lead.id)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl hover:bg-red-50 text-muted-foreground hover:text-red-500 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Delete lead"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      {/* Right-aligned budget/amount strip (deals where you need it on top right) */}
      <div className="px-4 pb-2 -mt-1 flex items-center justify-end">
        <p className="text-sm font-bold text-foreground tabular-nums">
          {formatEgyBudget(lead.budgetMin, lead.budgetMax)}
        </p>
      </div>

      {/* ── 2. Status & Ownership Row ── */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Pipeline stage dropdown pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setStatusOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200/60 active:scale-[0.98] transition-transform min-h-[36px]"
              aria-label={`Stage: ${lead.status || 'Fresh Leads'}`}
            >
              <StatusBadge status={lead.status || 'Fresh Leads'} />
              <ChevronDown size={12} />
            </button>
            {statusOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setStatusOpen(false)}
                  aria-hidden
                />
                <div className="absolute left-0 top-full mt-1 z-40 flex flex-col bg-card border border-border rounded-xl shadow-modal min-w-[240px] py-1 max-h-80 overflow-y-auto">
                  <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Pipeline
                  </p>
                  {PIPELINE_STAGES.map((s) => (
                    <button
                      key={`mob-pipe-${lead.id}-${s}`}
                      onClick={() => {
                        onStatusChange(lead.id, s as LeadStatus);
                        setStatusOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-muted transition-colors flex items-center ${
                        s === lead.status ? 'bg-secondary/50' : ''
                      }`}
                    >
                      <StatusBadge status={s} showDot />
                    </button>
                  ))}
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Outcomes
                  </p>
                  {OUTCOME_STAGES.map((s) => (
                    <button
                      key={`mob-out-${lead.id}-${s}`}
                      onClick={() => {
                        onStatusChange(lead.id, s as LeadStatus);
                        setStatusOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-muted transition-colors flex items-center ${
                        s === lead.status ? 'bg-secondary/50' : ''
                      }`}
                    >
                      <StatusBadge status={s} showDot />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Outcome / sub-status pill */}
          {lead.priority && (
            <span className="inline-flex items-center h-9 px-3 rounded-full bg-violet-100 text-violet-800 text-xs font-bold border border-violet-200/60">
              {lead.priority}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Follow-up pill */}
          <span
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border min-h-[36px] ${
              overdue
                ? 'bg-red-50 text-red-700 border-red-200/60'
                : 'bg-secondary text-secondary-foreground border-border'
            }`}
          >
            <CalendarClock size={12} className="flex-shrink-0" />
            Follow-up: {formatFollowUpShort(lead.followUpDue)}
          </span>

          {overdue && (
            <span className="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-red-100 text-red-700 text-xs font-bold border border-red-200/60">
              <AlertTriangle size={12} />
              Overdue
            </span>
          )}

          {/* Assigned agent */}
          <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-sky-50 text-sky-800 text-xs font-semibold border border-sky-200/60 max-w-[60%] min-h-[36px]">
            <span className="w-5 h-5 rounded-full bg-sky-200 text-sky-800 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {getInitials(lead.assignedToName || lead.agent || 'U')}
            </span>
            <span className="truncate">
              {lead.assignedToName || lead.agent || 'Unassigned'}
            </span>
          </span>
        </div>
      </div>

      {/* ── 3. Contact Actions Bar ── */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        {lead.phone ? (
          <>
            <a
              href={`tel:${lead.phone.replace(/[^0-9+,]/g, '')}`}
              onClick={() => onOpenLogCall?.(lead)}
              className="h-12 min-h-[48px] rounded-xl bg-primary/10 text-primary flex items-center gap-2 px-3 active:scale-[0.98] transition-transform"
              aria-label="Call contact"
            >
              <PhoneCall size={18} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-none">Call</p>
                <p className="text-[11px] truncate leading-tight" dir="ltr">
                  {lead.phone}
                </p>
              </div>
            </a>
            <a
              href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="h-12 min-h-[48px] rounded-xl bg-emerald-50 text-emerald-700 flex items-center gap-2 px-3 active:scale-[0.98] transition-transform"
              aria-label="WhatsApp contact"
            >
              <MessageCircle size={18} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-none">WhatsApp</p>
                <p className="text-[11px] truncate leading-tight" dir="ltr">
                  {lead.phone}
                </p>
              </div>
            </a>
          </>
        ) : (
          <div className="col-span-2 h-12 min-h-[48px] rounded-xl bg-muted text-muted-foreground flex items-center justify-center text-xs">
            No phone on file
          </div>
        )}
      </div>

      {/* ── 4. Vertical Activity Timeline ── */}
      <div className="px-4 pb-3">
        <div className="bg-muted/40 rounded-2xl px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Activity
          </p>
          {loadingTimeline ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          ) : timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No activity yet.</p>
          ) : (
            <ol className="relative">
              {/* vertical connecting line */}
              <span
                aria-hidden
                className="absolute left-[10px] top-1.5 bottom-1.5 w-px bg-border"
              />
              {timeline.map((e, idx) => (
                <li
                  key={e.id}
                  className="relative flex items-center gap-2.5 py-1.5"
                >
                  <span
                    className={`relative z-10 w-5 h-5 min-w-[20px] rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0`}
                  >
                    {e.icon}
                  </span>
                  <span className="text-sm font-medium text-foreground flex-1 truncate">
                    {e.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                    {formatTimeline(e.ts)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* ── 5. Quick Note Field ── */}
      <div className="px-4 pb-3">
        {!noteOpen ? (
          <button
            type="button"
            onClick={() => {
              setNoteOpen(true);
              onAddNote?.(lead);
            }}
            className="w-full h-12 min-h-[48px] rounded-xl border border-dashed border-border bg-card text-muted-foreground text-sm font-semibold flex items-center gap-2 px-3 active:scale-[0.99] transition-transform"
            aria-label="Add note"
          >
            <StickyNote size={16} />
            Add note
          </button>
        ) : (
          <div className="rounded-xl border border-border bg-card p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <StickyNote size={15} className="text-amber-600 flex-shrink-0" />
              <span className="text-xs font-semibold text-foreground">New note</span>
            </div>
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Type your note here…"
              className="w-full text-sm bg-muted/40 rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  setNoteOpen(false);
                  setNoteText('');
                }}
                className="h-9 px-3 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted active:scale-95 transition-transform"
                aria-label="Cancel note"
              >
                Cancel
              </button>
              <button
                onClick={submitNote}
                disabled={!noteText.trim() || noteSaving}
                className="h-9 min-h-[36px] px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 active:scale-95 transition-transform flex items-center gap-1.5"
                aria-label="Save note"
              >
                {noteSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Bottom Action Footer ── */}
      <div className="border-t border-border bg-muted/30 rounded-b-2xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
            Next Action
          </p>
          <p className="text-sm font-bold text-foreground leading-tight mt-0.5 truncate">
            {nextStage ? `Move to ${nextStage}` : overdue ? 'Follow up now' : 'Call the lead'}
          </p>
        </div>
        <button
          onClick={() => {
            if (lead.phone) {
              window.location.href = `tel:${lead.phone.replace(/[^0-9+,]/g, '')}`;
            }
            onOpenLogCall?.(lead);
          }}
          className="h-12 min-h-[48px] px-5 rounded-2xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 active:scale-[0.98] transition-transform shadow-md shadow-emerald-600/20"
          aria-label="Start call"
        >
          <PhoneCall size={16} />
          Start Call
        </button>
      </div>
    </div>
  );
}

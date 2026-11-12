'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  MessageCircle,
  MapPin,
  CheckCircle2,
  ThumbsUp,
  UserX,
  PhoneCall,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Handshake,
  Pencil,
  Tag,
  Plus,
  ClipboardList,
  Activity,
  MessageSquare,
  X,
} from 'lucide-react';
import { StatusPill } from '@/components/ui/StatusPill';
import StatusBadge from '@/components/ui/StatusBadge';
import ViewportPopover from '@/components/ui/ViewportPopover';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { leadsService, followUpsService } from '@/lib/services/crmService';
import type { Lead, LeadStatus } from './mockLeads';
import LeadNotesSection from './LeadNotesSection';
import RecommendedUnitsSection from './RecommendedUnitsSection';
import LeadEventsTimeline from './LeadEventsTimeline';

/**
 * The lead profile drawer (stage, actions, details, next action date, payment plan, calls, timeline, notes).
 * Shared by Leads Management and the Follow-ups page. Actions whose callback is not passed are hidden,
 * so a page only shows what it can actually do.
 */

interface CallHistoryRow {
  id: string;
  contact_name?: string;
  contact_phone?: string;
  channel?: string;
  direction?: string;
  duration_seconds?: number;
  outcome?: string;
  notes?: string;
  agent_name?: string;
  created_at?: string;
}

function fmtCallTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtCallDuration(seconds?: number): string {
  const s = Number(seconds) || 0;
  if (s <= 0) return '';
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function LeadCallHistory({ leadId, refreshKey = 0 }: { leadId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<CallHistoryRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/call-log?entity_type=lead&entity_id=${encodeURIComponent(leadId)}`,
          { cache: 'no-store' }
        );
        const body = await res.json().catch(() => null);
        if (!alive) return;
        setRows(body?.calls || body?.call_logs || []);
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [leadId, refreshKey]);

  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <PhoneCall size={11} />
        Call History
      </p>
      {rows === null ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" />
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No calls logged for this lead yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="bg-card border border-border rounded-lg px-2.5 py-2 flex items-start gap-2"
            >
              {r.direction === 'incoming' ? (
                <ArrowDownLeft size={13} className="text-sky-500 mt-0.5 flex-shrink-0" />
              ) : (
                <ArrowUpRight size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {r.outcome || r.channel || 'Call'}
                  </span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {fmtCallTime(r.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{r.channel || 'Call'}</span>
                  {r.duration_seconds ? (
                    <span className="flex items-center gap-0.5">
                      <Clock size={9} />
                      {fmtCallDuration(r.duration_seconds)}
                    </span>
                  ) : null}
                  {r.agent_name ? <span>· {r.agent_name}</span> : null}
                </p>
                {r.notes ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5 italic truncate">
                    {r.notes}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Saves a follow-up for a lead: the lead's date (source of truth) and the follow_ups row with its time/notes. */
export async function scheduleLeadFollowUp(
  lead: Lead,
  dueDate: string,
  dueTime: string,
  notes: string,
  userId: string
): Promise<void> {
  await Promise.all([
    leadsService.scheduleFollowUp(lead.id, dueDate, userId || undefined, notes || undefined),
    followUpsService.create(
      {
        title: `Follow up: ${lead.name || 'Lead'}`,
        contactName: lead.name || 'Lead',
        contactPhone: lead.phone || '',
        contactEmail: lead.email || '',
        type: 'Call',
        status: 'Pending',
        priority: 'Medium',
        dueDate,
        dueTime,
        agent: lead.agent || '',
        agentInitials: lead.agentInitials || '',
        notes: notes || lead.notes || '',
        propertyInterest: lead.propertyType || lead.project || '',
        relationshipStatus: 'New',
        leadId: lead.id,
      } as any,
      userId
    ),
  ]);
}

export interface LeadProfileDrawerProps {
  lead: Lead;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onCall?: (lead: Lead) => void;
  onLogCall?: (lead: Lead) => void;
  onEdit?: (lead: Lead) => void;
  onSiteVisit?: (lead: Lead) => void;
  onDeal?: (lead: Lead, status: 'Reservation' | 'Done Deal') => void;
  onPayPlan?: (lead: Lead) => void;
  onWhatsAppAction?: (lead: Lead, outcome: string) => void;
  scheduleDate: string;
  setScheduleDate: (v: string) => void;
  scheduleTime: string;
  setScheduleTime: (v: string) => void;
  scheduleNotes: string;
  setScheduleNotes: (v: string) => void;
  handleScheduleFollowUp: () => void;
  scheduleSaving: boolean;
  callHistoryKey?: number;
}

export default function LeadProfileDrawer({
  lead,
  onClose,
  onStatusChange,
  onCall,
  onLogCall,
  onEdit,
  onSiteVisit,
  onDeal,
  onPayPlan,
  onWhatsAppAction,
  scheduleDate,
  setScheduleDate,
  scheduleTime,
  setScheduleTime,
  scheduleNotes,
  setScheduleNotes,
  handleScheduleFollowUp,
  scheduleSaving,
  callHistoryKey = 0,
}: LeadProfileDrawerProps) {
  const viewLead = lead;
  type Tab = 'overview' | 'notes' | 'activity';
  // The last tab used is remembered (per browser) so an agent who lives in Notes lands there.
  const [viewTab, setViewTabState] = useState<Tab>(() => {
    try {
      const v = window.localStorage.getItem('brokly.leadDrawerTab');
      return v === 'notes' || v === 'activity' ? v : 'overview';
    } catch {
      return 'overview';
    }
  });
  const setViewTab = (tb: Tab) => {
    setViewTabState(tb);
    try {
      window.localStorage.setItem('brokly.leadDrawerTab', tb);
    } catch {
      /* storage unavailable */
    }
  };
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [focusNoteBox, setFocusNoteBox] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNoteCount(null);
    setFocusNoteBox(false);
    setShowMore(false);
  }, [lead.id]);

  // Esc closes the drawer, unless a dialog opened on top of it (note, call, deal…) is the one being closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const status = (viewLead.status || 'Fresh Leads') as LeadStatus;
  const initials =
    (viewLead.name || '')
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || '—';
  const assignedNames =
    viewLead.assignedToNames && viewLead.assignedToNames.length > 0
      ? viewLead.assignedToNames.join(' & ')
      : viewLead.assignedToName || '';
  const agentDiffers = !!viewLead.agent && viewLead.agent.trim() !== assignedNames.trim();

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(viewLead.phone || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Details grid: filled fields first; empty ones only behind "Show empty fields".
  const details: { label: string; value?: string | null; href?: string; wide?: boolean }[] = [
    { label: 'Email', value: viewLead.email, href: viewLead.email ? `mailto:${viewLead.email}` : undefined },
    {
      label: 'Phone 2',
      value: viewLead.phone2,
      href: viewLead.phone2 ? `tel:${viewLead.phone2.replace(/[^\d+]/g, '')}` : undefined,
    },
    { label: 'Project', value: viewLead.project || viewLead.developer },
    { label: 'Source', value: viewLead.source },
    { label: 'Assigned to', value: assignedNames || 'Unassigned' },
    ...(agentDiffers ? [{ label: 'Agent', value: viewLead.agent }] : []),
    { label: 'Next action date', value: viewLead.followUpDue },
    { label: 'Location', value: viewLead.location },
    { label: 'Priority', value: viewLead.priority && viewLead.priority !== 'Normal' ? viewLead.priority : '' },
    { label: 'Rating', value: viewLead.leadRating },
    { label: 'Team', value: viewLead.team },
    { label: 'CS agent', value: viewLead.csAgent },
    ...(viewLead.referredTo ? [{ label: 'Referred to', value: viewLead.referredToName || 'Second user' }] : []),
    ...(viewLead.referredBy ? [{ label: 'Referred by', value: viewLead.referredByName || 'Recorded user' }] : []),
  ];
  // Overdue = the next action date is before today (Cairo) and the lead is still open.
  const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const nextActionOverdue =
    !!viewLead.followUpDue &&
    viewLead.followUpDue.slice(0, 10) < todayCairo &&
    !CLOSED_STAGES.has(String(viewLead.status || '').toLowerCase());

  const filled = details.filter((d) => d.value && String(d.value).trim());
  const empty = details.filter((d) => !d.value || !String(d.value).trim());

  const quickBtn =
    'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-all active:scale-95 sm:flex-row sm:gap-1.5 sm:text-xs';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div
        className="relative flex w-full max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-border bg-card shadow-modal animate-in fade-in slide-in-from-right-4 sm:h-full sm:max-h-full sm:max-w-lg sm:rounded-none sm:border-s"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* ── Sticky header: who, stage, source, quick actions, tabs ── */}
        <div className="z-10 flex-shrink-0 border-b border-border bg-card">
          <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-500/15 text-sm font-bold text-lime-700 dark:text-lime-300" aria-hidden>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-foreground" dir="auto" title={viewLead.name}>
                {viewLead.name || `Lead ${viewLead.id}`}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusPill status={status} />
                {viewLead.source && (
                  <span className="inline-flex max-w-[160px] items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <Tag size={11} className="shrink-0 text-primary" />
                    <span className="truncate">{viewLead.source}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform hover:bg-muted active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* Quick actions — always reachable */}
          <div className="flex gap-2 px-4 pt-3 sm:px-5">
            {viewLead.phone && onCall && (
              <button type="button" onClick={() => onCall(viewLead)} className={`${quickBtn} bg-lime-500/15 text-lime-700 hover:bg-lime-500/25 dark:text-lime-300`}>
                <PhoneCall size={15} aria-hidden /> Call
              </button>
            )}
            {viewLead.phone && (
              <a
                href={getWhatsAppLinkForLead(viewLead.phone, viewLead.name)}
                target="_blank"
                rel="noreferrer"
                className={`${quickBtn} bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300`}
              >
                <MessageCircle size={15} aria-hidden /> WhatsApp
              </a>
            )}
            {onSiteVisit && (
              <button type="button" onClick={() => onSiteVisit(viewLead)} className={`${quickBtn} bg-muted text-foreground hover:bg-muted/80`} title="Start a GPS-verified site visit">
                <MapPin size={15} aria-hidden /> Site visit
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1 px-4 sm:px-5" role="tablist" aria-label="Lead sections">
            {(
              [
                ['overview', 'Info', ClipboardList],
                ['notes', noteCount != null ? `Notes ${noteCount}` : 'Notes', MessageSquare],
                ['activity', 'Activity', Activity],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={viewTab === key}
                onClick={() => setViewTab(key)}
                className={`-mb-px flex min-h-[40px] items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  viewTab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={14} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrolling body ── */}
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {viewTab === 'overview' && (
            <>
              {/* Stage: one control instead of a wall of chips */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Stage</p>
                  <StatusBadge status={status} showDot />
                </div>
                <button
                  ref={statusAnchorRef}
                  type="button"
                  onClick={() => setStatusOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={statusOpen}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:brightness-105 active:scale-95"
                >
                  Change status <ChevronDown size={14} aria-hidden />
                </button>
                {statusOpen && (
                  <ViewportPopover
                    open={statusOpen}
                    onClose={() => setStatusOpen(false)}
                    anchorRef={statusAnchorRef}
                    align="end"
                    minWidth={260}
                    preferredMaxHeight={440}
                    zIndex={110}
                    role="listbox"
                  >
                    <div className="py-1">
                      <p className="px-4 pt-1 pb-2 text-sm font-bold text-foreground sm:hidden">Change status</p>
                      {STATUS_GROUPS.map((g) => (
                        <div key={g.label} className="pb-1">
                          <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.label}</p>
                          {g.stages.map((s) => {
                            const on = s === status;
                            return (
                              <button
                                key={s}
                                type="button"
                                role="option"
                                aria-selected={on}
                                onClick={() => {
                                  setStatusOpen(false);
                                  if (!on) onStatusChange(viewLead.id, s);
                                }}
                                className={`flex w-full min-h-[44px] items-center justify-between gap-3 px-4 text-start text-sm transition-colors ${
                                  on ? 'bg-primary/10 font-semibold' : 'hover:bg-muted'
                                }`}
                              >
                                <StatusBadge status={s} showDot />
                                {on && <Check size={15} className="shrink-0 text-primary" aria-hidden />}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </ViewportPopover>
                )}
              </div>

              {/* Key dates (Cairo time) */}
              <section aria-label="Dates" className="grid grid-cols-3 gap-2">
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Created</p>
                  <p className="text-sm font-medium tabular-nums text-foreground">{cairoDate(viewLead.createdAtIso || viewLead.createdAt)}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{cairoTime(viewLead.createdAtIso)}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Assigned</p>
                  <p className="text-sm font-medium tabular-nums text-foreground">{cairoDate(viewLead.assignedAt)}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{cairoTime(viewLead.assignedAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById('drawer-next-action')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className={`min-w-0 rounded-xl border px-3 py-2 text-start ${
                    nextActionOverdue ? 'border-red-500/50 bg-red-500/10' : 'border-border bg-muted/30'
                  }`}
                  title="Change the next action date"
                >
                  <p className={`text-[11px] ${nextActionOverdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    Next action{nextActionOverdue ? ' · overdue' : ''}
                  </p>
                  <p className={`text-sm font-medium tabular-nums ${nextActionOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                    {viewLead.followUpDue ? cairoDate(`${viewLead.followUpDue.slice(0, 10)}T12:00:00Z`) : '—'}
                  </p>
                </button>
              </section>

              {/* Contact & details */}
              <section aria-label="Contact and details" className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Contact & details</h3>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">Phone</p>
                    {viewLead.phone ? (
                      <a href={`tel:${viewLead.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="block truncate text-sm font-semibold text-primary">
                        {viewLead.phone}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                  {viewLead.phone && (
                    <button
                      type="button"
                      onClick={copyPhone}
                      aria-label="Copy phone number"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {copied ? <Check size={15} className="text-primary" /> : <Copy size={15} />}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(showEmpty ? [...filled, ...empty] : filled).map((d) => (
                    <div key={d.label} className="min-w-0 rounded-xl border border-border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{d.label}</p>
                      {d.value && d.href ? (
                        <a href={d.href} className="block truncate text-sm font-medium text-primary" dir="auto">
                          {d.value}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-medium text-foreground" dir="auto" title={d.value || ''}>
                          {d.value || '—'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {empty.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowEmpty((v) => !v)}
                    className="min-h-[32px] text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {showEmpty ? 'Hide empty fields' : `Show empty fields (${empty.length})`}
                  </button>
                )}
              </section>

              {/* Next action date (editable; red when overdue) */}
              <section
                id="drawer-next-action"
                aria-label="Next action date"
                className={`space-y-2 rounded-2xl border p-3.5 ${nextActionOverdue ? 'border-red-500/50 bg-red-500/5' : 'border-border bg-muted/30'}`}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <CalendarClock size={13} className={nextActionOverdue ? 'text-red-500' : 'text-primary'} /> Next action date
                  {viewLead.followUpDue && (
                    <span className={`ms-auto font-normal ${nextActionOverdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {nextActionOverdue ? 'Overdue · ' : 'Current: '}
                      {cairoDate(`${viewLead.followUpDue.slice(0, 10)}T12:00:00Z`)}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="input-base h-10 text-sm" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} aria-label="Next action date" />
                  <input type="time" className="input-base h-10 text-sm" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} aria-label="Next action time" />
                </div>
                <textarea
                  className="input-base min-h-[48px] resize-none text-sm"
                  placeholder="Notes (optional)"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  rows={2}
                  dir="auto"
                />
                <button
                  type="button"
                  onClick={handleScheduleFollowUp}
                  disabled={scheduleSaving || !scheduleDate}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {scheduleSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {scheduleSaving ? 'Saving…' : 'Save next action date'}
                </button>
              </section>

              {viewLead.phone && onWhatsAppAction && (
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <MessageCircle size={12} /> WhatsApp result
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'WA Sent', icon: <CheckCircle2 size={13} />, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', outcome: 'WhatsApp Sent' },
                      { label: 'Replied', icon: <ThumbsUp size={13} />, cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', outcome: 'Customer Replied' },
                      { label: 'No reply', icon: <UserX size={13} />, cls: 'bg-zinc-500/10 text-muted-foreground', outcome: 'No Reply' },
                      { label: 'WA follow-up', icon: <CalendarClock size={13} />, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', outcome: 'WhatsApp Follow-up' },
                    ].map((a) => (
                      <button
                        key={a.outcome}
                        onClick={() => onWhatsAppAction(viewLead, a.outcome)}
                        className={`flex h-10 items-center gap-2 rounded-lg px-3 text-start text-sm font-medium transition-all active:scale-[0.98] ${a.cls}`}
                      >
                        {a.icon}
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Less used: deal & payment, units — collapsed */}
              {(onDeal || onPayPlan) && (
                <section className="rounded-2xl border border-border">
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    aria-expanded={showMore}
                    className="flex min-h-[44px] w-full items-center justify-between px-3.5 text-sm font-semibold text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <Handshake size={15} className="text-primary" /> Deal, payment & units
                    </span>
                    <ChevronDown size={16} className={`text-muted-foreground transition-transform ${showMore ? 'rotate-180' : ''}`} />
                  </button>
                  {showMore && (
                    <div className="space-y-3 border-t border-border p-3.5">
                      {onDeal && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => onDeal(viewLead, 'Reservation')}
                            disabled={viewLead.status === 'Reservation'}
                            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-500/15 text-sm font-medium text-amber-700 hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-300"
                          >
                            <BadgeCheck size={14} /> Reservation
                          </button>
                          <button
                            onClick={() => onDeal(viewLead, 'Done Deal')}
                            disabled={viewLead.status === 'Done Deal'}
                            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 text-sm font-medium text-emerald-700 hover:bg-emerald-500/25 disabled:opacity-50 dark:text-emerald-300"
                          >
                            <Handshake size={14} /> Done Deal
                          </button>
                        </div>
                      )}
                      {onPayPlan &&
                        (Number(viewLead.totalPrice) > 0 ? (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                            {[
                              ['Total price', viewLead.totalPrice],
                              ['Down payment', viewLead.downPayment],
                              ['Reservation', viewLead.reservationAmount],
                              ['Remaining', viewLead.remainingAmount],
                              ['Installment', viewLead.installmentAmount],
                              ['Commission', viewLead.commission],
                            ].map(([k, v]) => (
                              <React.Fragment key={String(k)}>
                                <p className="text-xs text-muted-foreground">{k}</p>
                                <p className="text-end text-sm font-medium tabular-nums text-foreground">EGP {Number(v || 0).toLocaleString()}</p>
                              </React.Fragment>
                            ))}
                            <div className="col-span-2 border-t border-border pt-1">
                              <button onClick={() => onPayPlan(viewLead)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                                <Pencil size={10} /> Edit payment plan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                            <p className="text-xs text-muted-foreground">No payment plan added</p>
                            <button onClick={() => onPayPlan(viewLead)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                              <Plus size={11} /> Add payment plan
                            </button>
                          </div>
                        ))}
                      <RecommendedUnitsSection leadId={viewLead.id} />
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {viewTab === 'notes' && (
            <LeadNotesSection
              key={`full-${viewLead.id}`}
              leadId={viewLead.id}
              leadNotes={viewLead.notes}
              onCount={setNoteCount}
              autoFocus={focusNoteBox}
            />
          )}

          {viewTab === 'activity' && (
            <div className="space-y-5">
              <LeadEventsTimeline
                key={`events-${viewLead.id}`}
                leadId={viewLead.id}
                onOpenNote={() => setViewTab('notes')}
              />
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Calls</h3>
                <LeadCallHistory leadId={viewLead.id} refreshKey={callHistoryKey} />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer: one Edit ── */}
        {onEdit && (
          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
            <button
              onClick={() => {
                onEdit(viewLead);
                onClose();
              }}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Pencil size={14} /> Edit lead
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

const CLOSED_STAGES = new Set([
  'done deal', 'won', 'lost', 'cancellation', 'not interested', 'duplicate leads', 'wrong number', 'closed number', 'low budget',
]);

/** "12 Nov 2026" in Cairo time ('—' when empty). */
function cairoDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T12:00:00Z` : v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "14:05" in Cairo time ('' when only a date is known). */
function cairoTime(v?: string | null) {
  if (!v || v.length <= 10) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
}

/** Status options grouped by meaning (colored dots come from StatusBadge). */
const STATUS_GROUPS: { label: string; stages: LeadStatus[] }[] = [
  { label: 'Pipeline', stages: ['Fresh Leads', 'Cold Calls', 'Pending Leads', 'Following Up', 'Meeting'] },
  { label: 'Positive', stages: ['Interested', 'Follow Up After Meeting', 'Reschedule Meeting', 'Reservation', 'Done Deal'] },
  { label: 'Negative', stages: ['Not Interested', 'Low Budget', 'Cancellation'] },
  { label: 'Unreachable', stages: ['No Answer', 'No Answer At All', 'Wrong Number', 'Closed Number'] },
  { label: 'Data', stages: ['Duplicate Leads', 'Data Rotation'] },
];

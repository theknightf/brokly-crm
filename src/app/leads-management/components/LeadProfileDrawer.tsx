'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  CalendarClock,
  Check,
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
  Building2,
  Tag,
  Plus,
  ClipboardList,
  Activity,
  MessageSquare,
  X,
} from 'lucide-react';
import { StatusPill } from '@/components/ui/StatusPill';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { leadsService, followUpsService } from '@/lib/services/crmService';
import type { Lead, LeadStatus } from './mockLeads';
import { PIPELINE_STAGES, OUTCOME_STAGES, pipelineIndex } from './leadStages';
import LeadNotesSection from './LeadNotesSection';
import RecommendedUnitsSection from './RecommendedUnitsSection';
import LeadTimeline from './LeadTimeline';

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
  const [viewTab, setViewTab] = useState<'overview' | 'activity' | 'units' | 'comments'>('overview');

  // A different lead opens on the Overview tab.
  useEffect(() => {
    setViewTab('overview');
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

  // Same names the markup used inside Leads Management, mapped to the callbacks.
  const setViewLead = (_: null) => onClose();
  const handleStatusChange = (id: string, s: LeadStatus) => onStatusChange(id, s);
  const handlePostCallTrigger = (l: Lead) => onCall?.(l);
  const setLogCallLead = (l: Lead) => onLogCall?.(l);
  const setEditLead = (l: Lead) => onEdit?.(l);
  const setDealModal = ({ lead: l, status }: { lead: Lead; status: 'Reservation' | 'Done Deal' }) => onDeal?.(l, status);
  const setPayPlanLead = (l: Lead) => onPayPlan?.(l);
  const handleWhatsAppAction = (l: Lead, outcome: string) => onWhatsAppAction?.(l, outcome);
  const fetchAndOpenSiteVisit = (l: Lead) => onSiteVisit?.(l);

  if (typeof document === 'undefined') return null;
  return createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={() => setViewLead(null)}
          />
          <div
            className="relative flex flex-col bg-card border-border shadow-modal w-full sm:max-w-lg sm:w-full sm:h-full sm:border-s sm:rounded-none rounded-t-2xl max-h-[85dvh] sm:max-h-full overflow-hidden animate-in fade-in slide-in-from-right-4"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border flex-shrink-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-lime-500/15 text-lime-700 dark:text-lime-300 flex items-center justify-center text-sm font-bold">
                  {viewLead.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2) || '—'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-foreground">
                      {viewLead.name || `Lead ${viewLead.id}`}
                    </h2>
                    <StatusPill status={viewLead.status || 'Fresh Leads'} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {viewLead.source && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground bg-muted rounded-full px-2 py-0.5">
                        <Tag size={11} className="text-primary" />
                        {viewLead.source}
                      </span>
                    )}
                    {viewLead.project && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground bg-muted rounded-full px-2 py-0.5">
                        <Building2 size={11} className="text-primary" />
                        {viewLead.project}
                      </span>
                    )}
                    {viewLead.developer && (
                      <span className="text-[11px] text-muted-foreground">
                        {viewLead.developer}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{viewLead.location || ''}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setViewLead(null)}
                aria-label="Close"
                className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-5">
              {/* Stage (pipeline status) — first thing a Sales user changes */}
              <div className="bg-zinc-500/10 border border-border rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground">Stage</p>
                  <StatusPill status={viewLead.status || 'Fresh Leads'} />
                </div>
                <div className="space-y-3">
                  {/* Forward pipeline stepper — progress bar with tappable stages */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                    {PIPELINE_STAGES.map((s, i) => {
                      const curIdx = pipelineIndex(viewLead.status);
                      const isActive = s === (viewLead.status || 'Fresh Leads');
                      const isDone = curIdx > -1 && i < curIdx;
                      return (
                        <React.Fragment key={`pipe-step-${viewLead.id}-${s}`}>
                          {i > 0 && (
                            <span
                              className={`h-0.5 w-3 flex-shrink-0 rounded-full ${
                                isDone ? 'bg-primary' : 'bg-border'
                              }`}
                            />
                          )}
                          <button
                            onClick={() => {
                              if (isActive) return;
                              handleStatusChange(viewLead.id, s);
                            }}
                            title={s}
                            className={`whitespace-nowrap shrink-0 px-3 h-9 rounded-full text-xs flex items-center gap-1.5 transition-all active:scale-[0.98] border ${
                              isActive
                                ? 'bg-primary text-primary-foreground border-primary font-semibold'
                                : isDone
                                ? 'text-lime-700 dark:text-lime-300 bg-lime-500/10 border-lime-500/40 hover:bg-lime-500/20 font-medium'
                                : 'text-foreground bg-card border-border hover:bg-muted font-medium'
                            }`}
                          >
                            {isActive ? (
                              <Check size={12} className="flex-shrink-0" />
                            ) : isDone ? (
                              <CheckCircle2 size={12} className="flex-shrink-0" />
                            ) : (
                              <span className="text-[10px] font-bold opacity-50">{i + 1}</span>
                            )}
                            {s}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Negative / terminal outcomes */}
                  <div className="flex flex-wrap gap-1.5">
                    {OUTCOME_STAGES.map((s) => {
                      const isActive = s === (viewLead.status || 'Fresh Leads');
                      return (
                        <button
                          key={`view-outcome-${viewLead.id}-${s}`}
                          onClick={() => {
                            if (isActive) return;
                            handleStatusChange(viewLead.id, s);
                          }}
                          className={`px-2.5 h-7 rounded-full text-[11px] border transition-all active:scale-[0.98] ${
                            isActive
                              ? 'bg-clay-soft text-clay border-clay/40 font-semibold'
                              : 'text-muted-foreground bg-card border-border hover:bg-muted font-medium'
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Primary actions — one-tap reach at the top */}
              <div className="grid grid-cols-2 gap-2">
                {viewLead.phone && (
                  <>
                    {onCall && (
                    <button
                      type="button"
                      onClick={() => handlePostCallTrigger(viewLead)}
                      className="h-11 rounded-xl bg-lime-500/15 text-lime-700 dark:text-lime-300 hover:bg-lime-500/25 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                    >
                      <PhoneCall size={15} />
                      Call
                    </button>
                    )}
                    <a
                      href={getWhatsAppLinkForLead(viewLead.phone, viewLead.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="h-11 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                    >
                      <MessageCircle size={16} />
                      WhatsApp
                    </a>
                  </>
                )}
                {onLogCall && (
                <button
                  onClick={() => setLogCallLead(viewLead)}
                  className="h-11 rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                >
                  <PhoneCall size={15} />
                  Log Call
                </button>
                )}
                {onEdit && (
                <button
                  onClick={() => {
                    setEditLead(viewLead);
                    setViewLead(null);
                  }}
                  className="h-11 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                >
                  <Pencil size={15} />
                  Edit
                </button>
                )}
              </div>

              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground -mb-2">Contact & details</h3>
              {/* Key info — most important fields, visible without scrolling */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: 'Phone',
                    value: viewLead.phone || '—',
                    href: viewLead.phone
                      ? `tel:${viewLead.phone.replace(/[^\d+]/g, '')}`
                      : undefined,
                  },
                  ...(viewLead.phone2
                    ? [
                        {
                          label: 'Phone 2',
                          value: viewLead.phone2,
                          href: `tel:${viewLead.phone2.replace(/[^\d+]/g, '')}`,
                        },
                      ]
                    : []),
                  { label: 'Email', value: viewLead.email || '—' },
                  { label: 'Source', value: viewLead.source || '—' },
                  { label: 'Project', value: viewLead.project || viewLead.developer || '—' },
                  { label: 'Agent', value: viewLead.agent || 'Unassigned' },
                  { label: 'Assigned To', value: (viewLead.assignedToNames && viewLead.assignedToNames.length > 0) ? viewLead.assignedToNames.join(' & ') : (viewLead.assignedToName || 'Unassigned') },
                  ...(viewLead.referredTo
                    ? [{ label: 'Referred To', value: viewLead.referredToName || 'Second user' }]
                    : []),
                  ...(viewLead.referredBy
                    ? [{ label: 'Referred By', value: viewLead.referredByName || 'Recorded user' }]
                    : []),
                ].map(({ label, value, href }) => (
                  <div key={label} className="bg-zinc-500/10 border border-border rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
                    {href ? (
                      <a href={href} className="text-sm font-semibold text-primary truncate block">
                        {value}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-foreground truncate">{value}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Next action date', value: viewLead.followUpDue || '—' },
                  { label: 'Priority', value: viewLead.priority || '—' },
                  { label: 'Rating', value: viewLead.leadRating || '—' },
                  { label: 'Team', value: viewLead.team || '—' },
                  { label: 'CS Agent', value: viewLead.csAgent || '—' },
                  ...(viewLead.developer
                    ? [{ label: 'Developer', value: viewLead.developer }]
                    : []),
                  ...(viewLead.project ? [{ label: 'Project', value: viewLead.project }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-500/10 border border-border rounded-xl px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              {viewLead.notes && (
                <div className="bg-zinc-500/10 border border-border rounded-xl px-3 py-2.5">
                  <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                  <p className="text-sm text-foreground">{viewLead.notes}</p>
                </div>
              )}

              {/* Schedule follow-up — synced to dashboard + follow-up partition */}
              <div className="bg-zinc-500/10 border border-border rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarClock size={12} /> Next action date
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input-base h-9 text-sm"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    aria-label="Next action date"
                  />
                  <input
                    type="time"
                    className="input-base h-9 text-sm"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    aria-label="Next action time"
                  />
                </div>
                <textarea
                  className="input-base min-h-[56px] text-sm resize-none"
                  placeholder="Notes (optional) — e.g. call about 2BHK in Sohna Road"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleScheduleFollowUp}
                  disabled={scheduleSaving || !scheduleDate}
                  className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {scheduleSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {scheduleSaving ? 'Saving…' : 'Save next action date'}
                </button>
                {viewLead.followUpDue && (
                  <p className="text-[11px] text-muted-foreground">Current: {viewLead.followUpDue} · queue auto-syncs to dashboard</p>
                )}
              </div>

              {onDeal && onPayPlan && (<>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground -mb-2">Deal & payment</h3>
              {/* Reservation / Done Deal quick actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDealModal({ lead: viewLead, status: 'Reservation' })}
                  disabled={viewLead.status === 'Reservation'}
                  className="h-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <BadgeCheck size={14} />
                  Reservation
                </button>
                <button
                  onClick={() => setDealModal({ lead: viewLead, status: 'Done Deal' })}
                  disabled={viewLead.status === 'Done Deal'}
                  className="h-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Handshake size={14} />
                  Done Deal
                </button>
              </div>

              {/* Payment plan summary */}
              {Number(viewLead.totalPrice) > 0 ? (
                <div className="bg-zinc-500/10 border border-border rounded-xl px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <p className="text-xs text-muted-foreground">Total price</p>
                  <p className="text-sm font-semibold text-foreground text-end tabular-nums">
                    EGP {Number(viewLead.totalPrice).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Down payment</p>
                  <p className="text-sm font-medium text-foreground text-end tabular-nums">
                    EGP {Number(viewLead.downPayment || 0).toLocaleString()}
                    {Number(viewLead.downPaymentPct) > 0 && (
                      <span className="text-xs text-muted-foreground ms-1">
                        ({Number(viewLead.downPaymentPct)}%)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Reservation</p>
                  <p className="text-sm font-medium text-foreground text-end tabular-nums">
                    EGP {Number(viewLead.reservationAmount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-sm font-medium text-foreground text-end tabular-nums">
                    EGP {Number(viewLead.remainingAmount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Installment</p>
                  <p className="text-sm font-medium text-foreground text-end tabular-nums">
                    EGP {Number(viewLead.installmentAmount || 0).toLocaleString()}
                    {Number(viewLead.installmentCount) > 0 && ` × ${viewLead.installmentCount}`}
                  </p>
                  {viewLead.reservationDate && (
                    <>
                      <p className="text-xs text-muted-foreground">Reservation date</p>
                      <p className="text-sm font-medium text-foreground text-end">
                        {viewLead.reservationDate}
                      </p>
                    </>
                  )}
                  {viewLead.closingDate && (
                    <>
                      <p className="text-xs text-muted-foreground">Closing date</p>
                      <p className="text-sm font-medium text-foreground text-end">
                        {viewLead.closingDate}
                      </p>
                    </>
                  )}
                  {Number(viewLead.commission) > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground">Commission</p>
                      <p className="text-sm font-medium text-foreground text-end tabular-nums">
                        EGP {Number(viewLead.commission).toLocaleString()}
                      </p>
                    </>
                  )}
                  {viewLead.paymentStatus && (
                    <>
                      <p className="text-xs text-muted-foreground">Payment status</p>
                      <p className="text-sm font-medium text-foreground text-end">
                        {viewLead.paymentStatus}
                      </p>
                    </>
                  )}
                  <div className="col-span-2 pt-1 border-t border-border">
                    <button
                      onClick={() => setPayPlanLead(viewLead)}
                      className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Pencil size={10} /> Edit payment plan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-500/10 border border-border rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">No payment plan added</p>
                  <button
                    onClick={() => setPayPlanLead(viewLead)}
                    className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus size={11} /> Add payment plan
                  </button>
                </div>
              )}
              </>)}

              {viewLead.phone && onWhatsAppAction && (
                <details className="bg-zinc-500/10 border border-border rounded-xl px-3 py-2.5 group" open>
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <MessageCircle size={11} />
                      WhatsApp Activity
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground group-open:hidden">
                      Expand
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hidden group-open:inline">
                      Collapse
                    </span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {[
                      {
                        label: 'WA Sent',
                        icon: <CheckCircle2 size={13} />,
                        cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25',
                        outcome: 'WhatsApp Sent',
                      },
                      {
                        label: 'Customer Replied',
                        icon: <ThumbsUp size={13} />,
                        cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25',
                        outcome: 'Customer Replied',
                      },
                      {
                        label: 'No Reply',
                        icon: <UserX size={13} />,
                        cls: 'bg-zinc-500/10 text-muted-foreground hover:bg-zinc-500/20',
                        outcome: 'No Reply',
                      },
                      {
                        label: 'WA Follow-up',
                        icon: <CalendarClock size={13} />,
                        cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25',
                        outcome: 'WhatsApp Follow-up',
                      },
                    ].map((a) => (
                      <button
                        key={a.outcome}
                        onClick={() => handleWhatsAppAction(viewLead, a.outcome)}
                        className={`w-full h-10 rounded-lg px-3 text-start text-sm font-medium flex items-center gap-2 active:scale-[0.98] transition-all ${
                          a.cls
                        }`}
                      >
                        {a.icon}
                        {a.label}
                      </button>
                    ))}
                  </div>
                </details>
              )}

              {/* Section tabs */}
              <div className="sticky top-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 py-2 bg-card border-b border-border flex gap-1 animate-in fade-in">
                {(
                  [
                    ['overview', 'Overview', ClipboardList],
                    ['activity', 'Activity', Activity],
                    ['units', 'Units', Building2],
                    ['comments', 'Notes', MessageSquare],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setViewTab(key)}
                    aria-pressed={viewTab === key}
                    className={`flex items-center gap-1.5 px-3 h-9 [@media(pointer:coarse)]:h-11 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      viewTab === key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              {viewTab === 'overview' && (
                <div className="space-y-4">
                  <LeadCallHistory leadId={viewLead.id} refreshKey={callHistoryKey} />
                </div>
              )}
              {viewTab === 'activity' && (
                <div className="space-y-4">
                  <LeadCallHistory leadId={viewLead.id} refreshKey={callHistoryKey} />
                  <LeadTimeline leadId={viewLead.id} />
                </div>
              )}
              {viewTab === 'units' && (
                <div className="space-y-4">
                  <RecommendedUnitsSection leadId={viewLead.id} />
                </div>
              )}
              {viewTab === 'comments' && (
                <div className="space-y-4">
                  <LeadNotesSection leadId={viewLead.id} leadNotes={viewLead.notes} />
                </div>
              )}
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-border flex items-center justify-between gap-2 flex-shrink-0">
              {onSiteVisit ? (
              <button
                onClick={() => fetchAndOpenSiteVisit(viewLead)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
                title="Start a GPS-verified site visit for this lead's project"
              >
                <MapPin size={14} />
                <span>Site Visit</span>
              </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setViewLead(null)} className="btn-secondary">
                  Close
                </button>
                {onEdit && (
                <button
                  onClick={() => {
                    setEditLead(viewLead);
                    setViewLead(null);
                  }}
                  className="btn-primary"
                >
                  Edit lead
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
    ,
    document.body
  );
}

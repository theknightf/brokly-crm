'use client';
import React, { useRef, useState } from 'react';
import {
  UserCheck,
  Pencil,
  Trash2,
  PhoneCall,
  MessageCircle,
  MapPin,
  ChevronDown,
  StickyNote,
  Plus,
  Check,
  ThumbsUp,
  PhoneOff,
  CalendarClock,
  Zap,
  Loader2,
  User,
  MessageSquare,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lead, LeadStatus } from './mockLeads';
import { PIPELINE_STAGES, OUTCOME_STAGES } from './leadStages';
import StatusBadge from '@/components/ui/StatusBadge';
import ContactedBadge, { ActionTakenBadge } from './ContactedBadge';
import CalledBadge from './CalledBadge';
import ViewportPopover from '@/components/ui/ViewportPopover';
import StageMenuList from './StageMenuList';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { daysFromToday, fmtAgo, fmtDate, fmtNextAction, isOverdue as isLeadOverdue } from '@/lib/cairoDate';

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
  onPostCall?: (lead: Lead) => void;
  /** Latest written note (time + one-line preview), fetched once per page by the list. */
  lastNote?: { at: string; preview: string } | null;
}

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

const QUICK_CHIPS: {
  key: string;
  label: string;
  icon: React.ReactNode;
  outcome: string;
}[] = [
  { key: 'sent', label: 'Sent', icon: <Check size={14} />, outcome: 'WhatsApp Sent' },
  { key: 'replied', label: 'Replied', icon: <ThumbsUp size={14} />, outcome: 'Customer Replied' },
  { key: 'noreply', label: 'No Reply', icon: <PhoneOff size={14} />, outcome: 'No Reply' },
  { key: 'follow', label: 'Follow-up', icon: <CalendarClock size={14} />, outcome: 'WhatsApp Follow-up' },
];

function MobileLeadCardInner({
  lead,
  selected,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenLogCall,
  onAddNote,
  onPostCall,
  lastNote,
}: MobileLeadCardProps) {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const nextOverdue = isLeadOverdue(lead.followUpDue, lead.status);
  const [statusOpen, setStatusOpen] = useState(false);
  const stageAnchorRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreAnchorRef = useRef<HTMLButtonElement>(null);
  const initials = getInitials(lead.name || '', lead.id?.toString().slice(0, 2));
  const overdue = isOverdue(lead.followUpDue);
  const budgetText = formatEgyBudget(lead.budgetMin, lead.budgetMax);

  // quick note
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const submitNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setNoteSaving(true);
    try {
      const { leadsService, leadCommentsService } = await import('@/lib/services/crmService');
      await Promise.all([
        leadsService.updateNotes(lead.id, text),
        leadCommentsService.create(lead.id, text, user?.id || '').catch(() => {}),
      ]);
      toast.success('Note added');
      setNoteText('');
      setNoteOpen(false);
      lead.notes = text;
      lead.actionTakenToday = true;
      lead.contactedToday = true;
      onAddNote?.(lead);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save note');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleChip = async (outcome: string) => {
    try {
      const res = await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'lead',
          entity_id: lead.id,
          contact_name: lead.name || '',
          contact_phone: lead.phone || '',
          channel: 'WhatsApp',
          direction: 'outgoing',
          outcome,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(outcome);
      lead.actionTakenToday = true;
      lead.contactedToday = true;
      onAddNote?.(lead);
    } catch {
      toast.error('Could not log status');
    }
  };

  const assignedText =
    lead.assignedToNames && lead.assignedToNames.length > 0 ? lead.assignedToNames.join(' & ') : lead.assignedToName || '';
  const actedToday = !!(lead.actionTakenToday ?? lead.contactedToday);
  const dueN = daysFromToday(lead.followUpDue);
  const dueTone = !lead.followUpDue
    ? 'border-dashed border-border text-muted-foreground'
    : nextOverdue
      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
      : dueN === 0
        ? 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300'
        : 'border-border bg-muted/40 text-foreground';
  const openLead = () => router.push(`/leads/${lead.id}`);
  const callLead = () => {
    if (!lead.phone) return;
    if (onPostCall) onPostCall(lead);
    else {
      onOpenLogCall?.(lead);
      window.location.href = `tel:${lead.phone.replace(/[^0-9+,]/g, '')}`;
    }
  };

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors ${
        selected ? 'border-primary ring-1 ring-primary/30' : nextOverdue ? 'border-red-500/30' : 'border-border'
      }`}
    >
      {/* 1. Who: select · avatar · name/phone (opens the lead page) · more */}
      <div className="flex items-center gap-1 ps-1 pe-1 pt-2">
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(lead.id, e.target.checked)}
            className="h-[18px] w-[18px] cursor-pointer rounded border-input accent-primary"
            aria-label={`${t('leads.colLead')}: ${lead.name || lead.phone || t('leads.noName')}`}
          />
        </label>
        <button
          type="button"
          onClick={openLead}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-start"
          aria-label={`${t('leads.open')}: ${lead.name || lead.phone || t('leads.noName')}`}
        >
          <span className="relative shrink-0" aria-hidden>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                lead.name?.trim() ? 'bg-lime-500/15 text-lime-700 dark:text-lime-300' : 'bg-muted text-muted-foreground'
              }`}
            >
              {lead.name?.trim() ? initials : <User size={18} />}
            </span>
            {actedToday && (
              <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" title={t('leads.actionToday')} />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-bold leading-tight text-foreground" dir="auto">
                {lead.name?.trim() || lead.phone || t('leads.noName')}
              </span>
              {isAdminRole(profile?.role) && lead.isDuplicate && (
                <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                  {t('leads.duplicate')}
                </span>
              )}
            </span>
            {lead.name?.trim() && lead.phone && (
              <span className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground" dir="ltr">
                {lead.phone}
              </span>
            )}
          </span>
        </button>
        <button
          ref={moreAnchorRef}
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <MoreVertical size={18} />
        </button>
      </div>

      {/* 2. Where it stands: stage (tap to change) · next action date */}
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-1.5" data-stage-row>
        <button
          ref={stageAnchorRef}
          type="button"
          onClick={() => setStatusOpen((o) => !o)}
          className="box-border inline-flex h-10 max-w-full items-center gap-1 rounded-full border border-border bg-card ps-1.5 pe-2.5 transition-transform active:scale-[0.98] hover:bg-muted"
          aria-label={`Stage: ${lead.status || 'Fresh Leads'}`}
          aria-expanded={statusOpen}
          aria-haspopup="listbox"
        >
          <span className="min-w-0 max-w-[180px] truncate">
            <StatusBadge status={lead.status || 'Fresh Leads'} showDot />
          </span>
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
        <span className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold tabular-nums ${dueTone}`}>
          <CalendarClock size={14} aria-hidden />
          {lead.followUpDue ? `${nextOverdue ? 'Overdue · ' : ''}${fmtNextAction(lead.followUpDue)}` : 'No next action'}
        </span>
      </div>

      {/* 3. Context: last note · owner · priority · assign date, then the note itself */}
      <div className="px-3.5 pt-2">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {lastNote?.at ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={11} aria-hidden /> {fmtAgo(lastNote.at)}
            </span>
          ) : (
            <span className={lead.hasBeenCalled ? '' : 'text-amber-600 dark:text-amber-400'}>
              {lead.hasBeenCalled ? t('leads.called') : t('leads.notCalled')}
            </span>
          )}
          {assignedText && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <UserCheck size={11} aria-hidden /> <span className="max-w-[120px] truncate">{assignedText}</span>
            </span>
          )}
          {lead.priority && lead.priority !== 'Normal' && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400">
              <Zap size={11} className="fill-current" aria-hidden /> {lead.priority}
            </span>
          )}
          {lead.assignedAt && <span className="text-muted-foreground/70">Assigned {fmtDate(lead.assignedAt)}</span>}
        </p>
        {lastNote?.preview ? (
          <p className="mt-1 truncate text-[13px] text-foreground/80" dir="auto">
            “{lastNote.preview}”
          </p>
        ) : lead.location?.trim() ? (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin size={12} className="shrink-0" /> {lead.location}
          </p>
        ) : null}
      </div>

      {/* Inline quick note */}
      {noteOpen && (
        <div className="flex items-center gap-2 px-3.5 pt-2.5">
          <input
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNote();
              if (e.key === 'Escape') {
                setNoteOpen(false);
                setNoteText('');
              }
            }}
            dir="auto"
            placeholder="Write a note…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-muted/40 px-3 text-base outline-none focus:border-primary"
          />
          <button
            onClick={submitNote}
            disabled={!noteText.trim() || noteSaving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
            aria-label="Save note"
          >
            {noteSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          </button>
        </div>
      )}

      {/* 4. Actions */}
      <div className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border rtl:divide-x-reverse">
        <button
          type="button"
          onClick={callLead}
          disabled={!lead.phone}
          className="flex h-12 items-center justify-center gap-1.5 text-sm font-semibold text-lime-700 transition-colors active:bg-muted disabled:opacity-40 dark:text-lime-300"
          aria-label={lead.phone ? `Call ${lead.phone}` : 'No phone'}
        >
          <PhoneCall size={16} /> Call
        </button>
        <a
          href={lead.phone ? getWhatsAppLinkForLead(lead.phone, lead.name) : undefined}
          target={lead.phone ? '_blank' : undefined}
          rel={lead.phone ? 'noreferrer' : undefined}
          onClick={(e) => {
            if (!lead.phone) e.preventDefault();
          }}
          className={`flex h-12 items-center justify-center gap-1.5 text-sm font-semibold text-foreground transition-colors active:bg-muted ${
            !lead.phone ? 'pointer-events-none opacity-40' : ''
          }`}
          aria-label="WhatsApp lead"
        >
          <MessageCircle size={16} className="text-[#25D366]" /> WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            setNoteOpen((o) => !o);
            if (noteOpen) setNoteText('');
          }}
          aria-expanded={noteOpen}
          className={`flex h-12 items-center justify-center gap-1.5 text-sm font-semibold transition-colors active:bg-muted ${
            noteOpen ? 'text-primary' : 'text-foreground'
          }`}
        >
          <StickyNote size={16} /> Note
        </button>
      </div>

      {/* Stage menu (bottom sheet on phones) */}
      {statusOpen && (
        <ViewportPopover
          open={statusOpen}
          onClose={() => setStatusOpen(false)}
          anchorRef={stageAnchorRef}
          minWidth={260}
          preferredMaxHeight={400}
          zIndex={100}
          role="listbox"
          aria-label="Select stage"
          className="stage-dropdown-panel"
        >
          <StageMenuList
            current={lead.status || 'Fresh Leads'}
            keyPrefix={`mob-stage-${lead.id}`}
            onPick={(s) => {
              setStatusOpen(false);
              if (s) onStatusChange(lead.id, s);
            }}
          />
        </ViewportPopover>
      )}

      {/* More: WhatsApp result, open, edit, delete (bottom sheet on phones) */}
      {moreOpen && (
        <ViewportPopover open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreAnchorRef} align="end" minWidth={240} zIndex={100} role="menu">
          <div className="py-1">
            <p className="truncate px-4 pt-1 pb-2 text-sm font-bold text-foreground" dir="auto">
              {lead.name?.trim() || lead.phone || t('leads.noName')}
            </p>
            {lead.phone && (
              <>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp result</p>
                <div className="grid grid-cols-2 gap-2 px-3 pb-2">
                  {QUICK_CHIPS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        void handleChip(c.outcome);
                      }}
                      className="flex h-11 items-center gap-1.5 rounded-xl bg-sky-500/10 px-3 text-xs font-semibold text-sky-700 active:scale-95 dark:text-sky-300"
                    >
                      {c.icon}
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="my-1 border-t border-border/60" />
              </>
            )}
            {[
              { key: 'open', label: 'Open lead', icon: <ExternalLink size={16} />, run: openLead, danger: false },
              { key: 'edit', label: 'Edit lead', icon: <Pencil size={16} />, run: () => onEdit(lead), danger: false },
              ...(isAdminRole(profile?.role)
                ? [{ key: 'delete', label: 'Delete lead', icon: <Trash2 size={16} />, run: () => onDelete(lead.id), danger: true }]
                : []),
            ].map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  a.run();
                }}
                className={`flex min-h-[48px] w-full items-center gap-3 px-4 text-start text-sm font-medium hover:bg-muted ${
                  a.danger ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </ViewportPopover>
      )}
    </article>
  );
}

const MobileLeadCard = React.memo(MobileLeadCardInner, (prev, next) => {
  return (
    prev.lead === next.lead &&
    prev.selected === next.selected &&
    prev.lastNote?.at === next.lastNote?.at
  );
});

export default MobileLeadCard;

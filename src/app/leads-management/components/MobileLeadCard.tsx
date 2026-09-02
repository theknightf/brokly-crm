'use client';
import React, { useState } from 'react';
import {
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
} from 'lucide-react';
import { toast } from 'sonner';
import { Lead, LeadStatus } from './mockLeads';
import { PIPELINE_STAGES, OUTCOME_STAGES } from './leadStages';
import StatusBadge from '@/components/ui/StatusBadge';
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
      const res = await fetch('/api/lead-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, body: text, user_id: user?.id || '' }),
      });
      if (!res.ok) {
        const { leadCommentsService } = await import('@/lib/services/crmService');
        await leadCommentsService.create(lead.id, text, user?.id || '');
      }
      toast.success('Note added');
      setNoteText('');
      setNoteOpen(false);
      onAddNote?.(lead);
    } catch {
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
    } catch {
      toast.error('Could not log status');
    }
  };

  // compact hidden checkbox — still accessible for bulk select, but not prominent per reference
  return (
    <div
      className={`bg-card dark:bg-card border rounded-2xl shadow-sm overflow-hidden transition-all ${
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      }`}
    >
      {/* Hidden bulk checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(lead.id, e.target.checked)}
        className="sr-only"
        aria-label={`Select ${lead.name || lead.id}`}
      />

      {/* 1. Header Section */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        {/* Left: avatar + name/location */}
        <button
          onClick={() => onView(lead)}
          className="flex items-start gap-3 min-w-0 flex-1 text-left"
          aria-label={`Open ${lead.name || lead.id}`}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[15px] font-bold flex-shrink-0"
            style={{ backgroundColor: '#48bb78' }}
          >
            {initials}
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="font-bold text-foreground text-[15px] leading-tight truncate">
              {lead.name || `Lead ${lead.id}`}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin size={12} className="flex-shrink-0" />
              <span className="truncate">{lead.location || '—'}</span>
            </p>
          </div>
        </button>

        {/* Right: edit/delete + budget */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(lead)}
              className="w-9 h-9 rounded-xl bg-muted/60 dark:bg-muted hover:bg-muted dark:hover:bg-muted/80 text-muted-foreground flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Edit lead"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => onDelete(lead.id)}
              className="w-9 h-9 rounded-xl bg-muted/60 dark:bg-muted hover:bg-red-500/10 dark:hover:bg-red-500/20 text-muted-foreground hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Delete lead"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <p className="text-sm font-bold text-foreground tabular-nums" dir="ltr">
            {budgetText}
          </p>
        </div>
      </div>

      {/* 2. Status & Pipeline Pills Row */}
      <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
        {/* Stage selector dropdown pill — light bright green */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-bold border active:scale-[0.98] transition-transform bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
            aria-label={`Stage: ${lead.status || 'Fresh Leads'}`}
          >
            <span className="truncate max-w-[110px]">{lead.status || 'Fresh Leads'}</span>
            <ChevronDown size={13} className="flex-shrink-0" />
          </button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} aria-hidden />
              <div className="absolute left-0 top-full mt-1 z-40 flex flex-col bg-card dark:bg-card border border-border rounded-xl shadow-xl min-w-[240px] py-1 max-h-80 overflow-y-auto">
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
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center min-h-[44px] ${
                      s === lead.status ? 'bg-emerald-50' : ''
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
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center min-h-[44px] ${
                      s === lead.status ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <StatusBadge status={s} showDot />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status badge — darker green pill with lightning */}
        <span
          className="inline-flex items-center gap-1 h-9 px-3.5 rounded-full text-xs font-bold text-white dark:text-white"
          style={{ backgroundColor: '#2f855a' }}
        >
          <Zap size={13} className="fill-white" />
          <span className="truncate max-w-[110px]">{lead.status || 'Pending Leads'}</span>
        </span>
      </div>

      {/* 3. Primary Communication Actions — Call dials directly */}
      <div className="px-4 pt-3 grid grid-cols-2 gap-3">
        {lead.phone ? (
          <a
            href={`tel:${lead.phone.replace(/[^0-9+,]/g, '')}`}
            onClick={() => onOpenLogCall?.(lead)}
            className="h-11 rounded-xl border border-border bg-card dark:bg-card hover:bg-muted/40 dark:hover:bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            aria-label={`Call ${lead.phone}`}
          >
            <PhoneCall size={16} className="text-muted-foreground" />
            Call
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="h-11 rounded-xl border border-border bg-muted text-muted-foreground text-sm font-semibold flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
            aria-label="No phone"
          >
            <PhoneCall size={16} />
            Call
          </button>
        )}
        <a
          href={lead.phone ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}` : undefined}
          target={lead.phone ? '_blank' : undefined}
          rel={lead.phone ? 'noreferrer' : undefined}
          onClick={(e) => {
            if (!lead.phone) e.preventDefault();
          }}
          className={`h-11 rounded-xl border border-border bg-card dark:bg-card hover:bg-muted/40 dark:hover:bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
            !lead.phone ? 'opacity-50 pointer-events-none' : ''
          }`}
          aria-label="WhatsApp lead"
        >
          <MessageCircle size={16} className="text-[#25D366] dark:text-[#25D366]" />
          WhatsApp
        </a>
      </div>

      {/* 4. Quick Status Chips — horizontal flex, no layout shift */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => handleChip(c.outcome)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[#eaf4ff] dark:bg-sky-900/30 hover:bg-[#dbeafe] dark:hover:bg-sky-800/40 text-[#2b5c8a] dark:text-sky-300 text-xs font-semibold whitespace-nowrap flex-shrink-0 active:scale-95 transition-transform border border-[#dbeafe] dark:border-sky-800/50"
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Bottom Footer Bar */}
      <div className="mt-3 px-4 py-3 flex items-center justify-between gap-3 border-t border-border/60 bg-card dark:bg-card">
        <p className="text-xs flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground">Follow-up:</span>
          <span className={`font-bold tabular-nums ${overdue ? 'text-red-500' : 'text-red-500'}`}>
            {formatFollowUpShort(lead.followUpDue)}
          </span>
          {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
        </p>

        {!noteOpen ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-transform flex-shrink-0 h-9 px-2"
            aria-label="Add note"
          >
            <span className="relative flex items-center justify-center">
              <StickyNote size={14} />
              <Plus size={8} className="absolute -top-1 -right-1 bg-foreground text-background rounded-full p-px" />
            </span>
            Add Note
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
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
              placeholder="Note..."
              className="flex-1 min-w-0 h-9 rounded-full bg-muted px-3 text-xs outline-none border border-transparent focus:border-primary"
            />
            <button
              onClick={submitNote}
              disabled={!noteText.trim() || noteSaving}
              className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
              aria-label="Save note"
            >
              {noteSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              onClick={() => {
                setNoteOpen(false);
                setNoteText('');
              }}
              className="h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
              aria-label="Cancel note"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

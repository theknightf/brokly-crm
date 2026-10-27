'use client';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Eye,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Users,
  UserCheck,
  Zap,
  User,
  Copy,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus } from './mockLeads';
import {
  PIPELINE_STAGES,
  OUTCOME_STAGES,
  nextPipelineStage,
} from './leadStages';
import EmptyState from '@/components/ui/EmptyState';
import { LeadQuickActions } from '@/components/mobile/LeadQuickActions';
import MobileLeadCard from './MobileLeadCard';
import ViewportPopover from '@/components/ui/ViewportPopover';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { useLanguage } from '@/contexts/LanguageContext';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';

interface LeadsTableProps {
  leads: Lead[];
  allLeads: Lead[];
  selectedIds: Set<string>;
  sortKey: keyof Lead;
  sortDir: 'asc' | 'desc';
  onSort: (key: keyof Lead) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onDelete: (id: string) => void;
  onView?: (lead: Lead) => void;
  onEdit?: (lead: Lead) => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Mobile-only: open the Log Call modal for a lead (e.g. header quick action) */
  onOpenLogCall?: (lead: Lead) => void;
  /** Mobile-only: open the Add Note sheet for a lead */
  onAddNote?: (lead: Lead) => void;
  onPostCall?: (lead: Lead) => void;
  /** First load in flight: render skeleton rows instead of the empty state. */
  loading?: boolean;
  /** Any filter/search active: the empty state offers a "clear filters" CTA. */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span
      className={`ms-1 inline-flex flex-col ${active ? 'text-primary' : 'text-muted-foreground'}`}
    >
      <ChevronUp size={10} className={active && dir === 'asc' ? 'text-primary' : ''} />
      <ChevronDown
        size={10}
        className={active && dir === 'desc' ? 'text-primary' : ''}
        style={{ marginTop: '-2px' }}
      />
    </span>
  );
}

function StageSelector({
  leadId,
  currentStatus,
  onStatusChange,
  compact = false,
}: {
  leadId: string;
  currentStatus: LeadStatus;
  onStatusChange: (id: string, s: LeadStatus) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center gap-1 rounded-full transition-colors text-start max-w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
          compact
            ? 'min-h-[28px] px-0.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/5 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-2'
            : 'min-h-[44px] px-3 py-2 rounded-lg hover:bg-muted'
        }`}
        aria-label={`Change status from ${currentStatus}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0">
          <StatusBadge status={currentStatus} />
        </span>
        <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
      </button>
      {open && (
        <ViewportPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          minWidth={250}
          preferredMaxHeight={380}
          zIndex={100}
          role="listbox"
          aria-label="Select stage"
          className="stage-dropdown-panel"
        >
        <div className="py-1">
          <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Pipeline
          </p>
          {PIPELINE_STAGES.map((s) => (
            <button
              key={`status-opt-${leadId}-${s}`}
              role="option"
              aria-selected={s === currentStatus}
              onClick={() => {
                onStatusChange(leadId, s as LeadStatus);
                setOpen(false);
              }}
              className={`w-full text-start px-3.5 py-2.5 text-sm hover:bg-muted transition-colors min-h-[44px] flex items-center whitespace-normal break-words box-border ${
                s === currentStatus ? 'bg-secondary/70 font-semibold' : ''
              }`}
            >
              <StatusBadge status={s} showDot />
            </button>
          ))}
          <div className="my-1 border-t border-border/60" />
          <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Outcomes
          </p>
          {OUTCOME_STAGES.map((s) => (
            <button
              key={`status-opt-${leadId}-${s}`}
              role="option"
              aria-selected={s === currentStatus}
              onClick={() => {
                onStatusChange(leadId, s as LeadStatus);
                setOpen(false);
              }}
              className={`w-full text-start px-3.5 py-2.5 text-sm hover:bg-muted transition-colors min-h-[44px] flex items-center whitespace-normal break-words box-border ${
                s === currentStatus ? 'bg-secondary/70 font-semibold' : ''
              }`}
            >
              <StatusBadge status={s} showDot />
            </button>
          ))}
        </div>
        </ViewportPopover>
      )}
    </>
  );
}

const StatusDropdown = StageSelector;

// ─── Formatting helpers (localized) ──────────────────────────────────────────

function localeOf(lang: string) {
  return lang === 'ar' ? 'ar-EG' : 'en-GB';
}

function timeAgo(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
  return rtf.format(Math.round(diff / (86400 * 365)), 'year');
}

function shortDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: '2-digit' });
}

const isOverdue = (dueDate?: string) => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

const ICON_BTN =
  'w-8 h-8 rounded-lg text-zinc-500 dark:text-zinc-400 transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:opacity-30 disabled:cursor-not-allowed [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11';

/** Shared dense cell: tight padding, hairline divider (white/5 on the obsidian theme). */
const TD = 'px-3 py-2 text-[13px] text-foreground whitespace-nowrap border-b border-black/5 dark:border-white/5';

function formatBudgetRange(min?: number, max?: number): string {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  if (!a && !b) return '';
  if (a && b && a !== b) return `${a.toLocaleString()}–${b.toLocaleString()}`;
  return (b || a).toLocaleString();
}

interface LeadTableRowProps {
  lead: Lead;
  isSelected: boolean;
  canDelete: boolean;
  onSelectRow: (id: string, checked: boolean) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onView?: (lead: Lead) => void;
  onEdit?: (lead: Lead) => void;
  onDeletePrompt: (id: string) => void;
  onPostCall?: (lead: Lead) => void;
  onOpenLogCall?: (lead: Lead) => void;
}

const LeadTableRow = React.memo(function LeadTableRow({
  lead,
  isSelected,
  canDelete,
  onSelectRow,
  onStatusChange,
  onView,
  onEdit,
  onDeletePrompt,
  onPostCall,
  onOpenLogCall,
}: LeadTableRowProps) {
  const { t, lang } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);

  const name = (lead.name || '').trim();
  const hasName = !!name;
  const title = hasName ? name : lead.phone || t('leads.noName');
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  const agentNames: string[] =
    lead.assignedToNames && lead.assignedToNames.length > 0
      ? lead.assignedToNames
      : lead.assignedToName
        ? lead.assignedToName.split(' & ')
        : lead.agent
          ? [lead.agent]
          : [];
  const agentFirst = agentNames[0] || '';
  const agentInitials =
    agentFirst
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || '';

  const overdue = isOverdue(lead.followUpDue);
  const called = !!lead.hasBeenCalled;
  const hasPhone = !!(lead.phone && lead.phone.replace(/\D/g, ''));
  const next = nextPipelineStage(lead.status);
  const shortId = String(lead.id || '').replace(/-/g, '').slice(0, 6);
  const budget = formatBudgetRange(lead.budgetMin, lead.budgetMax);
  const hot = !!lead.priority && lead.priority !== 'Normal';

  const tooltip = [
    lead.createdAt ? `${t('leads.colCreated')}: ${shortDate(lead.createdAt, lang)}` : '',
    lead.followUpDue
      ? `${t('leads.colFollowUp')}: ${shortDate(lead.followUpDue, lang)}${overdue ? ` (${t('leads.overdue')})` : ''}`
      : '',
    lead.email ? String(lead.email) : '',
    lead.location ? String(lead.location) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const rowBg = isSelected
    ? 'bg-lime-50 dark:bg-[#141a0c]'
    : 'bg-white dark:bg-[#0a0a0f] group-hover:bg-zinc-50 dark:group-hover:bg-[#12121a]';
  const accentBar = isSelected
    ? 'shadow-[inset_3px_0_0_#a3e635] rtl:shadow-[inset_-3px_0_0_#a3e635]'
    : 'group-hover:shadow-[inset_2px_0_0_#a3e635] rtl:group-hover:shadow-[inset_-2px_0_0_#a3e635]';

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const handleCall = () => {
    if (onPostCall) onPostCall(lead);
    else if (hasPhone) window.location.href = `tel:${lead.phone.replace(/[^0-9+]/g, '')}`;
  };

  const menuItem =
    'w-full text-start px-3.5 py-2 text-sm hover:bg-muted min-h-[40px] flex items-center gap-2 focus:outline-none focus-visible:bg-muted';

  return (
    <tr className="group">
      <td className={`${TD} sticky start-0 z-[1] w-9 ${rowBg} ${accentBar}`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectRow(lead.id, e.target.checked)}
          className="w-4 h-4 rounded border-input accent-lime-500 cursor-pointer"
          aria-label={`${t('leads.colLead')}: ${title}`}
        />
      </td>

      {/* Lead identity & source */}
      <td className={`${TD} sticky start-9 z-[1] min-w-[250px] border-e border-black/5 dark:border-white/5 ${rowBg}`} title={tooltip}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
              hasName
                ? 'bg-lime-500/15 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300'
                : 'bg-zinc-200 text-zinc-500 dark:bg-white/5 dark:text-zinc-400'
            }`}
            aria-hidden
          >
            {hasName ? initials : <User size={15} />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <a
                href={`/leads/${lead.id}`}
                className="font-semibold text-[13px] text-zinc-900 dark:text-zinc-50 truncate max-w-[170px] hover:text-lime-600 dark:hover:text-lime-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 rounded"
              >
                {title}
              </a>
              {shortId && (
                <button
                  type="button"
                  onClick={() => copyText(lead.id, t('leads.idCopied'))}
                  title={`${t('leads.copyId')} (${lead.id})`}
                  aria-label={t('leads.copyId')}
                  className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-lime-600 dark:hover:text-lime-400 rounded px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                >
                  #{shortId}
                </button>
              )}
              {hot && <Zap size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" aria-label={String(lead.priority)} />}
              {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title={t('leads.overdue')} />}
              {canDelete && lead.isDuplicate && (
                <span className="flex-shrink-0 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 text-[10px] font-semibold px-1.5">
                  {t('leads.duplicate')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[250px]">
              {lead.source || (hasName ? '' : t('leads.noName'))}
            </p>
          </div>
        </div>
      </td>

      {/* Contact number */}
      <td className={TD}>
        {hasPhone && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-zinc-600 dark:text-zinc-300">
            <Phone size={12} className="text-lime-600 dark:text-lime-400 flex-shrink-0" />
            <span dir="ltr">{lead.phone}</span>
            <button
              type="button"
              onClick={() => copyText(lead.phone, t('leads.phoneCopied'))}
              title={t('leads.copyPhone')}
              aria-label={t('leads.copyPhone')}
              className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
            >
              <Copy size={12} />
            </button>
          </span>
        )}
      </td>

      {/* Status / stage */}
      <td className={TD}>
        <StatusDropdown
          currentStatus={lead.status || 'Fresh Leads'}
          leadId={lead.id}
          onStatusChange={onStatusChange}
          compact
        />
      </td>

      {/* Project & budget */}
      <td className={`${TD} min-w-[170px]`}>
        {lead.project || budget ? (
          <div className="leading-tight">
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[190px]">
              {lead.project || lead.propertyType || ''}
            </p>
            {(lead.unit || (lead.project && lead.propertyType)) && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[190px]">
                {lead.unit || lead.propertyType}
              </p>
            )}
            {budget && (
              <p className="text-[11px] font-semibold tabular-nums text-lime-700 dark:text-lime-300">
                {budget} {t('leads.egp')}
              </p>
            )}
          </div>
        ) : null}
      </td>

      {/* Assigned agent */}
      <td className={TD}>
        {agentFirst ? (
          <div className="flex items-center gap-2" title={agentNames.join(', ')}>
            <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {agentInitials}
            </span>
            <span className="text-[13px] truncate max-w-[110px]">{agentFirst}</span>
            {agentNames.length > 1 && (
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 rounded-full px-1.5">
                +{agentNames.length - 1}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('leads.unassigned')}</span>
        )}
      </td>

      {/* Last contact */}
      <td className={TD}>
        <div className="leading-tight" title={lead.lastActionAt ? new Date(lead.lastActionAt).toLocaleString(localeOf(lang)) : undefined}>
          <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
            {lead.lastActionAt ? timeAgo(lead.lastActionAt, lang) : <span className="font-normal text-zinc-500 dark:text-zinc-400">{t('leads.noAction')}</span>}
          </p>
          <p className={`text-[11px] ${called ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {called ? t('leads.called') : t('leads.notCalled')}
          </p>
        </div>
      </td>

      {/* Quick actions */}
      <td className={`${TD} w-[170px]`}>
        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={handleCall}
            disabled={!hasPhone}
            title={t('leads.call')}
            aria-label={`${t('leads.call')}: ${title}`}
            className={`${ICON_BTN} hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400`}
          >
            <Phone size={15} />
          </button>
          {hasPhone ? (
            <a
              href={getWhatsAppLinkForLead(lead.phone, lead.name)}
              target="_blank"
              rel="noopener noreferrer"
              title={t('leads.whatsapp')}
              aria-label={`${t('leads.whatsapp')}: ${title}`}
              className={`${ICON_BTN} hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400`}
            >
              <MessageCircle size={15} />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onView?.(lead)}
            title={t('leads.viewProfile')}
            aria-label={`${t('leads.viewProfile')}: ${title}`}
            className={`${ICON_BTN} hover:bg-lime-500/10 hover:text-lime-600 dark:hover:text-lime-400`}
          >
            <Eye size={15} />
          </button>
          <button
            ref={menuAnchorRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title={t('leads.more')}
            aria-label={t('leads.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`${ICON_BTN} hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-foreground`}
          >
            <MoreHorizontal size={15} />
          </button>
          {menuOpen && (
            <ViewportPopover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              anchorRef={menuAnchorRef}
              minWidth={210}
              preferredMaxHeight={300}
              zIndex={100}
              role="menu"
              aria-label={t('leads.more')}
              className="stage-dropdown-panel"
            >
              <div className="py-1">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit?.(lead);
                  }}
                  className={menuItem}
                >
                  <Pencil size={14} /> {t('leads.editQuick')}
                </button>
                {next && next !== lead.status && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatusChange(lead.id, next);
                    }}
                    className={menuItem}
                  >
                    <Zap size={14} /> {t('leads.advanceTo', { stage: next })}
                  </button>
                )}
                {onOpenLogCall && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenLogCall(lead);
                    }}
                    className={menuItem}
                  >
                    <Phone size={14} /> {t('leads.logCall')}
                  </button>
                )}
                {canDelete && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePrompt(lead.id);
                    }}
                    className={`${menuItem} text-red-500 hover:bg-red-500/10`}
                  >
                    <Trash2 size={14} /> {t('leads.delete')}
                  </button>
                )}
              </div>
            </ViewportPopover>
          )}
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  return (
    prev.lead === next.lead &&
    prev.isSelected === next.isSelected &&
    prev.canDelete === next.canDelete
  );
});

function SkeletonRows({ count = 14 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={`sk-${i}`} aria-hidden>
          <td className={`${TD} sticky start-0 bg-white dark:bg-[#0a0a0f]`}>
            <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-white/10 animate-pulse" />
          </td>
          <td className={`${TD} sticky start-9 bg-white dark:bg-[#0a0a0f] border-e border-black/5 dark:border-white/5`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-white/10 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-zinc-200 dark:bg-white/10 animate-pulse" />
                <div className="h-2.5 w-20 rounded bg-zinc-200/70 dark:bg-white/5 animate-pulse" />
              </div>
            </div>
          </td>
          {[112, 88, 120, 96, 72].map((w, c) => (
            <td key={c} className={TD}>
              <div className="h-4 rounded-full bg-zinc-200 dark:bg-white/10 animate-pulse" style={{ width: `${w}px` }} />
            </td>
          ))}
          <td className={TD}>
            <div className="h-7 w-32 rounded-lg bg-zinc-200 dark:bg-white/10 animate-pulse mx-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function LeadsTable({
  leads,
  selectedIds,
  sortKey,
  sortDir,
  onSort,
  onSelectAll,
  onSelectRow,
  onStatusChange,
  onDelete,
  onView,
  onEdit,
  currentPage,
  totalPages,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  onOpenLogCall,
  onAddNote,
  onPostCall,
  loading = false,
  hasActiveFilters = false,
  onClearFilters,
}: LeadsTableProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const canDelete = isAdminRole(user?.role);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  const handleDeleteConfirm = () => {
    if (deletingId && canDelete) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  };

  const TH =
    'sticky top-0 z-[2] px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-[#12121a] border-b border-black/5 dark:border-white/10 whitespace-nowrap';
  const sortableCol = (label: string, key: keyof Lead, extra = '') => (
    <th
      className={`${TH} ${extra}`}
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(key)}
        className="flex items-center gap-0.5 uppercase tracking-wider hover:text-lime-600 dark:hover:text-lime-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 rounded"
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </button>
    </th>
  );
  const plainCol = (label: string, extra = '') => <th className={`${TH} ${extra}`}>{label}</th>;

  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);
  const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US');

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++)
      pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const [renderLimit, setRenderLimit] = useState(50);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Reset render window whenever page or dataset changes
  useEffect(() => {
    setRenderLimit(50);
  }, [leads, currentPage]);

  // Progressive expansion: the table body scrolls inside its own container (sticky
  // header) AND the page may scroll, so listen to both.
  useEffect(() => {
    if (renderLimit >= leads.length) return;
    let ticking = false;
    const check = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const el = scrollerRef.current;
        const nearInner = el ? el.scrollHeight - (el.scrollTop + el.clientHeight) < 500 : false;
        const nearPage =
          document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 700;
        if (nearInner || nearPage) {
          setRenderLimit((prev) => Math.min(prev + 50, leads.length));
        }
      });
    };
    const el = scrollerRef.current;
    window.addEventListener('scroll', check, { passive: true });
    el?.addEventListener('scroll', check, { passive: true });
    return () => {
      window.removeEventListener('scroll', check);
      el?.removeEventListener('scroll', check);
    };
  }, [renderLimit, leads.length]);

  const visibleLeads = leads.slice(0, renderLimit);

  // Stable callbacks to avoid breaking React.memo on 500 rows
  const handleDeletePrompt = useCallback((id: string) => {
    setDeletingId(id);
  }, []);

  const emptyFn = useCallback(() => {}, []);
  const safeOnView = onView ?? emptyFn;
  const safeOnEdit = onEdit ?? emptyFn;

  const emptyState = (
    <EmptyState
      icon={<Users size={24} className="text-muted-foreground" />}
      title={hasActiveFilters ? t('leads.noResults') : t('leads.noLeads')}
      description={hasActiveFilters ? t('leads.noResultsHint') : ''}
      action={
        hasActiveFilters && onClearFilters ? (
          <button type="button" onClick={onClearFilters} className="btn-primary h-11">
            {t('leads.clearFilters')}
          </button>
        ) : undefined
      }
    />
  );

  return (
    <>
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setDeletingId(null)}
          />
          <div className="relative bg-card border border-border rounded-2xl shadow-modal p-6 max-w-sm w-full fade-in">
            <h3 className="text-base font-semibold text-foreground mb-2">Delete this lead?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              This action cannot be undone. The lead and all associated follow-ups will be
              permanently removed.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingId(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} className="btn-danger">
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile full-width card list — safe-area aware so the last card never hides behind the nav / AI button */}
      <div
        className="sm:hidden flex flex-col gap-4 px-1 pt-2 pb-32"
        style={{ paddingBottom: 'max(8rem, calc(7rem + env(safe-area-inset-bottom)))' }}
      >
        {loading && leads.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={`msk-${i}`} className="h-44 rounded-2xl bg-muted animate-pulse" aria-hidden />
          ))
        ) : leads.length === 0 ? (
          emptyState
        ) : (
          visibleLeads.map((lead) => (
            <MobileLeadCard
              key={lead.id}
              lead={lead}
              selected={selectedIds.has(lead.id)}
              onSelect={onSelectRow}
              onView={safeOnView}
              onEdit={safeOnEdit}
              onDelete={handleDeletePrompt}
              onStatusChange={onStatusChange}
              onOpenLogCall={onOpenLogCall}
              onAddNote={onAddNote}
              onPostCall={onPostCall}
            />
          ))
        )}
        {visibleLeads.length < leads.length && (
          <div className="py-3 text-center flex flex-col items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('leads.showing', {
                from: nf.format(1),
                to: nf.format(visibleLeads.length),
                total: nf.format(leads.length),
              })}
            </span>
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => Math.min(prev + 50, leads.length))}
              className="min-h-[44px] text-sm text-primary font-medium hover:underline py-1 px-4 rounded-lg border border-lime-500/20 bg-lime-500/5 active:scale-95 transition-all"
            >
              +50
            </button>
          </div>
        )}
      </div>

      {/* Desktop dense table — obsidian surface, hairline borders, neon-lime accents */}
      <div className="hidden sm:flex sm:flex-col sm:flex-1 sm:min-h-0 bg-white dark:bg-[#0a0a0f]">
        <div className="flex items-center justify-between gap-3 px-4 py-2 shrink-0 border-b border-black/5 dark:border-white/10 bg-white dark:bg-[#12121a]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t('leads.title')}</h2>
            <span
              className="rounded-full bg-lime-500/15 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300 border border-lime-500/25 text-[11px] font-bold px-2 py-0.5 tabular-nums"
              aria-label={`${t('leads.total')}: ${nf.format(totalCount)}`}
            >
              {nf.format(totalCount)}
            </span>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label={t('leads.sortBy')}>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 me-1">{t('leads.sortBy')}</span>
            {(
              [
                { key: 'createdAt', label: t('leads.colCreated') },
                { key: 'followUpDue', label: t('leads.colFollowUp') },
              ] as { key: keyof Lead; label: string }[]
            ).map((s) => (
              <button
                key={String(s.key)}
                type="button"
                onClick={() => onSort(s.key)}
                aria-pressed={sortKey === s.key}
                className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
                  sortKey === s.key
                    ? 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300'
                    : 'border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-lime-500/40'
                }`}
              >
                {s.label}
                {sortKey === s.key && <SortIcon active dir={sortDir} />}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="overflow-auto flex-1 min-h-[240px]"
          tabIndex={0}
          aria-label={t('leads.title')}
        >
          <table className="w-full min-w-[1180px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${TH} w-9 start-0 z-[3]`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-input accent-lime-500 cursor-pointer"
                    aria-label={t('leads.selectAll')}
                  />
                </th>
                {sortableCol(t('leads.colIdentity'), 'name', 'start-9 z-[3] min-w-[250px] border-e border-black/5 dark:border-white/5')}
                {plainCol(t('leads.colContactNumber'))}
                {sortableCol(t('leads.colStage'), 'status')}
                {sortableCol(t('leads.colProject'), 'budgetMin')}
                {sortableCol(t('leads.colAssigned'), 'agent')}
                {plainCol(t('leads.colLastContact'))}
                {plainCol(t('leads.colQuick'), 'text-center')}
              </tr>
            </thead>
            <tbody>
              {loading && leads.length === 0 ? (
                <SkeletonRows />
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8}>{emptyState}</td>
                </tr>
              ) : (
                visibleLeads.map((lead) => (
                  <LeadTableRow
                    key={lead.id}
                    lead={lead}
                    isSelected={selectedIds.has(lead.id)}
                    canDelete={canDelete}
                    onSelectRow={onSelectRow}
                    onStatusChange={onStatusChange}
                    onView={safeOnView}
                    onEdit={safeOnEdit}
                    onDeletePrompt={handleDeletePrompt}
                    onPostCall={onPostCall}
                    onOpenLogCall={onOpenLogCall}
                  />
                ))
              )}
              {visibleLeads.length < leads.length && (
                <tr>
                  <td colSpan={8} className="py-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    <div className="inline-flex items-center gap-3">
                      <span>
                        {t('leads.showing', {
                          from: nf.format(1),
                          to: nf.format(visibleLeads.length),
                          total: nf.format(leads.length),
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRenderLimit((prev) => Math.min(prev + 50, leads.length))}
                        className="min-h-[32px] text-xs text-lime-700 dark:text-lime-300 font-medium hover:underline px-3 rounded-md border border-lime-500/30 bg-lime-500/10 active:scale-95 transition-all"
                      >
                        +50
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border shrink-0 bg-white dark:bg-[#0a0a0f]">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span aria-live="polite">
              {t('leads.showing', {
                from: nf.format(startItem),
                to: nf.format(endItem),
                total: nf.format(totalCount),
              })}
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="leads-page-size">{t('leads.rowsPerPage')}</label>
              <select
                id="leads-page-size"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="input-base min-h-[44px] h-11 text-xs py-0 px-2 w-20"
              >
                {[10, 25, 50, 100, 250, 500].map((s) => (
                  <option key={`pagesize-${s}`} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('leads.prev')}
            >
              <ChevronLeft size={14} className="rtl:rotate-180" />
            </button>
            {getPageNumbers().map((p, i) =>
              p === '...' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="w-11 min-w-[44px] text-center text-muted-foreground text-sm flex items-center justify-center"
                >
                  …
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  onClick={() => onPageChange(p as number)}
                  aria-current={currentPage === p ? 'page' : undefined}
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${currentPage === p ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'}`}
                >
                  {nf.format(p as number)}
                </button>
              )
            )}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('leads.next')}
            >
              <ChevronRight size={14} className="rtl:rotate-180" />
            </button>
          </nav>
        </div>
      )}
    </>
  );
}

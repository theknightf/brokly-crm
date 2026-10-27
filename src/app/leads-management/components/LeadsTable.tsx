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
}: {
  leadId: string;
  currentStatus: LeadStatus;
  onStatusChange: (id: string, s: LeadStatus) => void;
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
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg hover:bg-muted transition-colors text-start max-w-full"
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

/** One compact, consistently-ordered badge (max two per lead cell). */
function LeadBadge({ tone, children }: { tone: 'sky' | 'amber' | 'emerald' | 'muted'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const ICON_BTN =
  'w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg text-muted-foreground transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed';

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

  const overdue = isOverdue(lead.followUpDue);
  const called = !!lead.hasBeenCalled;
  const actionToday = !!(lead.actionTakenToday ?? lead.contactedToday);
  const stickyBg = isSelected ? 'bg-secondary' : 'bg-card group-hover:bg-muted';
  const hasPhone = !!(lead.phone && lead.phone.replace(/\D/g, ''));
  const details = [lead.email, lead.location].filter((v) => !!v && String(v).trim());

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(lead.id);
      toast.success(t('leads.idCopied'));
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const handleCall = () => {
    if (onPostCall) onPostCall(lead);
    else if (hasPhone) window.location.href = `tel:${lead.phone.replace(/[^0-9+]/g, '')}`;
  };

  return (
    <tr className={`group transition-colors ${isSelected ? 'bg-secondary' : 'hover:bg-muted'}`}>
      <td className={`table-td sticky start-0 z-[1] w-10 ${stickyBg}`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectRow(lead.id, e.target.checked)}
          className="w-5 h-5 rounded border-input accent-primary cursor-pointer"
          aria-label={`${t('leads.colLead')}: ${title}`}
        />
      </td>

      {/* Lead: avatar/icon + name (or phone) + phone + at most two badges */}
      <td className={`table-td sticky start-10 z-[1] min-w-[250px] border-e border-border ${stickyBg}`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              hasName ? 'bg-lime-500/10 text-primary text-xs font-bold' : 'bg-muted text-muted-foreground'
            }`}
            aria-hidden
          >
            {hasName ? initials : <User size={16} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-h-[20px]">
              <a
                href={`/leads/${lead.id}`}
                className="font-semibold text-foreground text-sm truncate max-w-[170px] hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                title={title}
              >
                {title}
              </a>
              {canDelete && lead.isDuplicate && (
                <span className="flex-shrink-0 inline-flex items-center rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 text-[10px] font-semibold px-1.5 py-px">
                  {t('leads.duplicate')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {hasName ? (
                lead.phone && (
                  <>
                    <Phone size={10} className="flex-shrink-0" />
                    <span className="font-mono-data" dir="ltr">
                      {lead.phone}
                    </span>
                  </>
                )
              ) : (
                <span>{t('leads.noName')}</span>
              )}
              <button
                type="button"
                onClick={copyId}
                title={`${t('leads.copyId')} (${lead.id})`}
                aria-label={t('leads.copyId')}
                className="ms-1 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Copy size={11} />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1 min-h-[20px]">
              <LeadBadge tone={called ? 'sky' : 'amber'}>
                {called ? t('leads.called') : t('leads.notCalled')}
              </LeadBadge>
              <LeadBadge tone={actionToday ? 'emerald' : 'muted'}>
                {actionToday ? t('leads.actionToday') : t('leads.noAction')}
              </LeadBadge>
            </div>
            {details.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[220px]">
                {details.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="table-td">
        {lead.source ? (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-lg font-medium whitespace-nowrap">
            {lead.source}
          </span>
        ) : null}
      </td>

      <td className="table-td">
        {agentNames.length > 0 ? (
          <div className="flex items-center gap-1.5" title={agentNames.join(', ')}>
            <UserCheck size={14} className="text-emerald-500 flex-shrink-0" />
            <span className="text-sm text-foreground truncate max-w-[120px]">{agentNames[0]}</span>
            {agentNames.length > 1 && (
              <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5">
                +{agentNames.length - 1}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t('leads.unassigned')}</span>
        )}
      </td>

      <td className="table-td">
        <div className="flex items-center gap-1.5">
          <StatusDropdown
            currentStatus={lead.status || 'Fresh Leads'}
            leadId={lead.id}
            onStatusChange={onStatusChange}
          />
          <button
            onClick={() => {
              const next = nextPipelineStage(lead.status);
              if (next && next !== lead.status) onStatusChange(lead.id, next);
            }}
            disabled={!nextPipelineStage(lead.status)}
            className="min-h-[44px] h-9 px-3 rounded-full bg-primary text-primary-foreground hover:bg-lime-500/90 disabled:opacity-40 flex items-center gap-1 text-[11px] font-semibold transition-colors shadow-sm whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={
              nextPipelineStage(lead.status)
                ? `${nextPipelineStage(lead.status)}`
                : ''
            }
            aria-label="Advance lead status one step"
          >
            <Zap size={13} />
            {nextPipelineStage(lead.status) || '✓'}
          </button>
        </div>
      </td>

      <td className="table-td text-muted-foreground text-xs">
        {lead.lastActionAt ? (
          <span title={new Date(lead.lastActionAt).toLocaleString(localeOf(lang))}>
            {timeAgo(lead.lastActionAt, lang)}
          </span>
        ) : (
          <span className="opacity-70">{t('leads.noAction')}</span>
        )}
      </td>

      <td className="table-td">
        {lead.followUpDue ? (
          <span
            className={`text-sm tabular-nums ${overdue ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}
          >
            {shortDate(lead.followUpDue, lang)}
            {overdue && <span className="ms-1 text-xs text-red-400">{t('leads.overdue')}</span>}
          </span>
        ) : null}
      </td>

      <td className="table-td text-muted-foreground text-xs">{shortDate(lead.createdAt, lang)}</td>

      {/* Quick actions: call · WhatsApp · open · ⋯ */}
      <td className="table-td">
        <div className="flex items-center gap-0.5 justify-end">
          <button
            type="button"
            onClick={handleCall}
            disabled={!hasPhone}
            title={t('leads.call')}
            aria-label={`${t('leads.call')}: ${title}`}
            className={`${ICON_BTN} hover:bg-emerald-500/10 hover:text-emerald-600`}
          >
            <Phone size={16} />
          </button>
          {hasPhone ? (
            <a
              href={getWhatsAppLinkForLead(lead.phone, lead.name)}
              target="_blank"
              rel="noopener noreferrer"
              title={t('leads.whatsapp')}
              aria-label={`${t('leads.whatsapp')}: ${title}`}
              className={`${ICON_BTN} hover:bg-green-500/10 hover:text-green-600`}
            >
              <MessageCircle size={16} />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onView?.(lead)}
            title={t('leads.open')}
            aria-label={`${t('leads.open')}: ${title}`}
            className={`${ICON_BTN} hover:bg-secondary hover:text-primary`}
          >
            <Eye size={16} />
          </button>
          <button
            ref={menuAnchorRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title={t('leads.more')}
            aria-label={t('leads.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`${ICON_BTN} hover:bg-secondary hover:text-foreground`}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <ViewportPopover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              anchorRef={menuAnchorRef}
              minWidth={190}
              preferredMaxHeight={260}
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
                  className="w-full text-start px-3.5 py-2.5 text-sm hover:bg-muted min-h-[44px] flex items-center gap-2"
                >
                  <Pencil size={14} /> {t('leads.edit')}
                </button>
                {onOpenLogCall && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenLogCall(lead);
                    }}
                    className="w-full text-start px-3.5 py-2.5 text-sm hover:bg-muted min-h-[44px] flex items-center gap-2"
                  >
                    <Phone size={14} /> {t('leads.logCall')}
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void copyId();
                  }}
                  className="w-full text-start px-3.5 py-2.5 text-sm hover:bg-muted min-h-[44px] flex items-center gap-2"
                >
                  <Copy size={14} /> {t('leads.copyId')}
                </button>
                {canDelete && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePrompt(lead.id);
                    }}
                    className="w-full text-start px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 min-h-[44px] flex items-center gap-2"
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

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={`sk-${i}`} aria-hidden>
          <td className="table-td sticky start-0 bg-card">
            <div className="w-5 h-5 rounded bg-muted animate-pulse" />
          </td>
          <td className="table-td sticky start-10 bg-card border-e border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </td>
          {Array.from({ length: 6 }).map((__, c) => (
            <td key={c} className="table-td">
              <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            </td>
          ))}
          <td className="table-td">
            <div className="h-9 w-32 rounded-lg bg-muted animate-pulse ms-auto" />
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

  const sortableCol = (label: string, key: keyof Lead, extra = '') => (
    <th
      className={`table-th text-start sticky top-0 z-[2] bg-muted ${extra}`}
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(key)}
        className="flex items-center gap-0.5 uppercase tracking-wider hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </button>
    </th>
  );
  const plainCol = (label: string, extra = '') => (
    <th className={`table-th text-start sticky top-0 z-[2] bg-muted ${extra}`}>{label}</th>
  );

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

      {/* Desktop table: own scroll container so the header and the first columns stay put */}
      <div
        ref={scrollerRef}
        className="hidden sm:block overflow-auto max-h-[calc(100vh-15rem)] min-h-[320px]"
        tabIndex={0}
        aria-label={t('leads.title')}
      >
        <table className="w-full min-w-[1180px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="table-th w-10 sticky top-0 start-0 z-[3] bg-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="w-5 h-5 rounded border-input accent-primary cursor-pointer"
                  aria-label={t('leads.selectAll')}
                />
              </th>
              <th
                className="table-th text-start sticky top-0 start-10 z-[3] bg-muted min-w-[250px] border-e border-border"
                aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  onClick={() => onSort('name')}
                  className="flex items-center gap-0.5 uppercase tracking-wider hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {t('leads.colLead')}
                  <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </button>
              </th>
              {sortableCol(t('leads.colSource'), 'source')}
              {sortableCol(t('leads.colAgent'), 'agent')}
              {sortableCol(t('leads.colStatus'), 'status')}
              {plainCol(t('leads.colLastAction'))}
              {sortableCol(t('leads.colFollowUp'), 'followUpDue')}
              {sortableCol(t('leads.colCreated'), 'createdAt' as keyof Lead)}
              {plainCol(t('leads.colActions'), 'text-end')}
            </tr>
          </thead>
          <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border">
            {loading && leads.length === 0 ? (
              <SkeletonRows />
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={9}>{emptyState}</td>
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
                <td colSpan={9} className="py-2.5 text-center text-xs text-muted-foreground bg-muted">
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
                      className="min-h-[36px] text-xs text-primary font-medium hover:underline px-3 rounded-md border border-lime-500/20 bg-lime-500/5 active:scale-95 transition-all"
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

      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border">
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

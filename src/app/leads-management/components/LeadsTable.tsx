'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus } from './mockLeads';
import { PIPELINE_STAGES, OUTCOME_STAGES } from './leadStages';
import EmptyState from '@/components/ui/EmptyState';
import MobileLeadCard from './MobileLeadCard';
import ViewportPopover from '@/components/ui/ViewportPopover';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

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
}

type ColumnAlign = 'start' | 'center' | 'end';

interface LeadTableColumn {
  key: string;
  label: string;
  width: string;
  align?: ColumnAlign;
  sortKey?: keyof Lead;
  header?: React.ReactNode;
  render: (lead: Lead) => React.ReactNode;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span
      className={`ms-1 inline-flex flex-col ${active ? 'text-primary' : 'text-muted-foreground/40'}`}
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
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-start max-w-full"
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

const alignClassOf = (align: ColumnAlign = 'start') =>
  align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start';

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
}: LeadsTableProps) {
  const { user } = useAuth();
  const canDelete = isAdminRole(user?.role);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  const handleDeleteConfirm = () => {
    if (deletingId && canDelete) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  };

  // Single source of truth for both the header row and every body row.
  // Keep the utility select/actions columns here too so all six cells stay aligned.
  const columns: LeadTableColumn[] = [
    {
      key: 'select',
      label: '',
      width: '44px',
      align: 'center',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
          aria-label="Select all leads on this page"
        />
      ),
      render: (lead) => (
        <input
          type="checkbox"
          checked={selectedIds.has(lead.id)}
          onChange={(e) => onSelectRow(lead.id, e.target.checked)}
          className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
          aria-label={`Select ${lead.name || lead.id}`}
        />
      ),
    },
    {
      key: 'name',
      label: 'Lead Name',
      width: '25%',
      sortKey: 'name',
      render: (lead) => {
        const name = lead.name?.trim();
        const phone = lead.phone?.trim();
        const displayName = name || phone || '—';
        const initials =
          (name || phone || '?')
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2) || '—';

        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <a
              href={`/leads/${lead.id}`}
              className="block min-w-0 truncate font-semibold text-foreground text-sm hover:text-primary hover:underline cursor-pointer transition-colors"
              dir="auto"
              title={displayName}
            >
              {displayName}
            </a>
          </div>
        );
      },
    },
    {
      key: 'phone',
      label: 'Phone Number',
      width: '16%',
      render: (lead) => {
        const phone = lead.phone?.trim();
        return phone ? (
          <span dir="ltr" className="font-mono-data inline-block text-sm text-foreground">
            {phone}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      key: 'source',
      label: 'Source',
      width: '15%',
      sortKey: 'source',
      render: (lead) => {
        const source = lead.source?.trim();
        return source ? (
          <span
            className="inline-block max-w-full truncate align-middle rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
            dir="auto"
          >
            {source}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      width: '18%',
      sortKey: 'status',
      render: (lead) =>
        lead.status ? (
          <StatusDropdown
            currentStatus={lead.status}
            leadId={lead.id}
            onStatusChange={onStatusChange}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '148px',
      align: 'end',
      render: (lead) => (
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity mobile-force-visible">
          <button
            onClick={() => onView?.(lead)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
            title="View lead details"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => onEdit?.(lead)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
            title="Edit lead"
          >
            <Pencil size={14} />
          </button>
          {canDelete && (
            <button
              onClick={() => setDeletingId(lead.id)}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors flex items-center justify-center"
              title="Delete lead"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

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

  // Reset render window whenever page or dataset changes
  useEffect(() => {
    setRenderLimit(50);
  }, [leads, currentPage]);

  // Window-scroll progressive expansion (smooth 60fps windowing without recursive observer loops)
  useEffect(() => {
    if (renderLimit >= leads.length) return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;
        const fullHeight = document.documentElement.scrollHeight;
        if (fullHeight - (scrollY + viewportHeight) < 700) {
          setRenderLimit((prev) => Math.min(prev + 50, leads.length));
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [renderLimit, leads.length]);

  const visibleLeads = leads.slice(0, renderLimit);

  const emptyFn = useCallback(() => {}, []);
  const safeOnView = onView ?? emptyFn;
  const safeOnEdit = onEdit ?? emptyFn;

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

      {/* Mobile full-width card list — pinned to top, safe-area aware so bottom card never hides behind nav */}
      <div
        className="sm:hidden flex flex-col gap-4 px-1 pt-2 pb-32"
        style={{ paddingBottom: 'max(8rem, calc(7rem + env(safe-area-inset-bottom)))' }}
      >
        {leads.length === 0 ? (
          <EmptyState
            icon={<Users size={24} className="text-muted-foreground" />}
            title="No leads found"
            description="No leads match your current filters. Try adjusting your search criteria or add a new lead."
          />
        ) : (
          visibleLeads.map((lead) => (
            <MobileLeadCard
              key={lead.id}
              lead={lead}
              selected={selectedIds.has(lead.id)}
              onSelect={onSelectRow}
              onView={safeOnView}
              onEdit={safeOnEdit}
              onDelete={(id) => setDeletingId(id)}
              onStatusChange={onStatusChange}
              onOpenLogCall={onOpenLogCall}
              onAddNote={onAddNote}
              onPostCall={onPostCall}
            />
          ))
        )}
        {visibleLeads.length < leads.length && (
          <div className="py-3 text-center flex flex-col items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              Showing {visibleLeads.length} of {leads.length} leads
            </span>
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => Math.min(prev + 50, leads.length))}
              className="text-xs text-primary font-medium hover:underline py-1 px-3 rounded-lg border border-primary/20 bg-primary/5 active:scale-95 transition-all"
            >
              Load more leads (+50)
            </button>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[800px] table-fixed">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {columns.map((col) => {
                const alignClass = alignClassOf(col.align);
                const sortable = Boolean(col.sortKey);
                const activeSort = sortable && sortKey === col.sortKey;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    className={`table-th ${alignClass} align-middle ${
                      sortable
                        ? 'cursor-pointer select-none hover:text-foreground transition-colors'
                        : ''
                    }`}
                    onClick={sortable ? () => onSort(col.sortKey!) : undefined}
                    aria-sort={
                      sortable
                        ? activeSort
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                  >
                    {col.header ?? (
                      <span
                        className={`flex items-center gap-0.5 ${
                          col.align === 'center'
                            ? 'justify-center'
                            : col.align === 'end'
                              ? 'justify-end'
                              : ''
                        }`}
                      >
                        {col.label}
                        {sortable && <SortIcon active={activeSort} dir={sortDir} />}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    icon={<Users size={24} className="text-muted-foreground" />}
                    title="No leads found"
                    description="No leads match your current filters. Try adjusting your search criteria or add a new lead."
                  />
                </td>
              </tr>
            ) : (
              visibleLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`hover:bg-muted/30 transition-colors group ${
                    selectedIds.has(lead.id) ? 'bg-secondary/20' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{ width: col.width }}
                      className={`table-td ${alignClassOf(col.align)} align-middle`}
                    >
                      {col.render(lead)}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {visibleLeads.length < leads.length && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-2.5 text-center text-xs text-muted-foreground bg-muted/10"
                >
                  <div className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                      Showing {visibleLeads.length} of {leads.length} leads — scroll or click to
                      load more
                    </span>
                    <button
                      type="button"
                      onClick={() => setRenderLimit((prev) => Math.min(prev + 50, leads.length))}
                      className="text-xs text-primary font-medium hover:underline py-0.5 px-2.5 rounded-md border border-primary/20 bg-primary/5 active:scale-95 transition-all"
                    >
                      Load more (+50)
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
            <span>
              Showing {startItem}–{endItem} of {totalCount} leads
            </span>
            <div className="flex items-center gap-1.5">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="input-base min-h-[44px] h-9 text-xs py-0 px-2 w-20"
              >
                {[10, 25, 50, 100, 250, 500].map((s) => (
                  <option key={`pagesize-${s}`} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
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
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                    currentPage === p
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

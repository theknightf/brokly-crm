'use client';
import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Eye,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Users,
  UserCheck,
  Zap,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus } from './mockLeads';
import {
  PIPELINE_STAGES,
  OUTCOME_STAGES,
  nextPipelineStage,
} from './leadStages';
import EmptyState from '@/components/ui/EmptyState';
import { LeadQuickActions } from '@/components/mobile/LeadQuickActions';

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
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span
      className={`ml-1 inline-flex flex-col ${active ? 'text-primary' : 'text-muted-foreground/40'}`}
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

const leadId = (lead: Lead): string =>
  lead.leadNumber || `LEAD-${String(lead.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;

function StatusDropdown({
  currentStatus,
  leadId,
  onStatusChange,
}: {
  currentStatus: LeadStatus;
  leadId: string;
  onStatusChange: (id: string, s: LeadStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5"
        aria-label={`Change status from ${currentStatus}`}
      >
        <StatusBadge status={currentStatus} />
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-40 bg-card border border-border rounded-xl shadow-modal min-w-[240px] py-1 fade-in max-h-72 overflow-y-auto">
            <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Pipeline
            </p>
            {PIPELINE_STAGES.map((s) => (
              <button
                key={`status-opt-${leadId}-${s}`}
                onClick={() => {
                  onStatusChange(leadId, s as LeadStatus);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${s === currentStatus ? 'bg-secondary/50' : ''}`}
              >
                <StatusBadge status={s} showDot />
              </button>
            ))}
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Outcomes
            </p>
            {OUTCOME_STAGES.map((s) => (
              <button
                key={`status-opt-${leadId}-${s}`}
                onClick={() => {
                  onStatusChange(leadId, s as LeadStatus);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${s === currentStatus ? 'bg-secondary/50' : ''}`}
              >
                <StatusBadge status={s} showDot />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
}: LeadsTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  const handleDeleteConfirm = () => {
    if (deletingId) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  };

  const formatBudget = (min?: number, max?: number) => {
    if (min == null && max == null) return '—';
    const parts: string[] = [];
    if (min != null) parts.push(min.toLocaleString());
    if (max != null) parts.push(max.toLocaleString());
    return `${parts.join('–')} ج.م`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y?.slice(2)}`;
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    return due < today;
  };

  const sortableCol = (label: string, key: keyof Lead) => (
    <th
      className="table-th cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(key)}
    >
      <span className="flex items-center gap-0.5">
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </span>
    </th>
  );

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

      {/* Mobile one-hand card list */}
      <div className="sm:hidden flex flex-col gap-3 px-1 pb-2">
        {leads.length === 0 ? (
          <EmptyState
            icon={<Users size={24} className="text-muted-foreground" />}
            title="No leads found"
            description="No leads match your current filters. Try adjusting your search criteria or add a new lead."
          />
        ) : (
          leads.map((lead) => {
            const next = nextPipelineStage(lead.status);
            const due = isOverdue(lead.followUpDue);
            return (
              <div
                key={lead.id}
                className={`bg-card border rounded-2xl p-3.5 shadow-sm transition-colors ${
                  selectedIds.has(lead.id)
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-border'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={(e) => onSelectRow(lead.id, e.target.checked)}
                    className="w-5 h-5 rounded border-input accent-primary cursor-pointer flex-shrink-0"
                    aria-label={`Select ${lead.name || lead.id}`}
                  />
                  <button
                    onClick={() => onView?.(lead)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(lead.name || lead.id)
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {lead.name || `Lead ${lead.id}`}
                      </p>
                      <p className="text-[10px] text-primary font-semibold font-mono truncate">
                        {leadId(lead)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-0.5">
                        <MapPin size={10} className="flex-shrink-0" />
                        {lead.location || '—'}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onEdit?.(lead)}
                      className="w-10 h-10 rounded-xl hover:bg-secondary text-muted-foreground flex items-center justify-center active:scale-95 transition-transform"
                      aria-label="Edit lead"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      onClick={() => setDeletingId(lead.id)}
                      className="w-10 h-10 rounded-xl hover:bg-red-50 text-muted-foreground hover:text-red-500 flex items-center justify-center active:scale-95 transition-transform"
                      aria-label="Delete lead"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>

                {/* Status + budget */}
                <div className="flex items-center gap-2 mt-3">
                  <StatusDropdown
                    currentStatus={lead.status || 'Fresh Leads'}
                    leadId={lead.id}
                    onStatusChange={onStatusChange}
                  />
                  <button
                    onClick={() => next != null && next !== lead.status && onStatusChange(lead.id, next)}
                    disabled={!next || next === lead.status}
                    className="h-10 px-3 rounded-xl bg-primary text-primary-foreground flex items-center gap-1 text-xs font-bold disabled:opacity-40 active:scale-95 transition-transform shadow-sm"
                    aria-label="Advance status"
                  >
                    <Zap size={15} />
                    {next ? `Next: ${next}` : 'Final stage'}
                  </button>
                  <div className="ml-auto text-right">
                    <p className="text-sm font-bold text-foreground tabular-nums leading-tight">
                      {formatBudget(lead.budgetMin, lead.budgetMax)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{lead.propertyType || '—'}</p>
                  </div>
                </div>

                {/* Follow-up */}
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-xs text-muted-foreground">
                    Follow-up:{' '}
                    <span className={`font-semibold ${due ? 'text-red-500' : 'text-foreground'}`}>
                      {formatDate(lead.followUpDue)}
                      {due ? ' · overdue' : ''}
                    </span>
                  </span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-lg font-medium">
                    {lead.source || '—'}
                  </span>
                </div>

                {/* Big thumb-zone actions */}
                <div className="mt-3">
                  <LeadQuickActions
                    lead={{
                      id: lead.id,
                      name: lead.name || '',
                      phone: lead.phone,
                      project: lead.project,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[1300px] table-mobile">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="table-th w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
                  aria-label="Select all leads on this page"
                />
              </th>
              {sortableCol('Lead Name', 'name')}
              <th className="table-th">Lead ID</th>
              <th className="table-th">Contact</th>
              <th className="table-th">Property Type</th>
              {sortableCol('Budget', 'budgetMin')}
              {sortableCol('Source', 'source')}
              {sortableCol('Agent', 'agent')}
              <th className="table-th">Assigned To</th>
              {sortableCol('Status', 'status')}
              {sortableCol('Follow-up Due', 'followUpDue')}
              <th className="table-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState
                    icon={<Users size={24} className="text-muted-foreground" />}
                    title="No leads found"
                    description="No leads match your current filters. Try adjusting your search criteria or add a new lead."
                  />
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`hover:bg-muted/30 transition-colors group ${selectedIds.has(lead.id) ? 'bg-secondary/20' : ''}`}
                >
                  <td className="table-td">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={(e) => onSelectRow(lead.id, e.target.checked)}
                      className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
                      aria-label={`Select ${lead.name || lead.id}`}
                    />
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {(lead.name || lead.id)
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate max-w-[130px]">
                          {lead.name || `Lead ${lead.id}`}
                        </p>
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <MapPin size={10} />
                          {lead.location || '—'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="text-xs font-mono font-semibold text-primary whitespace-nowrap">
                      {leadId(lead)}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone size={10} className="flex-shrink-0" />
                        <span className="font-mono-data">{lead.phone}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail size={10} className="flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{lead.email || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="text-sm text-foreground">{lead.propertyType || '—'}</span>
                  </td>
                  <td className="table-td">
                    <span className="font-mono-data text-sm text-foreground tabular-nums">
                      {formatBudget(lead.budgetMin, lead.budgetMax)}
                    </span>
                  </td>
                  <td className="table-td">
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-lg font-medium whitespace-nowrap">
                      {lead.source || '—'}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-secondary text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {lead.agentInitials || '—'}
                      </div>
                      <span className="text-sm text-foreground truncate max-w-[100px]">
                        {lead.agent?.split(' ')[0] || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="table-td">
                    {lead.assignedToName || lead.adminName ? (
                      <div className="flex flex-col gap-0.5">
                        {lead.assignedToName && (
                          <div className="flex items-center gap-1.5">
                            <UserCheck size={12} className="text-emerald-500 flex-shrink-0" />
                            <span className="text-xs text-foreground truncate max-w-[100px]">
                              {lead.assignedToName}
                            </span>
                          </div>
                        )}
                        {lead.adminName && (
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {lead.assignedToName ? 'admin: ' : ''}
                            {lead.adminName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
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
                        className="h-7 px-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1 text-[11px] font-semibold transition-colors shadow-sm whitespace-nowrap"
                        title={
                          nextPipelineStage(lead.status)
                            ? `One-click: move to ${nextPipelineStage(lead.status)}`
                            : 'At final pipeline stage'
                        }
                        aria-label="Advance lead status one step"
                      >
                        <Zap size={13} />
                        {nextPipelineStage(lead.status) || 'Done'}
                      </button>
                    </div>
                  </td>
                  <td className="table-td">
                    <span
                      className={`font-mono-data text-sm tabular-nums ${isOverdue(lead.followUpDue) ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}
                    >
                      {formatDate(lead.followUpDue)}
                      {isOverdue(lead.followUpDue) && (
                        <span className="ml-1 text-xs text-red-400">overdue</span>
                      )}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity mobile-force-visible">
                      <button
                        onClick={() => onView?.(lead)}
                        className="w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                        title="View lead details"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => onEdit?.(lead)}
                        className="w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                        title="Edit lead"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeletingId(lead.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors flex items-center justify-center"
                        title="Delete lead"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
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
                className="input-base h-7 text-xs py-0 px-2 w-16"
              >
                {[10, 25, 50].map((s) => (
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
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            {getPageNumbers().map((p, i) =>
              p === '...' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="w-8 text-center text-muted-foreground text-sm"
                >
                  …
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  onClick={() => onPageChange(p as number)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === p ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'}`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

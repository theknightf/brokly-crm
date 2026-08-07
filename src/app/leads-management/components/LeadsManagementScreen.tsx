'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Download, SlidersHorizontal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import LeadsTable from './LeadsTable';
import LeadsFilters from './LeadsFilters';
import AddLeadForm from './AddLeadForm';
import BulkActionBar from './BulkActionBar';
import { Lead, LeadStatus, LeadSource, PropertyType } from './mockLeads';
import { leadsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import LeadCommentsSection from './LeadCommentsSection';

export interface FilterState {
  search: string;
  status: LeadStatus | '';
  source: LeadSource | '';
  agent: string;
  propertyType: PropertyType | '';
}

export default function LeadsManagementScreen() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    source: '',
    agent: '',
    propertyType: '',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<keyof Lead>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchRef = useRef(0);
  const firstLoadRef = useRef(true);

  const fetchLeads = async () => {
    const requestId = ++fetchRef.current;
    if (firstLoadRef.current) setLoading(true);
    try {
      const res = await leadsService.getPage({
        page: currentPage,
        pageSize,
        search: filters.search,
        status: filters.status || undefined,
        source: filters.source || undefined,
        agent: filters.agent || undefined,
        propertyType: filters.propertyType || undefined,
        sortKey,
        sortDir,
      });
      if (requestId !== fetchRef.current) return;
      setLeads((res.data || []) as Lead[]);
      setTotal(res.total);
    } catch (err: any) {
      if (requestId !== fetchRef.current) return;
      toast.error(err?.message || 'Failed to load leads');
    } finally {
      if (requestId === fetchRef.current) {
        setLoading(false);
        firstLoadRef.current = false;
      }
    }
  };

  // Debounced server-side fetch: pagination, filters, and sorting all happen in
  // the database so we never download the full leads table to the browser.
  useEffect(() => {
    const timer = setTimeout(
      () => {
        fetchLeads();
      },
      firstLoadRef.current ? 0 : 250
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage, pageSize, sortKey, sortDir]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (key: keyof Lead) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    try {
      await leadsService.updateStatus(id, newStatus);
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
      toast.success(`Lead status updated to ${newStatus}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  const handleDeleteLead = async (id: string) => {
    try {
      await leadsService.delete(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      toast.success('Lead deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete lead');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      await leadsService.bulkDelete(ids);
      setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
      setTotal((t) => Math.max(0, t - ids.length));
      toast.success(`${ids.length} leads deleted`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete leads');
    }
  };

  const handleBulkAssign = async (userId: string, userName: string) => {
    const ids = Array.from(selectedIds);
    try {
      await leadsService.bulkAssignUsers(ids, userId, userName);
      const agentInitials = userName
        .split(' ')
        .map((p) => p[0])
        .join('');
      setLeads((prev) =>
        prev.map((l) =>
          selectedIds.has(l.id)
            ? { ...l, agent: userName, agentInitials, assignedTo: userId, assignedToName: userName }
            : l
        )
      );
      toast.success(`${ids.length} leads assigned to ${userName}`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign leads');
    }
  };

  const handleAddLead = async (lead: Lead) => {
    try {
      const created = await leadsService.create(lead, user?.id || '');
      setLeads((prev) => [created as Lead, ...prev]);
      setTotal((t) => t + 1);
      setAddModalOpen(false);
      toast.success(`Lead "${lead.name}" added successfully`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add lead');
    }
  };

  const handleEditSave = async (updated: Lead) => {
    try {
      const saved = await leadsService.update(updated.id, updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? (saved as Lead) : l)));
      setEditLead(null);
      toast.success(`Lead "${updated.name}" updated`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update lead');
    }
  };

  const handleExport = async () => {
    const headers = [
      'Name',
      'Phone',
      'Email',
      'Location',
      'Property Type',
      'Budget Min',
      'Budget Max',
      'Source',
      'Agent',
      'Status',
      'Developer',
      'Project',
      'Follow-up Due',
      'Created At',
    ];
    try {
      const res = await leadsService.getPage({
        page: 1,
        pageSize: 100000,
        search: filters.search,
        status: filters.status || undefined,
        source: filters.source || undefined,
        agent: filters.agent || undefined,
        propertyType: filters.propertyType || undefined,
      });
      const rows = (res.data || []).map((l) => [
        l.name,
        l.phone,
        l.email,
        l.location,
        l.propertyType,
        l.budgetMin,
        l.budgetMax,
        l.source,
        l.agent,
        l.status,
        l.developer ?? '',
        l.project ?? '',
        l.followUpDue,
        l.createdAt,
      ]);
      const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} leads exported to CSV`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export leads');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(leads.map((l) => l.id)));
    else setSelectedIds(new Set());
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', source: '', agent: '', propertyType: '' });
    setCurrentPage(1);
  };

  const activeFilterCount = [
    filters.status,
    filters.source,
    filters.agent,
    filters.propertyType,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} lead{total !== 1 ? 's' : ''} in your pipeline
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={15} />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card-base !p-4">
        <div className="flex items-center gap-2 mb-0.5">
          <SlidersHorizontal size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-semibold">
              {activeFilterCount}
            </span>
          )}
          {(activeFilterCount > 0 || filters.search) && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        <LeadsFilters
          filters={filters}
          onChange={(f) => {
            setFilters(f);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Table */}
      <div className="card-base !p-0 overflow-hidden">
        <LeadsTable
          leads={leads}
          allLeads={leads}
          selectedIds={selectedIds}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onSelectAll={handleSelectAll}
          onSelectRow={handleSelectRow}
          onStatusChange={handleStatusChange}
          onDelete={handleDeleteLead}
          onView={(lead) => setViewLead(lead)}
          onEdit={(lead) => setEditLead(lead)}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalCount={total}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onDelete={handleBulkDelete}
        onAssign={handleBulkAssign}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Add Lead Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Lead"
        subtitle="Fill in the lead details to add them to your pipeline"
        size="xl"
      >
        <AddLeadForm onSubmit={handleAddLead} onCancel={() => setAddModalOpen(false)} />
      </Modal>

      {/* View Lead Modal */}
      {viewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setViewLead(null)}
          />
          <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-lg fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {viewLead.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{viewLead.name}</h2>
                  <p className="text-xs text-muted-foreground">{viewLead.location}</p>
                </div>
              </div>
              <button onClick={() => setViewLead(null)} className="btn-ghost p-1.5 rounded-lg">
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Phone', value: viewLead.phone },
                  { label: 'Email', value: viewLead.email || '—' },
                  { label: 'Property Type', value: viewLead.propertyType },
                  { label: 'Budget', value: `₹${viewLead.budgetMin}–${viewLead.budgetMax}L` },
                  { label: 'Source', value: viewLead.source },
                  { label: 'Agent', value: viewLead.agent },
                  { label: 'Status', value: viewLead.status },
                  { label: 'Assigned To', value: viewLead.assignedToName || 'Unassigned' },
                  { label: 'Follow-up Due', value: viewLead.followUpDue },
                  ...(viewLead.developer
                    ? [{ label: 'Developer', value: viewLead.developer }]
                    : []),
                  ...(viewLead.project ? [{ label: 'Project', value: viewLead.project }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/40 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              {viewLead.notes && (
                <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                  <p className="text-sm text-foreground">{viewLead.notes}</p>
                </div>
              )}
              <LeadCommentsSection leadId={viewLead.id} />
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setViewLead(null)} className="btn-secondary">
                Close
              </button>
              <button
                onClick={() => {
                  setEditLead(viewLead);
                  setViewLead(null);
                }}
                className="btn-primary"
              >
                Edit Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {editLead && (
        <Modal
          open={!!editLead}
          onClose={() => setEditLead(null)}
          title="Edit Lead"
          subtitle={`Editing details for ${editLead.name}`}
          size="xl"
        >
          <AddLeadForm
            initialData={editLead}
            onSubmit={(updated) => handleEditSave({ ...editLead, ...updated })}
            onCancel={() => setEditLead(null)}
          />
        </Modal>
      )}

      {/* Mobile one-hand FAB: add lead */}
      <button
        onClick={() => setAddModalOpen(true)}
        className="sm:hidden fixed bottom-24 right-4 z-40 w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform is-standalone:bottom-28"
        aria-label="Add lead"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}

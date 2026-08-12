'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Download,
  Upload,
  SlidersHorizontal,
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
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import { SiteVisitSheet } from '@/components/mobile/SiteVisitSheet';
import LeadsTable from './LeadsTable';
import LeadsFilters from './LeadsFilters';
import AddLeadForm from './AddLeadForm';
import EditLeadForm from './EditLeadForm';
import BulkActionBar from './BulkActionBar';
import ImportLeadsModal from './ImportLeadsModal';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus, LeadSource, PropertyType, LeadAction, ALL_STATUSES } from './mockLeads';
import { leadsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import LeadCommentsSection from './LeadCommentsSection';
import RecommendedUnitsSection from './RecommendedUnitsSection';
import LeadTimeline from './LeadTimeline';
import DealStatusModal from './DealStatusModal';

export interface FilterState {
  search: string;
  status: LeadStatus | '';
  source: LeadSource | '';
  agent: string;
  propertyType: PropertyType | '';
  action: LeadAction | '';
}

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

function LeadCallHistory({ leadId }: { leadId: string }) {
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
  }, [leadId]);

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

interface LeadsManagementScreenProps {
  initialStatus?: LeadStatus | '';
  title?: string;
  subtitle?: string;
}

export default function LeadsManagementScreen({
  initialStatus = '',
  title,
  subtitle,
}: LeadsManagementScreenProps = {}) {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: initialStatus || '',
    source: '',
    agent: '',
    propertyType: '',
    action: '',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<keyof Lead>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [siteVisitProject, setSiteVisitProject] = useState<{
    id: string;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    radiusM?: number | null;
  } | null>(null);
  const [siteVisitLead, setSiteVisitLead] = useState<{
    id: string;
    name: string;
    phone: string;
    project?: string | null;
  } | null>(null);
  const [dealModal, setDealModal] = useState<{
    lead: Lead;
    status: 'Reservation' | 'Done Deal';
  } | null>(null);

  const fetchRef = useRef(0);
  const firstLoadRef = useRef(true);

  // Open a lead's preview when arriving from another page (e.g. a follow-up
  // linked to a lead: /leads-management?lead=<id>) or open the add modal
  // directly (?new=1, used by the topbar quick action).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get('lead');
    const openNew = params.get('new') === '1';
    if (openNew) {
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      window.history.replaceState({}, '', url.toString());
      setAddModalOpen(true);
    }
    if (!leadId) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('lead');
    window.history.replaceState({}, '', url.toString());
    leadsService
      .getById(leadId)
      .then((lead) => {
        if (lead) setViewLead(lead as Lead);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        action: filters.action || undefined,
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
      setViewLead((prev) => (prev?.id === id ? { ...prev, status: newStatus } : prev));
      toast.success(`Lead status updated to ${newStatus}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  const handleScheduleFollowUp = async (id: string, dueDate: string) => {
    if (!dueDate) return;
    const prev = viewLead;
    // Optimistically update the picker so the UI feels instant.
    setViewLead((v) => (v?.id === id ? { ...v, followUpDue: dueDate } : v));
    setLeads((prevLeads) =>
      prevLeads.map((l) => (l.id === id ? { ...l, followUpDue: dueDate } : l))
    );
    try {
      await leadsService.scheduleFollowUp(id, dueDate);
      toast.success(`Follow-up scheduled for ${dueDate}`);
    } catch (err: any) {
      setViewLead(prev ?? null);
      toast.error(err?.message || 'Failed to schedule follow-up');
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

  const handleBulkAssignTeam = async (teamName: string) => {
    const ids = Array.from(selectedIds);
    try {
      await leadsService.bulkSetTeam(ids, teamName);
      setLeads((prev) => prev.map((l) => (selectedIds.has(l.id) ? { ...l, team: teamName } : l)));
      toast.success(`${ids.length} leads assigned to team "${teamName}"`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign leads to team');
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

  /** Dedicated edit flow: mark Reservation / Done Deal + payment snapshot. */
  const handleQuickDealStatus = async (
    lead: Lead,
    status: 'Reservation' | 'Done Deal',
    fields?: { date: string; amount: number; finalPrice: number; commission: number }
  ) => {
    const now = new Date().toISOString().split('T')[0];
    const next: Lead = {
      ...lead,
      status,
      reservationAmount:
        status === 'Reservation' && fields ? fields.amount : lead.reservationAmount,
      reservationDate:
        status === 'Reservation'
          ? fields?.date || lead.reservationDate || now
          : lead.reservationDate,
      closingDate:
        status === 'Done Deal' ? fields?.date || lead.closingDate || now : lead.closingDate,
      finalPrice: fields
        ? fields.finalPrice
        : lead.finalPrice || lead.totalPrice || lead.unitPrice || 0,
      commission: fields ? fields.commission : lead.commission,
      paymentStatus: status === 'Reservation' ? 'In Progress' : lead.paymentStatus,
    };
    try {
      const saved = await leadsService.update(next.id, next);
      setLeads((prev) => prev.map((l) => (l.id === next.id ? (saved as Lead) : l)));
      setViewLead(saved as Lead);
      toast.success(`Lead marked as ${status}`);
      try {
        const supabase = createClient();
        await supabase.from('activity_log').insert({
          action_type: status === 'Reservation' ? 'Lead Reserved' : 'Done Deal',
          entity_type: 'lead',
          entity_id: next.id,
          detail: `${next.name || 'Lead'} marked as ${status}`,
        });
      } catch {
        // non-fatal
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update lead status');
    }
  };

  const handleExport = async () => {
    const headers = [
      'Lead ID',
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
      'Priority',
      'Rating',
      'Team',
      'Developer',
      'Project',
      'Unit',
      'Total Price',
      'Down Payment',
      'Commission',
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
        action: filters.action || undefined,
      });
      const rows = (res.data || []).map((l: any) => [
        l.leadNumber || `LEAD-${String(l.id).slice(0, 8)}`,
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
        l.priority,
        l.leadRating,
        l.team,
        l.developer ?? '',
        l.project ?? '',
        l.unit ?? '',
        l.totalPrice || '',
        l.downPayment || '',
        l.commission || '',
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
    setFilters({
      search: '',
      status: initialStatus || '',
      source: '',
      agent: '',
      propertyType: '',
      action: '',
    });
    setCurrentPage(1);
  };

  // Log a WhatsApp quick action for a lead (no modal — instant tap)
  const handleWhatsAppAction = async (lead: Lead, outcome: string) => {
    try {
      const statusMap: Partial<Record<string, string>> = {
        'Customer Replied': 'Following Up',
      };
      const res = await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'lead',
          entity_id: lead.id,
          contact_name: lead.name,
          contact_phone: lead.phone,
          channel: 'WhatsApp',
          direction: 'outgoing',
          outcome,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to log WhatsApp action (${res.status})`);
      }
      const nextStatus = statusMap[outcome];
      if (nextStatus) {
        await handleStatusChange(lead.id, nextStatus as LeadStatus);
      }
      toast.success(`WhatsApp: ${outcome}`);
    } catch {
      toast.error('Failed to log WhatsApp action');
    }
  };

  // Fetch the project linked to a lead then open the SiteVisitSheet. When no
  // project matches, the sheet falls back to a schedule-first flow for the lead.
  const fetchAndOpenSiteVisit = (lead: Lead) => {
    const projectName = lead.project || lead.location || '';
    if (!projectName) {
      setSiteVisitProject(null);
      setSiteVisitLead({
        id: lead.id,
        name: lead.name || '',
        phone: lead.phone || '',
        project: null,
      });
      return;
    }
    (async () => {
      try {
        const client = createClient();
        const { data } = await client
          .from('projects')
          .select('id, name, latitude, longitude, radius_m')
          .ilike('name', projectName)
          .limit(1);
        const proj = data?.[0];
        if (proj) {
          setSiteVisitProject({
            id: proj.id,
            name: (proj.name || projectName) as string,
            latitude: (proj as any)?.latitude ?? null,
            longitude: (proj as any)?.longitude ?? null,
            radiusM: (proj as any)?.radius_m ?? null,
          });
          setSiteVisitLead({
            id: lead.id,
            name: lead.name || '',
            phone: lead.phone || '',
            project: projectName,
          });
        } else {
          setSiteVisitProject(null);
          setSiteVisitLead({
            id: lead.id,
            name: lead.name || '',
            phone: lead.phone || '',
            project: projectName,
          });
        }
      } catch {
        setSiteVisitProject(null);
        setSiteVisitLead({
          id: lead.id,
          name: lead.name || '',
          phone: lead.phone || '',
          project: projectName,
        });
      }
    })();
  };

  const activeFilterCount = [
    filters.status,
    filters.source,
    filters.agent,
    filters.propertyType,
    filters.action,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const formatDisplayBudget = (lead: Lead) => {
    const parts: string[] = [];
    if (lead.budgetMin != null) parts.push(`${lead.budgetMin.toLocaleString()}L`);
    if (lead.budgetMax != null) parts.push(`${lead.budgetMax.toLocaleString()}L`);
    return parts.length ? `₹${parts.join('–')}` : '—';
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">{title || 'Leads'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subtitle ||
              `${total} lead${total !== 1 ? 's' : ''} in your pipeline${
                initialStatus ? ` · status: ${initialStatus}` : ''
              }`}
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
            onClick={() => setImportModalOpen(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">Import Leads</span>
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
        selectedLeads={leads.filter((l) => selectedIds.has(l.id))}
        onDelete={handleBulkDelete}
        onAssign={handleBulkAssign}
        onAssignTeam={handleBulkAssignTeam}
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

      {/* Import Leads Modal */}
      <ImportLeadsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          // Refresh the list + total after a successful import.
          fetchLeads();
        }}
      />

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
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2) || '—'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {viewLead.name || `Lead ${viewLead.id}`}
                    </h2>
                    {viewLead.leadNumber && (
                      <span className="text-[10px] font-semibold font-mono text-primary bg-primary/10 rounded-md px-1.5 py-0.5">
                        {viewLead.leadNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{viewLead.location || '—'}</p>
                </div>
              </div>
              <button onClick={() => setViewLead(null)} className="btn-ghost p-1.5 rounded-lg">
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Status quick actions — vertical one-per-row layout */}
              <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">Lead status</p>
                  <StatusBadge status={viewLead.status || 'Fresh Leads'} showDot />
                </div>
                <div className="flex flex-col gap-1 max-h-52 overflow-y-auto -mx-1 px-1">
                  {ALL_STATUSES.map((s) => {
                    const isActive = s === (viewLead.status || 'Fresh Leads');
                    return (
                      <button
                        key={`view-status-${viewLead.id}-${s}`}
                        onClick={() => {
                          if (isActive) return;
                          const next = s as LeadStatus;
                          setViewLead({ ...viewLead, status: next });
                          handleStatusChange(viewLead.id, next);
                        }}
                        className={`w-full px-3 h-10 rounded-lg text-left text-sm flex items-center gap-2.5 transition-all active:scale-[0.98] ${
                          isActive
                            ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                            : 'text-foreground hover:bg-background/60 font-normal'
                        }`}
                      >
                        {isActive ? (
                          <Check size={13} className="flex-shrink-0 text-primary" />
                        ) : (
                          <span className="w-[13px] flex-shrink-0" />
                        )}
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Schedule follow-up */}
              <div className="bg-muted/40 rounded-xl px-4 py-2">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <CalendarClock size={12} /> Schedule follow-up
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="input-base h-9"
                    value={viewLead.followUpDue || ''}
                    onChange={(e) => handleScheduleFollowUp(viewLead.id, e.target.value)}
                  />
                </div>
              </div>

              {/* Reservation / Done Deal quick actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDealModal({ lead: viewLead, status: 'Reservation' })}
                  disabled={viewLead.status === 'Reservation'}
                  className="h-10 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <BadgeCheck size={14} />
                  Reservation
                </button>
                <button
                  onClick={() => setDealModal({ lead: viewLead, status: 'Done Deal' })}
                  disabled={viewLead.status === 'Done Deal'}
                  className="h-10 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Handshake size={14} />
                  Done Deal
                </button>
              </div>

              {/* Payment plan summary */}
              {Number(viewLead.totalPrice) > 0 ? (
                <div className="bg-muted/40 rounded-xl px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <p className="text-xs text-muted-foreground">Total price</p>
                  <p className="text-sm font-semibold text-foreground text-right tabular-nums">
                    EGP {Number(viewLead.totalPrice).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Down payment</p>
                  <p className="text-sm font-medium text-foreground text-right tabular-nums">
                    EGP {Number(viewLead.downPayment || 0).toLocaleString()}
                    {Number(viewLead.downPaymentPct) > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Number(viewLead.downPaymentPct)}%)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Reservation</p>
                  <p className="text-sm font-medium text-foreground text-right tabular-nums">
                    EGP {Number(viewLead.reservationAmount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-sm font-medium text-foreground text-right tabular-nums">
                    EGP {Number(viewLead.remainingAmount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Installment</p>
                  <p className="text-sm font-medium text-foreground text-right tabular-nums">
                    EGP {Number(viewLead.installmentAmount || 0).toLocaleString()}
                    {Number(viewLead.installmentCount) > 0 && ` × ${viewLead.installmentCount}`}
                  </p>
                  {viewLead.reservationDate && (
                    <>
                      <p className="text-xs text-muted-foreground">Reservation date</p>
                      <p className="text-sm font-medium text-foreground text-right">
                        {viewLead.reservationDate}
                      </p>
                    </>
                  )}
                  {viewLead.closingDate && (
                    <>
                      <p className="text-xs text-muted-foreground">Closing date</p>
                      <p className="text-sm font-medium text-foreground text-right">
                        {viewLead.closingDate}
                      </p>
                    </>
                  )}
                  {Number(viewLead.commission) > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground">Commission</p>
                      <p className="text-sm font-medium text-foreground text-right tabular-nums">
                        EGP {Number(viewLead.commission).toLocaleString()}
                      </p>
                    </>
                  )}
                  {viewLead.paymentStatus && (
                    <>
                      <p className="text-xs text-muted-foreground">Payment status</p>
                      <p className="text-sm font-medium text-foreground text-right">
                        {viewLead.paymentStatus}
                      </p>
                    </>
                  )}
                  <div className="col-span-2 pt-1 border-t border-border">
                    <button
                      onClick={() => {
                        setEditLead(viewLead);
                        setViewLead(null);
                      }}
                      className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Pencil size={10} /> Edit payment plan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/40 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">No payment plan added</p>
                  <button
                    onClick={() => {
                      setEditLead(viewLead);
                      setViewLead(null);
                    }}
                    className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus size={11} /> Add payment plan
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Phone', value: viewLead.phone },
                  { label: 'Email', value: viewLead.email || '—' },
                  { label: 'Property Type', value: viewLead.propertyType },
                  { label: 'Budget', value: formatDisplayBudget(viewLead) },
                  { label: 'Source', value: viewLead.source },
                  { label: 'Agent', value: viewLead.agent },
                  { label: 'Status', value: viewLead.status },
                  { label: 'Assigned To', value: viewLead.assignedToName || 'Unassigned' },
                  { label: 'Follow-up Due', value: viewLead.followUpDue },
                  { label: 'Priority', value: viewLead.priority || '—' },
                  { label: 'Rating', value: viewLead.leadRating || '—' },
                  { label: 'Team', value: viewLead.team || '—' },
                  { label: 'CS Agent', value: viewLead.csAgent || '—' },
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

              {/* WhatsApp quick actions — vertical one-per-row */}
              {viewLead.phone && (
                <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <MessageCircle size={11} />
                    WhatsApp Actions
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {[
                      {
                        label: 'WA Sent',
                        icon: <CheckCircle2 size={13} />,
                        cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                        outcome: 'WhatsApp Sent',
                      },
                      {
                        label: 'Customer Replied',
                        icon: <ThumbsUp size={13} />,
                        cls: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
                        outcome: 'Customer Replied',
                      },
                      {
                        label: 'No Reply',
                        icon: <UserX size={13} />,
                        cls: 'bg-muted text-muted-foreground hover:bg-muted/80',
                        outcome: 'No Reply',
                      },
                      {
                        label: 'WA Follow-up',
                        icon: <CalendarClock size={13} />,
                        cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                        outcome: 'WhatsApp Follow-up',
                      },
                    ].map((a) => (
                      <button
                        key={a.outcome}
                        onClick={() => handleWhatsAppAction(viewLead, a.outcome)}
                        className={`w-full h-10 rounded-lg px-3 text-left text-sm font-medium flex items-center gap-2 active:scale-[0.98] transition-all ${
                          a.cls
                        }`}
                      >
                        {a.icon}
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <LeadCallHistory leadId={viewLead.id} />
              <RecommendedUnitsSection leadId={viewLead.id} />
              <LeadTimeline leadId={viewLead.id} />
              <LeadCommentsSection leadId={viewLead.id} />
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-2">
              <button
                onClick={() => fetchAndOpenSiteVisit(viewLead)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
                title="Start a GPS-verified site visit for this lead's project"
              >
                <MapPin size={14} />
                <span>Site Visit</span>
              </button>
              <div className="flex gap-2">
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
        </div>
      )}

      {/* Edit Lead Modal — dedicated edit interface (not AddLeadForm) */}
      {editLead && (
        <Modal
          open={!!editLead}
          onClose={() => setEditLead(null)}
          title="Edit Lead"
          subtitle={
            editLead.leadNumber
              ? `Editing ${editLead.leadNumber}`
              : `Editing details for ${editLead.name}`
          }
          size="xl"
        >
          <EditLeadForm
            lead={editLead}
            onSubmit={(updated) => handleEditSave(updated)}
            onCancel={() => setEditLead(null)}
          />
        </Modal>
      )}

      {/* Site Visit Sheet — opened from View Lead modal (project and/or lead) */}
      {(siteVisitProject || siteVisitLead) && (
        <SiteVisitSheet
          project={siteVisitProject}
          lead={siteVisitLead}
          onClose={() => {
            setSiteVisitProject(null);
            setSiteVisitLead(null);
          }}
          onChanged={fetchLeads}
        />
      )}

      {/* Reservation / Done Deal modal */}
      {dealModal && (
        <DealStatusModal
          lead={dealModal.lead}
          status={dealModal.status}
          onClose={() => setDealModal(null)}
          onConfirm={(fields) => {
            handleQuickDealStatus(dealModal.lead, dealModal.status, fields);
            setDealModal(null);
          }}
        />
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

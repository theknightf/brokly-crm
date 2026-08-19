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
  Building2,
  Tag,
  TriangleAlert,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  ClipboardList,
  Activity,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import { SiteVisitSheet } from '@/components/mobile/SiteVisitSheet';
import LeadsTable from './LeadsTable';
import LeadBoard from './LeadBoard';
import LeadsFilters from './LeadsFilters';
import AddLeadForm from './AddLeadForm';
import EditLeadForm from './EditLeadForm';
import BulkActionBar from './BulkActionBar';
import ImportLeadsModal from './ImportLeadsModal';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus, LeadSource, PropertyType, LeadAction } from './mockLeads';
import {
  PIPELINE_STAGES,
  OUTCOME_STAGES,
  pipelineIndex,
  ALL_REAL_STATUSES,
} from './leadStages';
import { leadsService } from '@/lib/services/crmService';
import { duplicateLeadsService } from '@/lib/services/peopleOpsService';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LeadCommentsSection from './LeadCommentsSection';
import RecommendedUnitsSection from './RecommendedUnitsSection';
import LeadTimeline from './LeadTimeline';
import DealStatusModal from './DealStatusModal';
import QuickPaymentPlanModal from './QuickPaymentPlanModal';
import LogCallModal from './LogCallModal';

export interface FilterState {
  search: string;
  status: LeadStatus | '';
  source: LeadSource | '';
  agent: string;
  project: string;
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
  const { t } = useLanguage();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: initialStatus || '',
    source: '',
    agent: '',
    project: '',
    propertyType: '',
    action: '',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Keyboard shortcut: press 'N' (when not in an input) to open Add Lead modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'n' &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        setAddModalOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [showFilters, setShowFilters] = useState(true);
  const [viewTab, setViewTab] = useState<'overview' | 'activity' | 'units' | 'comments'>('overview');
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
  const [payPlanLead, setPayPlanLead] = useState<Lead | null>(null);
  const [logCallLead, setLogCallLead] = useState<Lead | null>(null);
  const [callHistoryKey, setCallHistoryKey] = useState(0);
  const statusPendingRef = useRef<Set<string>>(new Set());
  const [dupWarning, setDupWarning] = useState<{
    existing: any;
    pendingLead: Lead;
  } | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  /** Swap the lead inside the reservation / done-deal modal (Select Existing Lead). */
  const handleDealLeadChange = async (leadId: string): Promise<Lead | null> => {
    const found = (await leadsService.getById(leadId)) as Lead | null;
    if (found) {
      setDealModal((m) => (m ? { ...m, lead: found } : m));
    } else {
      toast.error('Lead not found');
    }
    return found;
  };

  const fetchRef = useRef(0);
  const firstLoadRef = useRef(true);

  // Open a lead's preview when arriving from another page (e.g. a follow-up
  // linked to a lead: /leads-management?lead=<id>) or open the add modal
  // directly (?new=1, used by the topbar quick action).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get('lead');
    const openNew = params.get('new') === '1';
    const statusParam = params.get('status');
    const searchParam = params.get('search');
    if (searchParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete('search');
      window.history.replaceState({}, '', url.toString());
      setFilters((f) => ({ ...f, search: searchParam }));
    }
    if (statusParam && ALL_REAL_STATUSES.includes(statusParam as LeadStatus)) {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      window.history.replaceState({}, '', url.toString());
      setFilters((f) => ({ ...f, status: statusParam as LeadStatus }));
    }
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
        project: filters.project || undefined,
        propertyType: filters.propertyType || undefined,
        action: filters.action || undefined,
        sortKey,
        sortDir,
      });
      if (requestId !== fetchRef.current) return;
      setLeads((res.data || []) as Lead[]);
      setTotal(res.total);
      setLoadError(null);
    } catch (err: any) {
      if (requestId !== fetchRef.current) return;
      setLoadError(err?.message || 'Failed to load leads');
      setLeads([]);
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
    if (statusPendingRef.current.has(id)) return;
    statusPendingRef.current.add(id);
    // Snapshot the previous status so we can roll the UI back if the server
    // rejects the change (prevents the preview from lying about the stage).
    const prevLeads = leads;
    const prevView = viewLead;
    try {
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
      setViewLead((prev) => (prev?.id === id ? { ...prev, status: newStatus } : prev));
      await leadsService.updateStatus(id, newStatus);
      toast.success(`Lead status updated to ${newStatus}`);
    } catch (err: any) {
      setLeads((prev) =>
        prev.map((l) => {
          const orig = prevLeads.find((x) => x.id === id);
          return l.id === id && orig ? { ...l, status: orig.status } : l;
        })
      );
      setViewLead((prev) => {
        if (prev?.id !== id) return prev;
        const orig = prevView && prevView.id === id ? prevView : prevLeads.find((x) => x.id === id);
        return orig ? { ...prev, status: orig.status } : prev;
      });
      toast.error(err?.message || 'Failed to update status');
    } finally {
      statusPendingRef.current.delete(id);
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

  const handleBulkAssignMany = async (users: { id: string; name: string }[]) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || !users.length) return;
    try {
      // Single RPC call: deterministic round-robin, fully atomic on the server.
      // If any lead can't be reassigned the whole batch rolls back.
      const result = await leadsService.bulkAssignRoundRobin(ids, users);
      const done: { id: string; userId: string; name: string }[] = (result || []).map((r) => ({
        id: r.lead_id,
        userId: r.user_id,
        name: r.user_name,
      }));
      setLeads((prev) =>
        prev.map((l) => {
          const a = done.find((x) => x.id === l.id);
          if (!a) return l;
          return {
            ...l,
            agent: a.name,
            agentInitials: a.name
              .split(' ')
              .map((p) => p[0])
              .join(''),
            assignedTo: a.userId,
            assignedToName: a.name,
          };
        })
      );
      const counts = users.map((u) => ({
        name: u.name,
        count: done.filter((a) => a.userId === u.id).length,
      }));
      toast.success(
        `Assigned ${ids.length} leads: ${counts.map((c) => `${c.name} × ${c.count}`).join(', ')}`
      );
      setSelectedIds(new Set());
    } catch (err: any) {
      // The RPC is atomic — nothing was persisted, so there is nothing to
      // un-assign. State already reflects the failure (toast only).
      toast.error(err?.message || 'Assignment failed — no leads were changed');
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
    setDupChecking(true);
    let existing = null;
    try {
      existing = await duplicateLeadsService.findByPhone(lead.phone || '');
    } catch {
      existing = null;
    }
    setDupChecking(false);

    // Strong duplicate detection: warn before silently creating a duplicate.
    if (existing) {
      setDupWarning({ existing, pendingLead: lead });
      return;
    }
    await createLead(lead);
  };

  const createLead = async (lead: Lead) => {
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

  /** "Create anyway" after a duplicate warning — records the attempt for admins. */
  const createDuplicateAnyway = async () => {
    if (!dupWarning) return;
    const { existing, pendingLead } = dupWarning;
    setDupWarning(null);
    try {
      await createLead(pendingLead);
      if (existing?.id) {
        await duplicateLeadsService.logAttempt({
          matchedLeadId: existing.id,
          attemptedLeadId: pendingLead.id,
          attemptedPhone: pendingLead.phone || '',
        });
      }
    } catch {
      /* toast already shown by createLead */
    }
  };

  const handleEditSave = async (updated: Lead) => {
    try {
      const original = editLead;
      const assignmentOnly =
        original &&
        original.assignedTo !== updated.assignedTo &&
        Object.keys(updated).every((key) => {
          if (key === 'assignedTo' || key === 'assignedToName') return true;
          return (updated as any)[key] === (original as any)[key];
        });
      const saved = assignmentOnly
        ? await leadsService.assignLead(updated.id, updated.assignedTo || null).then((row: any) => ({
            ...updated,
            assignedTo: row.assigned_to,
            assignedToName: row.assigned_to ? updated.assignedToName : null,
          }))
        : await leadsService.update(updated.id, updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? (saved as Lead) : l)));
      setViewLead((current) => (current?.id === updated.id ? (saved as Lead) : current));
      setEditLead(null);
      toast.success(assignmentOnly ? 'Lead reassigned successfully' : `Lead "${updated.name}" updated`);
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
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await supabase.from('activity_log').insert({
          user_id: user?.id ?? undefined,
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
      project: '',
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
      <div className="space-y-5 animate-in fade-in">
        <div className="h-9 w-44 bg-muted rounded-lg animate-pulse" />
        <div className="h-11 bg-muted rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="h-36 bg-muted rounded-2xl animate-pulse"
              style={{ animationDelay: `${Math.min(i, 7) * 60}ms` }}
            />
          ))}
        </div>
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
    <div className="page-aurora min-h-full space-y-5 rounded-[2rem] p-3 sm:p-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-[1.75rem] border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm backdrop-blur-xl">
        <div className="animate-rise-in">
          <h1 className="page-title">{title || t('leads.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subtitle ||
              `${total} lead${total !== 1 ? 's' : ''} in your list${
                initialStatus ? ` · status: ${initialStatus}` : ''
              }`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap animate-rise-in" style={{ animationDelay: '80ms' }}>
          <button
            onClick={handleExport}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Export to CSV"
          >
            <Download size={15} />
            <span className="hidden sm:inline">{t('leads.export')}</span>
          </button>
          <button
            onClick={() => setImportModalOpen(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Import leads"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">{t('leads.import')}</span>
          </button>
          {/* ── Prominent Add Lead CTA ── */}
          <div className="relative">
            {/* Animated glow ring */}
            <span className="absolute inset-0 rounded-xl bg-primary/40 animate-ping" style={{ animationDuration: '2s' }} />
            <button
              id="add-lead-btn"
              onClick={() => setAddModalOpen(true)}
              className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-[0_8px_24px_-6px_rgba(132,204,22,0.65)] hover:shadow-[0_12px_30px_-6px_rgba(132,204,22,0.8)] hover:-translate-y-0.5 hover:brightness-105 active:scale-95 transition-all duration-200 whitespace-nowrap"
              title="Add lead (press N)"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>{t('leads.add')}</span>
              <span className="hidden sm:flex items-center justify-center ml-1 w-5 h-5 rounded-md bg-primary-foreground/20 text-primary-foreground text-[10px] font-bold tracking-wider">N</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sticky toolbar */}
      <div className="sticky top-2 z-20 flex flex-col sm:flex-row gap-2 animate-rise-in" style={{ animationDelay: '140ms' }}>
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            value={filters.search}
            onChange={(e) => {
              setFilters((f) => ({ ...f, search: e.target.value }));
              setCurrentPage(1);
            }}
            placeholder={t('leads.search')}
            className="input-base h-11 pl-9 pr-3 w-full bg-card/90 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`btn-secondary h-11 flex items-center gap-1.5 text-sm ${
              activeFilterCount > 0 ? 'ring-1 ring-primary/40 text-primary' : ''
            }`}
          >
            <SlidersHorizontal size={15} />
            <span className="hidden sm:inline">{t('leads.filters')}</span>
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="flex items-center bg-muted rounded-xl p-1 h-11">
            <button
              onClick={() => setViewMode('list')}
              className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="List view"
            >
              <List size={15} />
              <span className="hidden md:inline">{t('leads.list')}</span>
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors ${
                viewMode === 'board'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Board view"
            >
              <LayoutGrid size={15} />
              <span className="hidden md:inline">{t('leads.board')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card-base !p-4 animate-in fade-in slide-in-from-top-2">
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
      )}

      {/* Table / Board */}
      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TriangleAlert size={18} className="flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Failed to load leads</p>
              <p className="text-xs opacity-80">{loadError}</p>
            </div>
          </div>
          <button onClick={fetchLeads} className="btn-secondary shrink-0">
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}
      <div className="card-base !p-0 overflow-hidden animate-in fade-in">
        {viewMode === 'board' ? (
          <LeadBoard
            leads={leads}
            onView={(lead) => {
              setViewLead(lead);
              setViewTab('overview');
            }}
            onEdit={(lead) => setEditLead(lead)}
            onStatusChange={handleStatusChange}
          />
        ) : (
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
            onView={(lead) => {
              setViewLead(lead);
              setViewTab('overview');
            }}
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
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedLeads={leads.filter((l) => selectedIds.has(l.id))}
        onDelete={handleBulkDelete}
        onAssignMany={handleBulkAssignMany}
        onAssignTeam={handleBulkAssignTeam}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Add Lead Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add lead"
        subtitle="Enter a phone number — everything else is optional"
        size="xl"
      >
        <AddLeadForm onSubmit={handleAddLead} onCancel={() => setAddModalOpen(false)} />
      </Modal>

      {/* Duplicate Lead Warning */}
      <Modal
        open={!!dupWarning}
        onClose={() => setDupWarning(null)}
        title="Duplicate lead detected"
        subtitle="This phone number already exists in your leads"
        size="md"
      >
        {dupWarning && (
          <div className="p-6">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
              <p className="text-sm text-amber-800 font-medium mb-1">
                A lead with phone <span className="font-mono">{dupWarning.existing.phone}</span> already
                exists.
              </p>
              {dupWarning.existing.matches > 1 && (
                <p className="text-xs text-amber-700">
                  {dupWarning.existing.matches} matching leads found.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border overflow-hidden mb-5">
              <div className="px-4 py-3 border-b border-border bg-muted/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Existing lead</p>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium text-foreground">{dupWarning.existing.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium text-foreground">{dupWarning.existing.status}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Created by</span>
                  <span className="font-medium text-foreground">{dupWarning.existing.createdBy}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Created on</span>
                  <span className="font-medium text-foreground">
                    {dupWarning.existing.createdAt
                      ? dupWarning.existing.createdAt.split('T')[0]
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Assigned to</span>
                  <span className="font-medium text-foreground">{dupWarning.existing.assignedTo}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Creating it will be recorded and flagged for your admin.
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setDupWarning(null)} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={createDuplicateAnyway} className="btn-primary">
                  Add anyway
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/* View Lead Drawer */}
      {viewLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-in fade-in"
            onClick={() => setViewLead(null)}
          />
          <div className="relative flex flex-col bg-card border-border shadow-modal w-full sm:max-w-md sm:w-full sm:h-full sm:border-l sm:rounded-none rounded-t-2xl max-h-[92dvh] sm:max-h-full overflow-hidden animate-in fade-in slide-in-from-right-4">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border flex-shrink-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
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
                    {viewLead.leadNumber && (
                      <span className="text-[10px] font-semibold font-mono text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                        {viewLead.leadNumber}
                      </span>
                    )}
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
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform flex-shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
              {/* Stage (pipeline status) — first thing a Sales user changes */}
              <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">Stage</p>
                  <StatusBadge status={viewLead.status || 'Fresh Leads'} showDot />
                </div>
                <div className="space-y-2">
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
                                ? 'text-primary bg-primary/5 border-primary/40 hover:bg-primary/10 font-medium'
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
                    <a
                      href={`tel:${viewLead.phone.replace(/[^0-9+,]/g, '')}`}
                      className="h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                    >
                      <PhoneCall size={15} />
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${viewLead.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                    >
                      <MessageCircle size={16} />
                      WhatsApp
                    </a>
                  </>
                )}
                <button
                  onClick={() => setLogCallLead(viewLead)}
                  className="h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all active:scale-[0.98]"
                >
                  <PhoneCall size={15} />
                  Log Call
                </button>
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
              </div>

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
                  { label: 'Email', value: viewLead.email || '—' },
                  { label: 'Source', value: viewLead.source || '—' },
                  { label: 'Project', value: viewLead.project || viewLead.developer || '—' },
                  { label: 'Property', value: viewLead.propertyType || '—' },
                  { label: 'Budget', value: formatDisplayBudget(viewLead) },
                  { label: 'Agent', value: viewLead.agent || 'Unassigned' },
                  { label: 'Assigned To', value: viewLead.assignedToName || 'Unassigned' },
                  ...(viewLead.referredTo
                    ? [{ label: 'Referred To', value: viewLead.referredToName || 'Second user' }]
                    : []),
                  ...(viewLead.referredBy
                    ? [{ label: 'Referred By', value: viewLead.referredByName || 'Recorded user' }]
                    : []),
                ].map(({ label, value, href }) => (
                  <div key={label} className="bg-muted/40 rounded-xl px-3 py-2.5">
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

              {/* Log call quick action */}
              <button
                onClick={() => setLogCallLead(viewLead)}
                className="w-full h-10 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <PhoneCall size={14} />
                Log Call
              </button>

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
                      onClick={() => setPayPlanLead(viewLead)}
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
                    onClick={() => setPayPlanLead(viewLead)}
                    className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus size={11} /> Add payment plan
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Follow-up Due', value: viewLead.followUpDue || '—' },
                  { label: 'Priority', value: viewLead.priority || '—' },
                  { label: 'Rating', value: viewLead.leadRating || '—' },
                  { label: 'Team', value: viewLead.team || '—' },
                  { label: 'CS Agent', value: viewLead.csAgent || '—' },
                  { label: 'Lead Number', value: viewLead.leadNumber || '—' },
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

              {viewLead.phone && (
                <details className="bg-muted/40 rounded-xl px-3 py-2.5 group" open>
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
                </details>
              )}

              {/* Section tabs */}
              <div className="sticky top-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 py-2 bg-card/95 backdrop-blur border-b border-border flex gap-1 animate-in fade-in">
                {(
                  [
                    ['overview', 'Overview', ClipboardList],
                    ['activity', 'Activity', Activity],
                    ['units', 'Units', Building2],
                    ['comments', 'Comments', MessageSquare],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setViewTab(key)}
                    className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-colors ${
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
                  <LeadCommentsSection leadId={viewLead.id} />
                </div>
              )}
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-border flex items-center justify-between gap-2 flex-shrink-0">
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
                  Edit lead
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
          title="Edit lead"
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
          onChangeLead={handleDealLeadChange}
          onConfirm={(fields) => {
            handleQuickDealStatus(dealModal.lead, dealModal.status, fields);
            setDealModal(null);
          }}
        />
      )}

      {/* Quick payment plan modal */}
      {payPlanLead && (
        <QuickPaymentPlanModal
          lead={payPlanLead}
          onClose={() => setPayPlanLead(null)}
          onSaved={(updated) => {
            setViewLead((v) => (v?.id === updated.id ? updated : v));
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setPayPlanLead(null);
          }}
        />
      )}

      {/* Quick log call modal */}
      {logCallLead && (
        <LogCallModal
          lead={logCallLead}
          onClose={() => setLogCallLead(null)}
          onDone={() => {
            setLogCallLead(null);
            setCallHistoryKey((k) => k + 1);
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

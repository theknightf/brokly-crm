'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import { SiteVisitSheet } from '@/components/mobile/SiteVisitSheet';
import LeadsTable from './LeadsTable';
import LeadBoard from './LeadBoard';
import LeadsFilters from './LeadsFilters';
import AddLeadForm from './AddLeadForm';
import EditLeadForm from './EditLeadForm';
import BulkActionBar from './BulkActionBar';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus, LeadSource, PropertyType, LeadAction } from './mockLeads';
import {
  PIPELINE_STAGES,
  OUTCOME_STAGES,
  pipelineIndex,
  ALL_REAL_STATUSES,
} from './leadStages';
import { leadsService, followUpsService } from '@/lib/services/crmService';
import { duplicateLeadsService } from '@/lib/services/peopleOpsService';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole } from '@/lib/roles';
import LeadCommentsSection from './LeadCommentsSection';
import RecommendedUnitsSection from './RecommendedUnitsSection';
import LeadTimeline from './LeadTimeline';
import PostCallOutcomeModal from './PostCallOutcomeModal';
import LeadProfileSidePanel from './LeadProfileSidePanel';

const ImportLeadsModal = dynamic(() => import('./ImportLeadsModal'), { ssr: false });
const DealStatusModal = dynamic(() => import('./DealStatusModal'), { ssr: false });
const QuickPaymentPlanModal = dynamic(() => import('./QuickPaymentPlanModal'), { ssr: false });
const LogCallModal = dynamic(() => import('./LogCallModal'), { ssr: false });

export interface FilterState {
  search: string;
  status: LeadStatus | '';
  source: LeadSource | '';
  agent: string;
  project: string;
  propertyType: PropertyType | '';
  action: LeadAction | '';
  /** @deprecated — use actionTaken */
  contacted: '' | 'today' | 'not-today';
  /** Action Taken filter (replaces Contacted): Today vs No Action. */
  actionTaken: '' | 'today' | 'no-action';
  actionFrom: string;
  actionTo: string;
  /** Called filter: has sales logged a call? */
  called: '' | 'called' | 'not-called';
  calledFrom: string;
  calledTo: string;
}

/**
 * Dashboard deep-link short keys → real pipeline statuses.
 * Exact status names (e.g. ?status=Fresh%20Leads) always win; these aliases
 * cover the executive cards: ?stage=fresh|cold|pending|deal and
 * ?status=answered|no_answer|cancelled.
 */
const STAGE_PARAM_MAP: Record<string, LeadStatus> = {
  fresh: 'Fresh Leads',
  cold: 'Cold Calls',
  pending: 'Pending Leads',
  deal: 'Done Deal',
};
const STATUS_PARAM_ALIAS: Record<string, LeadStatus> = {
  answered: 'Meeting',
  no_answer: 'No Answer',
  cancelled: 'Cancellation',
  cancel: 'Cancellation',
};

export function resolveStatusParam(raw: string | null): LeadStatus | '' {
  if (!raw) return '';
  const v = raw.trim();
  if (!v || v.length > 60) return '';
  // Exact pipeline status (case-insensitive) + filter-only extras the Leads
  // filter dropdown itself offers (e.g. Duplicate Leads).
  const exact = [...ALL_REAL_STATUSES, 'Duplicate Leads'].find(
    (s) => s.toLowerCase() === v.toLowerCase()
  );
  if (exact) return exact as LeadStatus;
  const key = v.toLowerCase().replace(/[\s-]+/g, '_');
  if (STAGE_PARAM_MAP[key] || STATUS_PARAM_ALIAS[key]) {
    return (STAGE_PARAM_MAP[key] || STATUS_PARAM_ALIAS[key]) as LeadStatus;
  }
  // Verbatim fallback: dashboard cards deep-link literal stage names
  // (e.g. Leaders Pending) so the applied filter always matches the card.
  // The API exact-matches crm_status, so unknown values simply yield no rows.
  return v as LeadStatus;
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
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const urlCalled = (p.get('called') || '') as FilterState['called'];
      const urlAction = (p.get('actionTaken') || '') as FilterState['actionTaken'];
      const urlStatus = resolveStatusParam(p.get('stage')) || resolveStatusParam(p.get('status')) || initialStatus || '';
      return {
        search: p.get('search') || '',
        status: urlStatus,
        source: (p.get('source') as LeadSource) || '',
        agent: p.get('agent') || '',
        project: p.get('project') || '',
        propertyType: (p.get('propertyType') as PropertyType) || '',
        action: (p.get('action') as LeadAction) || '',
        contacted: '',
        actionTaken: urlAction,
        actionFrom: p.get('actionFrom') || '',
        actionTo: p.get('actionTo') || '',
        called: urlCalled,
        calledFrom: p.get('calledFrom') || '',
        calledTo: p.get('calledTo') || '',
      };
    }
    return {
      search: '',
      status: initialStatus || '',
      source: '',
      agent: '',
      project: '',
      propertyType: '',
      action: '',
      contacted: '',
      actionTaken: '',
      actionFrom: '',
      actionTo: '',
      called: '',
      calledFrom: '',
      calledTo: '',
    };
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
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  useEffect(() => {
    if (viewLead?.followUpDue) setScheduleDate(viewLead.followUpDue);
    else setScheduleDate('');
    setScheduleTime('09:00');
    setScheduleNotes('');
  }, [viewLead?.id]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
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
  const [postCallLead, setPostCallLead] = useState<Lead | null>(null);
  const [postCallInitiatedAt, setPostCallInitiatedAt] = useState<number | null>(null);
  const [callHistoryKey, setCallHistoryKey] = useState(0);
  const statusPendingRef = useRef<Set<string>>(new Set());
  // Tracks lead IDs that have just had a call logged — they are optimistically
  // removed from the local list and excluded from the next fetchLeads() result
  // so the sales agent's queue is instantly refreshed without a page reload.
  const recentlyCalledRef = useRef<Set<string>>(new Set());
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const viewLeadRef = useRef(viewLead);
  viewLeadRef.current = viewLead;

  // Lock body scroll when View Lead drawer is open (Add Lead modal handled by Modal portal)
  useEffect(() => {
    if (!viewLead) return;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [viewLead]);
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

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;
  const sortKeyRef = useRef(sortKey);
  sortKeyRef.current = sortKey;
  const sortDirRef = useRef(sortDir);
  sortDirRef.current = sortDir;

  // Keep URL search params in sync with active filters so opening a lead,
  // logging a call, drawer closes, or router navigation never wipes active filters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (filters.called) url.searchParams.set('called', filters.called);
    else url.searchParams.delete('called');

    if (filters.actionTaken) url.searchParams.set('actionTaken', filters.actionTaken);
    else url.searchParams.delete('actionTaken');

    if (filters.status) url.searchParams.set('status', filters.status);
    else url.searchParams.delete('status');

    if (filters.search) url.searchParams.set('search', filters.search);
    else url.searchParams.delete('search');

    window.history.replaceState({}, '', url.toString());
  }, [filters]);

  // Deep-link intake via useSearchParams (dashboard cards, follow-ups, topbar):
  // /leads-management?lead=<id> · ?new=1 · ?search= · ?status=<exact|alias> ·
  // ?stage=fresh|cold|pending|deal. Applied on mount AND on in-place query
  // changes (same-page Link navigations don't remount this screen).
  const searchParams = useSearchParams();
  const qpLead = searchParams.get('lead');
  const qpNew = searchParams.get('new');
  const qpSearch = searchParams.get('search');
  const qpStatus = searchParams.get('status');
  const qpStage = searchParams.get('stage');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get('lead');
    const openNew = params.get('new') === '1';
    const searchParam = params.get('search');
    const calledParam = params.get('called') as FilterState['called'];
    const actionTakenParam = params.get('actionTaken') as FilterState['actionTaken'];

    const resolved = resolveStatusParam(params.get('stage')) || resolveStatusParam(params.get('status'));

    setFilters((prev) => {
      const updated = { ...prev };
      let changed = false;
      if (searchParam && searchParam !== prev.search) {
        updated.search = searchParam;
        changed = true;
      }
      if (resolved && resolved !== prev.status) {
        updated.status = resolved;
        changed = true;
      }
      if (calledParam && calledParam !== prev.called) {
        updated.called = calledParam;
        changed = true;
      }
      if (actionTakenParam && actionTakenParam !== prev.actionTaken) {
        updated.actionTaken = actionTakenParam;
        changed = true;
      }
      return changed ? updated : prev;
    });

    if (openNew) {
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      window.history.replaceState({}, '', url.toString());
      setAddModalOpen(true);
    }
    if (!leadId) return;
    leadsService
      .getById(leadId)
      .then((lead) => {
        if (lead) setViewLead(lead as Lead);
      })
      .catch(() => {});
  }, [qpLead, qpNew, qpSearch, qpStatus, qpStage]);

  const fetchLeads = useCallback(async (overrideFilters?: FilterState) => {
    const activeFilters = overrideFilters || filtersRef.current;
    const requestId = ++fetchRef.current;
    if (firstLoadRef.current) setLoading(true);
    try {
      const res = await leadsService.getPage({
        page: currentPageRef.current,
        pageSize: pageSizeRef.current,
        search: activeFilters.search,
        status: activeFilters.status || undefined,
        source: activeFilters.source || undefined,
        agent: activeFilters.agent || undefined,
        project: activeFilters.project || undefined,
        propertyType: activeFilters.propertyType || undefined,
        action: activeFilters.action || undefined,
        contacted: activeFilters.contacted || undefined,
        actionTaken: activeFilters.actionTaken || undefined,
        actionFrom: activeFilters.actionFrom || undefined,
        actionTo: activeFilters.actionTo || undefined,
        called: activeFilters.called || undefined,
        calledFrom: activeFilters.calledFrom || undefined,
        calledTo: activeFilters.calledTo || undefined,
        sortKey: sortKeyRef.current,
        sortDir: sortDirRef.current,
        // Exclude leads that were optimistically removed after call logging
        recentlyCalledIds: Array.from(recentlyCalledRef.current),
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
  }, []);

  const prevSearchRef = useRef(filters.search);

  // Server-side fetch: pagination, filters, and sorting all happen in the DB.
  // Only debounce text search input (150ms); stage/filter/page/sort changes fire in 0ms!
  useEffect(() => {
    const isSearchTyping = !firstLoadRef.current && prevSearchRef.current !== filters.search;
    prevSearchRef.current = filters.search;

    if (!isSearchTyping) {
      fetchLeads();
      return;
    }

    const timer = setTimeout(() => {
      fetchLeads();
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage, pageSize, sortKey, sortDir, fetchLeads]);

  // Real-time two-way stage synchronization with Mobile App & other active sessions
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('web-leads-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            const row = payload.new as Record<string, any>;
            const rawStatus = String(row.crm_status || row.lead_status || '').trim();
            const normalizedStatus: LeadStatus | '' =
              rawStatus.toLowerCase() === 'follow up after meeting'
                ? 'Follow Up After Meeting'
                : rawStatus.toLowerCase() === 'no answer at all'
                  ? 'No Answer At All'
                  : (rawStatus as LeadStatus);

            if (row.id) {
              setLeads((prev) =>
                prev.map((l) =>
                  l.id === row.id
                    ? {
                        ...l,
                        name: row.name ?? l.name,
                        phone: row.phone ?? l.phone,
                        email: row.email ?? l.email,
                        status: normalizedStatus || l.status,
                        notes: row.notes ?? l.notes,
                        followUpDue: row.follow_up_due
                          ? String(row.follow_up_due).slice(0, 10)
                          : l.followUpDue,
                      }
                    : l
                )
              );
              setViewLead((prev) =>
                prev && prev.id === row.id
                  ? {
                      ...prev,
                      name: row.name ?? prev.name,
                      phone: row.phone ?? prev.phone,
                      email: row.email ?? prev.email,
                      status: normalizedStatus || prev.status,
                      notes: row.notes ?? prev.notes,
                      followUpDue: row.follow_up_due
                        ? String(row.follow_up_due).slice(0, 10)
                        : prev.followUpDue,
                    }
                  : prev
              );
            }
          } else {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
              fetchLeads();
            }, 300);
          }
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = useCallback((key: keyof Lead) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback(async (id: string, newStatus: LeadStatus) => {
    if (statusPendingRef.current.has(id)) return;
    statusPendingRef.current.add(id);
    // Snapshot the previous status so we can roll the UI back if the server
    // rejects the change (prevents the preview from lying about the stage).
    const prevLeads = leadsRef.current;
    const prevView = viewLeadRef.current;
    try {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? { ...l, status: newStatus, actionTakenToday: true, contactedToday: true }
            : l
        )
      );
      setViewLead((prev) =>
        prev?.id === id
          ? { ...prev, status: newStatus, actionTakenToday: true, contactedToday: true }
          : prev
      );
      toast.success(`Lead status updated to ${newStatus}`);
      await leadsService.updateStatus(id, newStatus);
      // Unified fix: status "Following Up" / "Follow Up After Meeting" must also guarantee a follow_ups row.
      const needsFollowUp = new Set(['Following Up', 'Follow Up After Meeting', 'Pending Leads', 'Interested', 'Meeting', 'Reservation']).has(newStatus);
      if (needsFollowUp) {
        const src = prevLeads.find((x) => x.id === id) || prevView;
        if (!src?.followUpDue) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const dueDate = tomorrow.toISOString().split('T')[0];
          const dueTime = '09:00';
          // optimistic
          setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, followUpDue: dueDate } : l)));
          setViewLead((prev) => (prev?.id === id ? { ...prev, followUpDue: dueDate } : prev));
          // dual write: leads column (trigger) + canonical follow_ups row (time/notes)
          leadsService.scheduleFollowUp(id, dueDate).catch(() => {});
          followUpsService
            .create(
              {
                title: `Follow up: ${src?.name || 'Lead'}`,
                contactName: src?.name || 'Lead',
                contactPhone: src?.phone || '',
                contactEmail: (src as any)?.email || '',
                type: 'Call',
                status: 'Pending',
                priority: 'Medium',
                dueDate,
                dueTime,
                agent: (src as any)?.agent || '',
                agentInitials: (src as any)?.agentInitials || '',
                notes: (src as any)?.notes || '',
                propertyInterest: (src as any)?.propertyType || (src as any)?.project || '',
                relationshipStatus: 'New',
                leadId: id,
              },
              user?.id || ''
            )
            .catch(() => {});
        }
      }
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
  }, [user?.id]);

  const handleScheduleFollowUp = async () => {
    if (!viewLead) return;
    const id = viewLead.id;
    const dueDate = scheduleDate.trim();
    const dueTime = scheduleTime.trim() || '09:00';
    const notes = scheduleNotes.trim();
    if (!dueDate) {
      toast.error('Pick a follow-up date');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      toast.error('Valid date (YYYY-MM-DD) required');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(dueTime)) {
      toast.error('Valid time (HH:MM) required');
      return;
    }
    // Past guard: same 15m grace as FollowUpForm
    try {
      const slot = new Date(`${dueDate}T${dueTime}:00`);
      if (!Number.isNaN(slot.getTime()) && slot.getTime() < Date.now() - 15 * 60 * 1000) {
        toast.error('Pick a future slot');
        return;
      }
    } catch {}
    const prev = viewLead;
    // Optimistic: reflect date immediately on card/list + drawer, and mark action taken
    setViewLead((v) =>
      v?.id === id ? { ...v, followUpDue: dueDate, actionTakenToday: true, contactedToday: true } : v
    );
    setLeads((prevLeads) =>
      prevLeads.map((l) =>
        l.id === id ? { ...l, followUpDue: dueDate, actionTakenToday: true, contactedToday: true } : l
      )
    );
    toast.success(`Follow-up scheduled for ${dueDate} ${dueTime}${notes ? ' — notes saved' : ''}`);
    setScheduleSaving(false);
    try {
      await Promise.all([
        leadsService.scheduleFollowUp(id, dueDate, user?.id).catch(() => {}),
        followUpsService.create(
          {
            title: `Follow up: ${viewLead.name || 'Lead'}`,
            contactName: viewLead.name || 'Lead',
            contactPhone: viewLead.phone || '',
            contactEmail: viewLead.email || '',
            type: 'Call',
            status: 'Pending',
            priority: 'Medium',
            dueDate,
            dueTime,
            agent: viewLead.agent || '',
            agentInitials: viewLead.agentInitials || '',
            notes: notes || viewLead.notes || '',
            propertyInterest: viewLead.propertyType || viewLead.project || '',
            relationshipStatus: 'New',
            leadId: id,
          },
          user?.id || ''
        ),
      ]);
    } catch (err: any) {
      setViewLead(prev ?? null);
      setLeads((prevLeads) =>
        prevLeads.map((l) =>
          l.id === id
            ? { ...l, followUpDue: prev?.followUpDue || '', actionTakenToday: prev?.actionTakenToday }
            : l
        )
      );
      toast.error(err?.message || 'Failed to schedule follow-up');
    }
  };

  // Legacy 2-arg shim for older call sites (LogCallModal etc. still call with id+date)
  const handleScheduleFollowUpLegacy = async (id: string, dueDate: string) => {
    if (!dueDate) return;
    const target = leads.find((l) => l.id === id) || (viewLead?.id === id ? viewLead : null);
    if (!target) {
      await leadsService.scheduleFollowUp(id, dueDate, user?.id).catch(() => {});
      return;
    }
    setScheduleDate(dueDate);
    setScheduleTime('09:00');
    setScheduleNotes('');
    if (!viewLead || viewLead.id !== id) setViewLead(target);
    // Defer to the canonical handler on next tick so state settles
    setTimeout(() => handleScheduleFollowUp(), 0);
  };

  const handleDeleteLead = useCallback(async (id: string) => {
    if (!isAdminRole(user?.role)) {
      toast.error('Only owner and admin can delete leads.');
      return;
    }
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
  }, [user?.role]);

  const handleViewLead = useCallback((lead: Lead) => {
    setViewLead(lead);
    setViewTab('overview');
  }, []);

  const handleEditLead = useCallback((lead: Lead) => {
    setEditLead(lead);
  }, []);

  const handleOpenLogCall = useCallback((lead: Lead) => {
    setLogCallLead(lead);
  }, []);

  const handleAddNote = useCallback((lead: Lead) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id ? { ...l, actionTakenToday: true, contactedToday: true } : l
      )
    );
    setViewLead((prev) =>
      prev?.id === lead.id ? { ...prev, actionTakenToday: true, contactedToday: true } : prev
    );
  }, []);

  const handlePageSizeChange = useCallback((s: number) => {
    setPageSize(s);
    setCurrentPage(1);
  }, []);

  /**
   * Called by LogCallModal after the backend confirms a successful save.
   * Optimistically removes the lead from the local list AND records the ID so
   * the next server fetch also excludes it (via the `recentlyCalled` filter).
   * The lead is NOT deleted — only hidden from the agent's working queue.
   */
  const handleCallLogged = useCallback((loggedLead: Lead, outcome: string) => {
    const leadId = loggedLead.id;

    // 1. Optimistic local update/removal:
    // When filtering by 'not-called', the lead has now been called, so remove it from the list.
    // When not filtering by 'not-called', update the lead in-place with called status so it doesn't vanish unnecessarily.
    const isFilteredNotCalled = filtersRef.current.called === 'not-called';

    setLeads((prev) => {
      if (isFilteredNotCalled) {
        return prev.filter((l) => l.id !== leadId);
      }
      return prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              hasBeenCalled: true,
              lastCallOutcome: outcome,
              lastCallAt: new Date().toISOString(),
              actionTakenToday: true,
            }
          : l
      );
    });

    if (isFilteredNotCalled) {
      setTotal((t) => Math.max(0, t - 1));
    }

    // 2. Remove from selected set (if selected)
    setSelectedIds((prev) => {
      if (!prev.has(leadId)) return prev;
      const n = new Set(prev);
      n.delete(leadId);
      return n;
    });

    // 3. Close the lead preview drawer if this lead was open
    setViewLead((curr) => (curr?.id === leadId ? null : curr));

    // 4. Track ID so server query excludes it when filtering not-called
    if (isFilteredNotCalled) {
      recentlyCalledRef.current.add(leadId);
      setTimeout(() => recentlyCalledRef.current.delete(leadId), 5 * 60 * 1000);
    }

    // 5. Trigger a silent background refresh with active filters preserved
    void fetchLeads();
  }, [fetchLeads]);

  // Post-Call Outcome: triggered by Call button — shows modal immediately + dials tel:
  const handlePostCallTrigger = useCallback((lead: Lead) => {
    setPostCallInitiatedAt(Date.now());
    setPostCallLead(lead);
    if (lead.phone) {
      const tel = lead.phone.replace(/[^0-9+,]/g, '');
      if (tel) {
        // Let React paint the portal modal before the OS dialer steals focus
        setTimeout(() => {
          window.location.href = `tel:${tel}`;
        }, 80);
      }
    }
  }, []);

  const handlePostCallSaved = useCallback(
    (lead: Lead, outcome: string) => {
      // Remove/update from queue instantly — same optimistic pattern as LogCall
      handleCallLogged(lead, outcome);
      setPostCallLead(null);
      setPostCallInitiatedAt(null);
    },
    [handleCallLogged],
  );

  const handleBulkDelete = async () => {
    if (!isAdminRole(user?.role)) {
      toast.error('Only owner and admin can delete leads.');
      return;
    }
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

  const handleBulkRefer = async (referredToUserId: string, referredToName: string) => {
    const ids = Array.from(selectedIds);
    try {
      await leadsService.bulkReferUsers(ids, referredToUserId, user?.id);
      setLeads((prev) =>
        prev.map((l) =>
          selectedIds.has(l.id)
            ? {
                ...l,
                referredTo: referredToUserId,
                referredToName,
                referredBy: user?.id || null,
                referredByName: user?.name || null,
              }
            : l
        )
      );
      toast.success(`Referred ${ids.length} leads to ${referredToName}`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to refer leads');
    }
  };

  const handleAddLead = async (lead: Lead) => {
    setDupChecking(false);
    setDupWarning(null);
    await createLead(lead);
  };

  const createLead = async (lead: Lead) => {
    try {
      setAddModalOpen(false);
      const created = await leadsService.create(lead, user?.id || '');
      setLeads((prev) => [created as Lead, ...prev]);
      setTotal((t) => t + 1);
      if ((created as any)?.isDuplicate || (created as any)?.routedToDuplicateCenter) {
        toast.success(`Lead "${lead.name}" accepted and routed to Duplicate Center for review`);
      } else {
        toast.success(`Lead "${lead.name}" added successfully`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add lead');
    }
  };

  /** "Create anyway" fallback if dupWarning is ever triggered. */
  const createDuplicateAnyway = async () => {
    if (!dupWarning) return;
    const { pendingLead } = dupWarning;
    setDupWarning(null);
    await createLead(pendingLead);
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
        contacted: filters.contacted || undefined,
        actionTaken: filters.actionTaken || undefined,
        actionFrom: filters.actionFrom || undefined,
        actionTo: filters.actionTo || undefined,
        called: filters.called || undefined,
        calledFrom: filters.calledFrom || undefined,
        calledTo: filters.calledTo || undefined,
      });
      const rows = (res.data || []).map((l: any) => [
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
      const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
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

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) setSelectedIds(new Set(leads.map((l) => l.id)));
    else setSelectedIds(new Set());
  }, [leads]);

  const handleSelectRow = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const clearFilters = () => {
    setFilters({
      search: '',
      status: initialStatus || '',
      source: '',
      agent: '',
      project: '',
      propertyType: '',
      action: '',
      contacted: '',
      actionTaken: '',
      actionFrom: '',
      actionTo: '',
      called: '',
      calledFrom: '',
      calledTo: '',
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
    <div className="page-aurora min-h-[calc(100dvh-8rem)] lg:min-h-full space-y-5 rounded-[2rem] p-3 sm:p-5 flex flex-col">
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
          <a
            href="/import-history"
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="View Excel Import History & Download Uploaded Sheets"
          >
            <ClipboardList size={15} />
            <span className="hidden sm:inline">Import History</span>
          </a>
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
          <button onClick={() => fetchLeads()} className="btn-secondary shrink-0">
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
            onDelete={handleDeleteLead}
            isAdmin={isAdminRole(user?.role)}
            onPostCall={handlePostCallTrigger}
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
            onView={handleViewLead}
            onEdit={handleEditLead}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={total}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
            onOpenLogCall={handleOpenLogCall}
            onAddNote={handleAddNote}
            onPostCall={handlePostCallTrigger}
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
        onRefer={handleBulkRefer}
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

      {/* View Lead Drawer — Redesigned Material 3 Stitch Lead Profile Side Panel */}
      {viewLead && typeof document !== 'undefined' && createPortal(
        <LeadProfileSidePanel
          lead={viewLead}
          onClose={() => setViewLead(null)}
          onStatusChange={handleStatusChange}
          onPostCallTrigger={handlePostCallTrigger}
          onLogCall={(l) => setLogCallLead(l)}
          onEdit={(l) => {
            setEditLead(l);
            setViewLead(null);
          }}
          onSiteVisit={fetchAndOpenSiteVisit}
          onDealModal={(l, status) => setDealModal({ lead: l, status })}
          onPayPlan={(l) => setPayPlanLead(l)}
          onWhatsAppAction={handleWhatsAppAction}
          scheduleDate={scheduleDate}
          setScheduleDate={setScheduleDate}
          scheduleTime={scheduleTime}
          setScheduleTime={setScheduleTime}
          scheduleNotes={scheduleNotes}
          setScheduleNotes={setScheduleNotes}
          handleScheduleFollowUp={handleScheduleFollowUp}
          scheduleSaving={scheduleSaving}
          callHistoryKey={callHistoryKey}
        />,
        document.body
      )}

      {/* Edit Lead Modal — dedicated edit interface (not AddLeadForm) */}
      {editLead && (
        <Modal
          open={!!editLead}
          onClose={() => setEditLead(null)}
          title="Edit lead"
          subtitle={`Editing details for ${editLead.name}`}
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
          onCallLogged={handleCallLogged}
        />
      )}

      {/* Post-Call Outcome Modal — triggered by Call button (tel: + instant modal) */}
      <PostCallOutcomeModal
        lead={postCallLead}
        open={!!postCallLead}
        onClose={() => {
          setPostCallLead(null);
          setPostCallInitiatedAt(null);
        }}
        onSaved={handlePostCallSaved}
      />


    </div>
  );
}

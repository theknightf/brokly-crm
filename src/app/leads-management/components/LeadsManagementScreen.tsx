'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Download,
  Upload,
  SlidersHorizontal,
  TriangleAlert,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  ClipboardList,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import { SiteVisitSheet } from '@/components/mobile/SiteVisitSheet';
import LeadsTable from './LeadsTable';
import LeadBoard from './LeadBoard';
import LeadsFilters, { useLeadFilterOptions, activityOf } from './LeadsFilters';
import LeadsToolbar, { LeadsFilterDrawer } from './LeadsToolbar';
import LeadsStatusStrip from './LeadsStatusStrip';
import AddLeadForm from './AddLeadForm';
import EditLeadForm from './EditLeadForm';
import BulkActionBar from './BulkActionBar';
import AssignmentHistoryModal from './AssignmentHistoryModal';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus, LeadSource, PropertyType, LeadAction } from './mockLeads';
import { ALL_REAL_STATUSES } from './leadStages';
import { leadsService, followUpsService, leadCommentsService } from '@/lib/services/crmService';
import { duplicateLeadsService } from '@/lib/services/peopleOpsService';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole } from '@/lib/roles';
import StatusNoteModal from './StatusNoteModal';
import LeadProfileDrawer, { scheduleLeadFollowUp } from './LeadProfileDrawer';
import PostCallOutcomeModal from './PostCallOutcomeModal';

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

/** Stage name as it appears in the address bar: "Not Interested" -> "not-interested". */
export function stageToParam(stage: string): string {
  return stage.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

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
  // Shareable kebab-case form: ?stage=not-interested
  const kebab = [...ALL_REAL_STATUSES, 'Duplicate Leads'].find((s) => stageToParam(s) === stageToParam(v));
  if (kebab) return kebab as LeadStatus;
  const key = v.toLowerCase().replace(/[\s-]+/g, '_');
  if (STAGE_PARAM_MAP[key] || STATUS_PARAM_ALIAS[key]) {
    return (STAGE_PARAM_MAP[key] || STATUS_PARAM_ALIAS[key]) as LeadStatus;
  }
  // Verbatim fallback: dashboard cards deep-link literal stage names
  // (e.g. Leaders Pending) so the applied filter always matches the card.
  // The API exact-matches crm_status, so unknown values simply yield no rows.
  return v as LeadStatus;
}

export function leadMatchesFilters(lead: Partial<Lead>, f: FilterState): boolean {
  if (f.status) {
    const s = lead.status || 'Fresh Leads';
    if (s !== f.status) return false;
  }
  if (f.search && f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const nameMatch = lead.name?.toLowerCase().includes(q);
    const emailMatch = lead.email?.toLowerCase().includes(q);
    const phoneMatch = lead.phone?.toLowerCase().includes(q);
    const locMatch = (lead as any)?.location?.toLowerCase().includes(q);
    if (!nameMatch && !emailMatch && !phoneMatch && !locMatch) return false;
  }
  if (f.source) {
    if (!lead.source || lead.source !== f.source) return false;
  }
  if (f.agent) {
    const qAgent = f.agent.toLowerCase();
    const agentMatch = lead.agent?.toLowerCase().includes(qAgent);
    const assignedToMatch = lead.assignedToName?.toLowerCase().includes(qAgent);
    const assignedNamesMatch = lead.assignedToNames?.some((n) => n.toLowerCase().includes(qAgent));
    const assigneesMatch = lead.assignees?.some((a) => a.userName?.toLowerCase().includes(qAgent));
    if (!agentMatch && !assignedToMatch && !assignedNamesMatch && !assigneesMatch) return false;
  }
  if (f.project) {
    if ((lead as any)?.project !== f.project) return false;
  }
  if (f.propertyType) {
    if (lead.propertyType !== f.propertyType) return false;
  }
  if (f.called === 'called') {
    if (!lead.hasBeenCalled && !lead.lastContact && !lead.lastCallAt) return false;
  } else if (f.called === 'not-called') {
    if (lead.hasBeenCalled || lead.lastCallAt) return false;
  }
  if (f.actionTaken === 'today') {
    if (!lead.actionTakenToday && !lead.contactedToday) return false;
  } else if (f.actionTaken === 'no-action') {
    if (lead.actionTakenToday || lead.contactedToday) return false;
  }
  return true;
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
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const filterOptions = useLeadFilterOptions();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initSearchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() => {
    {
      // useSearchParams (not window.location): during a client-side navigation the address bar
      // still holds the previous page's URL when this first render runs.
      const p = initSearchParams;
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
  const [assignmentHistoryOpen, setAssignmentHistoryOpen] = useState(false);
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
  // Filters drawer — collapsed by default so the table is visible above the fold.
  const [showFilters, setShowFilters] = useState(false);
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
  const totalRef = useRef(total);
  totalRef.current = total;
  const statusCountsRef = useRef(statusCounts);
  statusCountsRef.current = statusCounts;

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

  // The counts query pages through every lead, so never run two at once: while one is in flight,
  // further requests collapse into a single re-run with the latest filters.
  const skipCountsRef = useRef(false);
  const countsKeyRef = useRef<string | null>(null);
  const countsBusyRef = useRef(false);
  const countsAgainRef = useRef<{ f?: FilterState } | null>(null);
  const loadStatusCounts = useCallback(async (overrideFilters?: FilterState): Promise<void> => {
    if (countsBusyRef.current) {
      countsAgainRef.current = { f: overrideFilters };
      return;
    }
    countsBusyRef.current = true;
    try {
      const activeFilters = overrideFilters || filtersRef.current;
      const counts = await leadsService.getStatusCounts({
        search: activeFilters.search || undefined,
        agent: activeFilters.agent || undefined,
        source: activeFilters.source || undefined,
        project: activeFilters.project || undefined,
        propertyType: activeFilters.propertyType || undefined,
        action: activeFilters.action || undefined,
        actionTaken: activeFilters.actionTaken || undefined,
        actionFrom: activeFilters.actionFrom || undefined,
        actionTo: activeFilters.actionTo || undefined,
        called: activeFilters.called || undefined,
        calledFrom: activeFilters.calledFrom || undefined,
        calledTo: activeFilters.calledTo || undefined,
        recentlyCalledIds: Array.from(recentlyCalledRef.current),
      });
      if (counts && typeof counts === 'object') {
        setStatusCounts(counts);
      }
    } catch {
    } finally {
      countsBusyRef.current = false;
      const again = countsAgainRef.current;
      countsAgainRef.current = null;
      if (again) void loadStatusCounts(again.f);
    }
  }, []);

  // Keep URL search params in sync with active filters so opening a lead,
  // logging a call, drawer closes, or router navigation never wipes active filters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (filters.called) url.searchParams.set('called', filters.called);
    else url.searchParams.delete('called');

    if (filters.actionTaken) url.searchParams.set('actionTaken', filters.actionTaken);
    else url.searchParams.delete('actionTaken');

    // The stage lives in the URL as ?stage=not-interested so the view can be shared and survives a reload.
    // (?status=… is still accepted when reading, for older links.)
    // Non-standard stage names (rare dashboard deep links) are kept verbatim so a reload resolves them identically.
    const knownStage = ([...ALL_REAL_STATUSES, 'Duplicate Leads'] as string[]).includes(filters.status);
    if (filters.status) url.searchParams.set('stage', knownStage ? stageToParam(filters.status) : filters.status);
    else url.searchParams.delete('stage');
    url.searchParams.delete('status');

    if (filters.search) url.searchParams.set('search', filters.search);
    else url.searchParams.delete('search');

    const optionalParams: [string, string][] = [
      ['source', filters.source],
      ['agent', filters.agent],
      ['project', filters.project],
      ['propertyType', filters.propertyType],
      ['action', filters.action],
      ['actionFrom', filters.actionFrom],
      ['actionTo', filters.actionTo],
      ['calledFrom', filters.calledFrom],
      ['calledTo', filters.calledTo],
    ];
    for (const [k, v] of optionalParams) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }

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
  const qpAgent = searchParams.get('agent');

  useEffect(() => {
    // Hook value first: during a client-side navigation window.location can still be the previous URL.
    const params = new URLSearchParams(searchParams.toString() || window.location.search);
    const leadId = params.get('lead');
    const openNew = params.get('new') === '1';
    const searchParam = params.get('search');
    const agentParam = params.get('agent');
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
      if (agentParam && agentParam !== prev.agent) {
        // Analytics deep link (?agent=&status=): replace the owner AND the stage together.
        updated.agent = agentParam;
        if (!resolved && prev.status) updated.status = '' as FilterState['status'];
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
  }, [qpLead, qpNew, qpSearch, qpStatus, qpStage, qpAgent]);

  const fetchLeads = useCallback(async (overrideFilters?: FilterState) => {
    const activeFilters = overrideFilters || filtersRef.current;
    const requestId = ++fetchRef.current;
    // Stage counts ignore the stage filter, page and sort: start them alongside the list (not after
    // it) and skip them when only the stage / page / sort changed.
    if (skipCountsRef.current) skipCountsRef.current = false;
    else void loadStatusCounts(activeFilters);
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
      setTotal(0);
    } finally {
      if (requestId === fetchRef.current) {
        setLoading(false);
        firstLoadRef.current = false;
      }
    }
  }, [loadStatusCounts]);

  const prevSearchRef = useRef(filters.search);

  // Server-side fetch: pagination, filters, and sorting all happen in the DB.
  // Only debounce text search input (150ms); stage/filter/page/sort changes fire in 0ms!
  useEffect(() => {
    const isSearchTyping = !firstLoadRef.current && prevSearchRef.current !== filters.search;
    prevSearchRef.current = filters.search;

    // Counts depend on every filter except the stage: reuse them when only stage/page/sort changed.
    const { status: _stage, ...countFilters } = filters;
    const countsKey = JSON.stringify(countFilters);
    skipCountsRef.current = countsKeyRef.current === countsKey;
    countsKeyRef.current = countsKey;

    if (!isSearchTyping) {
      fetchLeads();
      return;
    }

    const timer = setTimeout(() => {
      fetchLeads();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage, pageSize, sortKey, sortDir, fetchLeads]);

  // Real-time two-way stage synchronization with Mobile App & other active sessions
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let countsTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('web-leads-realtime-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          // Non-admins only get their own leads; the server filters before the (expensive) RLS check.
          ...(profile?.role && !isAdminRole(profile.role) && user?.id ? { filter: `assigned_to=eq.${user.id}` } : {}),
        },
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
              const existing = leadsRef.current.find((l) => l.id === row.id);
              if (existing) {
                const updated: Lead = {
                  ...existing,
                  name: row.name ?? existing.name,
                  phone: row.phone ?? existing.phone,
                  email: row.email ?? existing.email,
                  status: normalizedStatus || existing.status,
                  notes: row.notes ?? existing.notes,
                  followUpDue: row.follow_up_due
                    ? String(row.follow_up_due).slice(0, 10)
                    : existing.followUpDue,
                };
                if (!leadMatchesFilters(updated, filtersRef.current)) {
                  setLeads((prev) => prev.filter((l) => l.id !== row.id));
                  setTotal((t) => Math.max(0, t - 1));
                } else {
                  setLeads((prev) => prev.map((l) => (l.id === row.id ? updated : l)));
                }
              }
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
              // Counts only change when a stage changes; batch bursts and skip hidden tabs.
              const prevStatus = leadsRef.current.find((l) => l.id === row.id)?.status;
              if (document.visibilityState === 'visible' && (!prevStatus || (normalizedStatus && normalizedStatus !== prevStatus))) {
                if (countsTimer) clearTimeout(countsTimer);
                countsTimer = setTimeout(() => void loadStatusCounts(), 2500);
              }
            }
          } else if (document.visibilityState === 'visible') {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
              fetchLeads();
            }, 2000);
          }
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (countsTimer) clearTimeout(countsTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role]);

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

  // "Write a note first" dialog, as a promise: resolves with the note, or null when cancelled.
  const [noteAsk, setNoteAsk] = useState<{ label: string; status: string; count: number; resolve: (n: string | null) => void } | null>(null);
  const askNote = useCallback(
    (label: string, status: string, count: number) =>
      new Promise<string | null>((resolve) => setNoteAsk({ label, status, count, resolve })),
    []
  );

  const handleStatusChange = useCallback(async (id: string, newStatus: LeadStatus) => {
    if (statusPendingRef.current.has(id)) return;
    statusPendingRef.current.add(id);
    // Snapshot the previous state so we can roll the UI back if the server rejects the change
    const prevLeads = leadsRef.current;
    const prevTotal = totalRef.current;
    const prevView = viewLeadRef.current;
    const prevStatusCounts = statusCountsRef.current;

    const existingLead = prevLeads.find((x) => x.id === id) || (prevView?.id === id ? prevView : null);
    const oldStatus = (existingLead?.status || 'Fresh Leads') as LeadStatus;

    if (existingLead && oldStatus === newStatus) {
      statusPendingRef.current.delete(id);
      return;
    }

    // Sales users cannot change a stage without a written note: ask first, save it as a lead comment, then change.
    if (!isAdminRole(profile?.role)) {
      const note = await askNote(existingLead?.name || 'Lead', newStatus, 1);
      if (!note) {
        statusPendingRef.current.delete(id);
        return;
      }
      try {
        await leadCommentsService.create(id, note, user?.id || '');
      } catch (e: any) {
        statusPendingRef.current.delete(id);
        toast.error(e?.message || 'Could not save the note, so the stage was not changed.');
        return;
      }
    }

    const updatedLead: Lead = existingLead
      ? { ...existingLead, status: newStatus, actionTakenToday: true, contactedToday: true }
      : ({ id, status: newStatus, actionTakenToday: true, contactedToday: true } as any);

    const stillMatches = leadMatchesFilters(updatedLead, filtersRef.current);

    try {
      setLeads((prev) => {
        if (!stillMatches) {
          return prev.filter((l) => l.id !== id);
        }
        return prev.map((l) => (l.id === id ? updatedLead : l));
      });

      if (!stillMatches) {
        setTotal((t) => Math.max(0, t - 1));
      }

      setViewLead((prev) =>
        prev?.id === id
          ? { ...prev, status: newStatus, actionTakenToday: true, contactedToday: true }
          : prev
      );

      setStatusCounts((prev) => {
        const next = { ...prev };
        if (oldStatus && next[oldStatus] !== undefined) {
          next[oldStatus] = Math.max(0, next[oldStatus] - 1);
        }
        next[newStatus] = (next[newStatus] || 0) + 1;
        return next;
      });

      toast.success(`Lead status updated to ${newStatus}`);
      await leadsService.updateStatus(id, newStatus);
      // An active status filter (e.g. Cold Calls) must stop showing the lead the
      // moment it no longer matches, without waiting for a refetch.
      if (filters.status && filters.status !== newStatus) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        setSelectedIds((prev) => {
          if (!prev.has(id)) return prev;
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        setViewLead((prev) => (prev?.id === id ? null : prev));
      }
      void loadStatusCounts();
      // Unified fix: status "Following Up" / "Follow Up After Meeting" must also guarantee a follow_ups row.
      const needsFollowUp = new Set(['Following Up', 'Follow Up After Meeting', 'Pending Leads', 'Interested', 'Meeting', 'Reservation']).has(newStatus);
      if (needsFollowUp) {
        const src = existingLead || prevView;
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
      setLeads(prevLeads);
      setTotal(prevTotal);
      setViewLead(prevView);
      setStatusCounts(prevStatusCounts);
      toast.error(
        /NOTE_REQUIRED/.test(String(err?.message))
          ? 'Write a note first: the stage cannot change without one.'
          : err?.message || 'Failed to update status'
      );
    } finally {
      statusPendingRef.current.delete(id);
    }
  }, [user?.id, profile?.role, filters.status, loadStatusCounts]);

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
    setScheduleSaving(true);
    try {
      await scheduleLeadFollowUp(viewLead, dueDate, dueTime, notes, user?.id || '');
      // Update local state ONLY after success
      setViewLead((v) =>
        v?.id === id
          ? { ...v, followUpDue: dueDate, notes: notes || v.notes, actionTakenToday: true, contactedToday: true }
          : v
      );
      setLeads((prevLeads) =>
        prevLeads.map((l) =>
          l.id === id
            ? { ...l, followUpDue: dueDate, notes: notes || l.notes, actionTakenToday: true, contactedToday: true }
            : l
        )
      );
      toast.success(`Follow-up scheduled for ${dueDate} ${dueTime}${notes ? ' — notes saved' : ''}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule follow-up');
    } finally {
      setScheduleSaving(false);
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
    if (!isAdminRole(profile?.role)) {
      toast.error('Only owner and admin can delete leads.');
      return;
    }
    const targetLead = leadsRef.current.find((l) => l.id === id);
    try {
      await leadsService.delete(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      if (targetLead?.status) {
        const s = targetLead.status;
        setStatusCounts((prev) => ({
          ...prev,
          [s]: Math.max(0, (prev[s] || 0) - 1),
        }));
      }
      void loadStatusCounts();
      toast.success('Lead deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete lead');
    }
  }, [profile?.role, loadStatusCounts]);

  const handleViewLead = useCallback((lead: Lead) => {
    setViewLead(lead);
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
        l.id === lead.id ? { ...l, notes: lead.notes, actionTakenToday: true, contactedToday: true } : l
      )
    );
    setViewLead((prev) =>
      prev?.id === lead.id ? { ...prev, notes: lead.notes, actionTakenToday: true, contactedToday: true } : prev
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
    const existing = leadsRef.current.find((l) => l.id === leadId);
    const updatedLead: Lead = {
      ...(existing || loggedLead),
      ...loggedLead,
      hasBeenCalled: true,
      lastCallOutcome: outcome,
      lastCallAt: new Date().toISOString(),
      actionTakenToday: true,
      contactedToday: true,
    };

    const stillMatches = leadMatchesFilters(updatedLead, filtersRef.current);

    setLeads((prev) => {
      if (!stillMatches) {
        return prev.filter((l) => l.id !== leadId);
      }
      return prev.map((l) => (l.id === leadId ? updatedLead : l));
    });

    if (!stillMatches) {
      setTotal((t) => Math.max(0, t - 1));
    }

    // 2. Remove from selected set (if selected)
    setSelectedIds((prev) => {
      if (!prev.has(leadId)) return prev;
      const n = new Set(prev);
      n.delete(leadId);
      return n;
    });

    // 3. Close the lead preview drawer if this lead no longer matches
    setViewLead((curr) => (curr?.id === leadId ? (stillMatches ? updatedLead : null) : curr));

    // 4. Track ID so server query excludes it when filtering not-called
    if (filtersRef.current.called === 'not-called') {
      recentlyCalledRef.current.add(leadId);
      setTimeout(() => recentlyCalledRef.current.delete(leadId), 5 * 60 * 1000);
    }

    // 5. Update counts and trigger background refresh
    void loadStatusCounts();
    void fetchLeads();
  }, [fetchLeads, loadStatusCounts]);

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

  /** Apply one status to every selected lead (reuses leadsService.updateStatus, 5 at a time). */
  const handleBulkStatusChange = async (newStatus: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    // Sales users: one written note, added to every selected lead BEFORE their stage changes.
    let bulkNote = '';
    if (!isAdminRole(profile?.role)) {
      const n = await askNote('', newStatus, ids.length);
      if (!n) return;
      bulkNote = n;
    }
    const okIds: string[] = [];
    let failed = 0;
    for (let i = 0; i < ids.length; i += 5) {
      const chunk = ids.slice(i, i + 5);
      const results = await Promise.allSettled(
        chunk.map(async (id) => {
          if (bulkNote) await leadCommentsService.create(id, bulkNote, user?.id || '');
          return leadsService.updateStatus(id, newStatus);
        })
      );
      results.forEach((r, k) => {
        if (r.status === 'fulfilled') okIds.push(chunk[k]);
        else failed += 1;
      });
    }
    if (okIds.length) {
      const ok = new Set(okIds);
      // Same rule as the single-lead change: with a status filter active, leads that no
      // longer match leave the list immediately.
      if (filters.status && filters.status !== newStatus) {
        setLeads((prev) => prev.filter((l) => !ok.has(l.id)));
        setTotal((n) => Math.max(0, n - okIds.length));
      } else {
        setLeads((prev) =>
          prev.map((l) => (ok.has(l.id) ? { ...l, status: newStatus as LeadStatus } : l))
        );
      }
      setSelectedIds(new Set());
      void loadStatusCounts();
    }
    if (failed > 0) {
      toast.error(t('leads.bulkStatusPartial', { ok: okIds.length, failed }));
    } else {
      toast.success(t('leads.bulkStatusDone', { count: okIds.length }));
    }
  };

  const handleBulkDelete = async () => {
    if (!isAdminRole(profile?.role)) {
      toast.error('Only owner and admin can delete leads.');
      return;
    }
    const ids = Array.from(selectedIds);
    try {
      await leadsService.bulkDelete(ids);
      setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
      setTotal((t) => Math.max(0, t - ids.length));
      void loadStatusCounts();
      toast.success(`${ids.length} leads deleted`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete leads');
    }
  };

  // `stage` is the stage the owner chose in the assign dialog; it is applied right after the assignment succeeds.
  const applyChosenStage = async (ids: string[], stage?: string) => {
    if (!stage) return;
    try {
      await leadsService.bulkSetStatus(ids, stage);
      const idSet = new Set(ids);
      setLeads((prev) => prev.map((l) => (idSet.has(l.id) ? { ...l, status: stage as LeadStatus } : l)));
      void loadStatusCounts();
    } catch (err: any) {
      toast.error(`Assigned, but the stage could not be set to "${stage}": ${err?.message || 'try again'}`);
    }
  };

  const handleBulkAssignMany = async (
    users: { id: string; name: string }[],
    stage?: string,
    mode: 'co_assign' | 'round_robin' = 'co_assign'
  ) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || !users.length) return;
    // Snapshot before anything changes: the history records what these leads looked like when assigned.
    const batchLeads = leads.filter((l) => selectedIds.has(l.id));
    try {
      if (mode === 'co_assign' || users.length <= 2) {
        const userIds = users.slice(0, 2).map((u) => u.id);
        const userNames = users.slice(0, 2).map((u) => u.name);
        await leadsService.bulkAssignUsers(ids, userIds, userNames);
        setLeads((prev) =>
          prev.map((l) => {
            if (!selectedIds.has(l.id)) return l;
            return {
              ...l,
              agent: userNames[0] || l.agent,
              agentInitials: (userNames[0] || l.agent || '')
                .split(' ')
                .map((p) => p[0])
                .join(''),
              assignedTo: userIds[0] || undefined,
              assignedToName: userNames.join(' & '),
              assignedToIds: userIds,
              assignedToNames: userNames,
              assignees: userIds.map((id, i) => ({ userId: id, userName: userNames[i] })),
            };
          })
        );
        await applyChosenStage(ids, stage);
        void leadsService.logAssignmentBatch({
          kind: 'agents',
          stage,
          leads: batchLeads,
          assignees: users.slice(0, 2).map((u) => ({ id: u.id, name: u.name, count: ids.length })),
          createdByName: user?.name,
        });
        toast.success(`Assigned ${ids.length} leads to ${userNames.join(' & ')}${stage ? ` · stage: ${stage}` : ''}`);
        setSelectedIds(new Set());
        // Reload from the server: the patch above is only a preview; ownership, visibility
        // (leads you no longer own) and counts must come from the database.
        void fetchLeads();
        return;
      }
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
            assignedToIds: [a.userId],
            assignedToNames: [a.name],
            assignees: [{ userId: a.userId, userName: a.name }],
          };
        })
      );
      const counts = users.map((u) => ({
        name: u.name,
        count: done.filter((a) => a.userId === u.id).length,
      }));
      await applyChosenStage(ids, stage);
      void leadsService.logAssignmentBatch({
        kind: 'agents',
        stage,
        leads: batchLeads,
        assignees: counts.map((c, i) => ({ id: users[i]?.id, name: c.name, count: c.count })),
        createdByName: user?.name,
      });
      toast.success(
        `Assigned ${ids.length} leads:${counts.map((c) => `${c.name} × ${c.count}`).join(', ')}${stage ? ` · stage: ${stage}` : ''}`
      );
      setSelectedIds(new Set());
      void fetchLeads();
    } catch (err: any) {
      toast.error(err?.message || 'Assignment failed — no leads were changed');
    }
  };

  const handleBulkAssignTeam = async (teamName: string, stage?: string) => {
    const ids = Array.from(selectedIds);
    const batchLeads = leads.filter((l) => selectedIds.has(l.id));
    try {
      await leadsService.bulkSetTeam(ids, teamName);
      await applyChosenStage(ids, stage);
      void leadsService.logAssignmentBatch({
        kind: 'team',
        teamName,
        stage,
        leads: batchLeads,
        assignees: [],
        createdByName: user?.name,
      });
      setLeads((prev) => prev.map((l) => (selectedIds.has(l.id) ? { ...l, team: teamName } : l)));
      toast.success(`${ids.length} leads assigned to team "${teamName}"`);
      setSelectedIds(new Set());
      void fetchLeads();
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
      void fetchLeads();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to refer leads');
    }
  };

  const handleAddLead = async (lead: Lead, options?: { keepOpen?: boolean }): Promise<boolean> => {
    setDupChecking(false);
    setDupWarning(null);
    return createLead(lead, options);
  };

  const createLead = async (lead: Lead, options?: { keepOpen?: boolean }): Promise<boolean> => {
    try {
      // "Save & add another" keeps the modal open so the agent can type the
      // next number straight away.
      if (!options?.keepOpen) setAddModalOpen(false);
      const created = await leadsService.create(lead, user?.id || '');
      const createdLead = created as Lead;
      const matches = leadMatchesFilters(createdLead, filtersRef.current);
      if (matches) {
        setLeads((prev) => [createdLead, ...prev]);
        setTotal((t) => t + 1);
      }
      void loadStatusCounts();
      void fetchLeads();
      toast.success(`${t('leadForm.created')} — ${lead.name}`, {
        action: createdLead?.id
          ? {
              label: t('leadForm.viewLead'),
              onClick: () => router.push(`/leads/${createdLead.id}`),
            }
          : undefined,
      });
      return true;
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_LEAD') {
        // Deliberately generic: never reveal who owns the original lead.
        toast.info('This lead already exists');
        return false;
      }
      toast.error(err?.message || 'Failed to add lead');
      return false;
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
      // Sales users cannot change the stage without a written note (the form edit included).
      if (!isAdminRole(profile?.role) && original && updated.status && updated.status !== original.status) {
        const note = await askNote(updated.name || 'Lead', String(updated.status), 1);
        if (!note) return;
        await leadCommentsService.create(updated.id, note, user?.id || '');
      }
      const isAssigneesChanged =
        JSON.stringify(original?.assignedToIds || (original?.assignedTo ? [original.assignedTo] : [])) !==
        JSON.stringify(updated.assignedToIds || (updated.assignedTo ? [updated.assignedTo] : []));
      const assignmentOnly =
        original &&
        isAssigneesChanged &&
        Object.keys(updated).every((key) => {
          if (
            key === 'assignedTo' ||
            key === 'assignedToName' ||
            key === 'assignedToIds' ||
            key === 'assignedToNames' ||
            key === 'assignees' ||
            key === 'agent' ||
            key === 'agentInitials'
          )
            return true;
          return (updated as any)[key] === (original as any)[key];
        });
      const saved = assignmentOnly
        ? await leadsService
            .assignLead(
              updated.id,
              updated.assignedToIds || updated.assignedTo || null,
              updated.assignedToNames
            )
            .then((row: any) => ({
              ...updated,
              assignedTo: row.assigned_to,
              assignedToName: updated.assignedToName || (row.assigned_to ? updated.assignedToName : null),
            }))
        : await leadsService.update(updated.id, updated);
      const savedLead = saved as Lead;
      const stillMatches = leadMatchesFilters(savedLead, filtersRef.current);
      if (!stillMatches) {
        setLeads((prev) => prev.filter((l) => l.id !== updated.id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? savedLead : l)));
      }
      setViewLead((current) => (current?.id === updated.id ? savedLead : current));
      setEditLead(null);
      void loadStatusCounts();
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
      const savedLead = saved as Lead;
      const stillMatches = leadMatchesFilters(savedLead, filtersRef.current);
      if (!stillMatches) {
        setLeads((prev) => prev.filter((l) => l.id !== next.id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setLeads((prev) => prev.map((l) => (l.id === next.id ? savedLead : l)));
      }
      setViewLead(savedLead);
      setStatusCounts((prev) => {
        const nextC = { ...prev };
        const oldS = lead.status || 'Fresh Leads';
        if (nextC[oldS] !== undefined) nextC[oldS] = Math.max(0, nextC[oldS] - 1);
        nextC[status] = (nextC[status] || 0) + 1;
        return nextC;
      });
      void loadStatusCounts();
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
    filters.agent,
    filters.source,
    filters.project,
    filters.propertyType,
    filters.action,
    activityOf(filters),
  ].filter(Boolean).length;

  // Filters that live in the drawer (badge on the Filters button)
  const drawerFilterCount = [
    filters.source,
    filters.project,
    filters.propertyType,
    filters.action,
    activityOf(filters),
  ].filter(Boolean).length;

  const formatDisplayBudget = (lead: Lead) => {
    const parts: string[] = [];
    if (lead.budgetMin != null) parts.push(`${lead.budgetMin.toLocaleString()}L`);
    if (lead.budgetMax != null) parts.push(`${lead.budgetMax.toLocaleString()}L`);
    return parts.length ? `₹${parts.join('–')}` : '—';
  };

  return (
    <div className="page-aurora min-h-[calc(100dvh-8rem)] space-y-5 sm:space-y-3 rounded-[2rem] p-3 sm:p-4 pb-24 sm:pb-4 flex flex-col">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-border/70 bg-card/80 p-4 sm:px-4 sm:py-2.5 shadow-sm backdrop-blur-xl">
        <div className="animate-rise-in min-w-0 sm:flex sm:items-baseline sm:gap-3">
          <h1 className="page-title sm:text-xl">{title || t('leads.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 sm:mt-0 truncate">
            {subtitle ||
              `${total} lead${total !== 1 ? 's' : ''} in your list${
                filters.status ? ` · status: ${filters.status}` : initialStatus ? ` · status: ${initialStatus}` : ''
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
          {isAdminRole(profile?.role) && (
            <button
              type="button"
              onClick={() => setAssignmentHistoryOpen(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
              title="History of bulk assignments"
            >
              <History size={15} />
              <span className="hidden sm:inline">Assignment history</span>
            </button>
          )}
          {/* ── Prominent Add Lead CTA ── */}
          <div className="relative">
            {/* Animated glow ring */}
            <span className="absolute inset-0 rounded-xl bg-primary/40 animate-ping" style={{ animationDuration: '2s' }} />
            <button
              id="add-lead-btn"
              onClick={() => setAddModalOpen(true)}
              className="relative flex items-center gap-2 px-5 py-2.5 sm:py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-[0_8px_24px_-6px_rgba(132,204,22,0.65)] hover:shadow-[0_12px_30px_-6px_rgba(132,204,22,0.8)] hover:-translate-y-0.5 hover:brightness-105 active:scale-95 transition-all duration-200 whitespace-nowrap"
              title="Add lead (press N)"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>{t('leads.add')}</span>
              <span className="hidden sm:flex items-center justify-center ml-1 w-5 h-5 rounded-md bg-primary-foreground/20 text-primary-foreground text-[10px] font-bold tracking-wider">N</span>
            </button>
          </div>
        </div>
      </div>

      <LeadsToolbar
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setCurrentPage(1);
        }}
        options={filterOptions}
        drawerCount={drawerFilterCount}
        onOpenFilters={() => setShowFilters(true)}
        filtersOpen={showFilters}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          if (mode === 'board' && pageSize < 500) {
            setPageSize(500);
            setCurrentPage(1);
          }
        }}
        onClearAll={clearFilters}
      />

      <LeadsStatusStrip
        filters={filters}
        statusCounts={statusCounts}
        total={total}
        onSelect={(status) => {
          setFilters((f) => ({ ...f, status }));
          setCurrentPage(1);
        }}
      />

      <LeadsFilterDrawer
        open={showFilters}
        onClose={() => setShowFilters(false)}
        onClear={clearFilters}
        count={drawerFilterCount}
      >
        <LeadsFilters
          filters={filters}
          options={filterOptions}
          onChange={(f) => {
            setFilters(f);
            setCurrentPage(1);
          }}
        />
      </LeadsFilterDrawer>

      {/* Table / Board */}
      {loadError && (
        <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TriangleAlert size={18} className="flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">{t('leads.loadFailed')}</p>
              <p className="text-xs opacity-80">{loadError}</p>
            </div>
          </div>
          <button onClick={() => fetchLeads()} className="btn-secondary shrink-0 min-h-[44px]">
            <RefreshCw size={14} />
            {t('leads.retry')}
          </button>
        </div>
      )}
      <div className="card-base !p-0 overflow-clip animate-in fade-in hover:!transform-none hover:!shadow-none">
        {viewMode === 'board' && loading && leads.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`bsk-${i}`} className="h-36 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : viewMode === 'board' ? (
          <div>
          <LeadBoard
            leads={leads}
            statusCounts={statusCounts}
            onView={(lead) => {
              setViewLead(lead);
            }}
            onEdit={(lead) => setEditLead(lead)}
            onStatusChange={handleStatusChange}
            onDelete={handleDeleteLead}
            isAdmin={isAdminRole(profile?.role)}
            onPostCall={handlePostCallTrigger}
          />
          </div>
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
            loading={loading}
            hasActiveFilters={activeFilterCount > 0 || !!filters.search}
            onClearFilters={clearFilters}
            activeStage={filters.status || undefined}
            onClearStage={() => {
              setFilters((f) => ({ ...f, status: '' as FilterState['status'] }));
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      <AssignmentHistoryModal open={assignmentHistoryOpen} onClose={() => setAssignmentHistoryOpen(false)} />

      {/* Sales users: a written note is required before any stage change */}
      <StatusNoteModal
        open={!!noteAsk}
        leadLabel={noteAsk?.label || ''}
        status={noteAsk?.status || ''}
        count={noteAsk?.count || 1}
        onCancel={() => {
          noteAsk?.resolve(null);
          setNoteAsk(null);
        }}
        onConfirm={(note) => {
          noteAsk?.resolve(note);
          setNoteAsk(null);
        }}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedLeads={leads.filter((l) => selectedIds.has(l.id))}
        onDelete={handleBulkDelete}
        onAssignMany={handleBulkAssignMany}
        onAssignTeam={handleBulkAssignTeam}
        onRefer={handleBulkRefer}
        onChangeStatus={handleBulkStatusChange}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Add Lead Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('leadForm.title')}
        subtitle={t('leadForm.subtitle')}
        size="md"
        variant="drawer"
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

      {/* View Lead Drawer (shared with the Follow-ups page) */}
      {viewLead && (
        <LeadProfileDrawer
          lead={viewLead}
          onClose={() => setViewLead(null)}
          onStatusChange={handleStatusChange}
          onCall={handlePostCallTrigger}
          onLogCall={(l) => setLogCallLead(l)}
          onEdit={(l) => setEditLead(l)}
          onSiteVisit={fetchAndOpenSiteVisit}
          onDeal={(l, status) => setDealModal({ lead: l, status })}
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
        />
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

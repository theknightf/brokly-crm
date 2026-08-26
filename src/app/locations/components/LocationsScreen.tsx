'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Loader2,
  ExternalLink,
  Users,
  RefreshCw,
  Navigation,
  Crosshair,
  LogIn,
  LogOut,
  Search,
  Calendar,
  X,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole } from '@/lib/roles';
import { teamsService, projectsService } from '@/lib/services/crmService';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import AttendanceSelfCard from '@/components/AttendanceSelfCard';

interface Visit {
  id: string;
  project_id?: string | null;
  project_name?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  status?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  distance_m?: number | null;
  verified?: boolean;
  within_radius?: boolean;
  note?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  agent_name?: string;
  user_id?: string;
}

interface UserOption {
  id: string;
  name: string;
}

interface LeadHit {
  id: string;
  name: string;
  phone: string;
  email?: string;
  project?: string;
  unit?: string;
  property_type?: string;
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(secs?: number | null): string {
  if (secs == null || Number.isNaN(secs)) return '—';
  if (secs < 60) return `${Math.max(0, Math.round(secs))}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function getPosition(timeout = 12000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout,
    });
  });
}

const VISIT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No-show' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Dependency-free embedded map preview (Google Maps embed, no API key needed). */
function MapPreview({ lat, lng, title }: { lat: number; lng: number; title?: string }) {
  const src = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-muted h-36">
      <iframe
        title={title || 'Map preview'}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 w-full h-full border-0"
      />
    </div>
  );
}

export default function LocationsScreen() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [now, setNow] = useState(Date.now());

  // Check-in modal state
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [ciLead, setCiLead] = useState<LeadHit | null>(null);
  const [ciLeadSearch, setCiLeadSearch] = useState('');
  const [ciLeadResults, setCiLeadResults] = useState<LeadHit[]>([]);
  const [ciLeadSearching, setCiLeadSearching] = useState(false);
  const [projects, setProjects] = useState<
    { id: string; name: string; latitude?: number | null; longitude?: number | null }[]
  >([]);
  const [ciProjectId, setCiProjectId] = useState('');
  const [ciNote, setCiNote] = useState('');
  const [ciSubmitting, setCiSubmitting] = useState(false);
  const [ciGpsError, setCiGpsError] = useState('');
  const [ciGpsSkipped, setCiGpsSkipped] = useState(false);

  // Check-out modal state
  const [checkOutTarget, setCheckOutTarget] = useState<Visit | null>(null);
  const [coOutcome, setCoOutcome] = useState('Completed');
  const [coNote, setCoNote] = useState('');
  const [coSubmitting, setCoSubmitting] = useState(false);

  const [sharing, setSharing] = useState(false);
  const [sharingError, setSharingError] = useState('');

  // Live clock so active-visit durations tick without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const myActive = useMemo(
    () =>
      visits.filter(
        (v) => v.status === 'in_progress' && v.check_out_at == null && v.user_id === profile?.id
      ),
    [visits, profile?.id]
  );

  const activeVisits = useMemo(
    () => visits.filter((v) => v.status === 'in_progress' && v.check_out_at == null),
    [visits]
  );

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = (await teamsService.getAssignableUsers()) as unknown[];
      const list = (Array.isArray(data) ? data : []).map((u: any) => ({
        id: u?.id as string,
        name: (u?.name as string) || '—',
      }));
      setUsers([{ id: '', name: '—' }, ...list]);
    } catch {
      setUsers([]);
    }
  }, [isAdmin]);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (isAdmin) {
        if (filterUserId) qs.set('user_id', filterUserId);
        else qs.set('all', '1');
      }
      const res = await fetch(`/api/site-visits?${qs.toString()}`);
      const data = await res.json();
      if (Array.isArray(data?.visits)) {
        setVisits(data.visits as Visit[]);
        setFallback(false);
      } else {
        setVisits([]);
        setFallback(true);
        if (data?.error) toast.error(data.error);
      }
    } catch (e: any) {
      setVisits([]);
      setFallback(true);
      toast.error(e?.message || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filterUserId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    if (!checkInOpen) return;
    projectsService
      .getAll()
      .then((data: any) =>
        setProjects(
          (Array.isArray(data) ? data : []).map((p: any) => ({
            id: p.id,
            name: p.name,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
          }))
        )
      )
      .catch(() => setProjects([]));
  }, [checkInOpen]);

  useEffect(() => {
    const q = ciLeadSearch.trim();
    if (q.length < 2) {
      setCiLeadResults([]);
      return;
    }
    let cancelled = false;
    setCiLeadSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/site-visits?lead_search=1&lead_query=${encodeURIComponent(q)}`
        );
        const json = await res.json();
        if (!cancelled) setCiLeadResults(Array.isArray(json?.leads) ? json.leads : []);
      } catch {
        if (!cancelled) setCiLeadResults([]);
      } finally {
        if (!cancelled) setCiLeadSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ciLeadSearch]);

  const ciProjectName = useMemo(
    () => projects.find((p) => p.id === ciProjectId)?.name || '',
    [projects, ciProjectId]
  );

  const ciProjectLat = useMemo(
    () => projects.find((p) => p.id === ciProjectId)?.latitude ?? null,
    [projects, ciProjectId]
  );

  const ciProjectLng = useMemo(
    () => projects.find((p) => p.id === ciProjectId)?.longitude ?? null,
    [projects, ciProjectId]
  );

  const doCheckIn = async (withGps: boolean) => {
    if (myActive.length > 0) {
      toast.error('You already have a visit in progress — check out first.');
      setCheckInOpen(false);
      return;
    }
    let lat: number | null = null;
    let lng: number | null = null;
    if (withGps) {
      try {
        const pos = await getPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (err: any) {
        setCiGpsError(err?.message || 'Location unavailable — check your permission.');
        return;
      }
    }
    setCiSubmitting(true);
    try {
      const res = await fetch('/api/site-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkin',
          lead_id: ciLead?.id ?? null,
          lead_name: ciLead?.name ?? '',
          project_id: ciProjectId || null,
          project_name: ciProjectName,
          note: ciNote,
          lat,
          lng,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Check-in failed');
      toast.success(
        json.visit?.verified
          ? 'Checked in — verified on site'
          : 'Checked in (outside the allowed radius)'
      );
      setCheckInOpen(false);
      setCiLead(null);
      setCiLeadSearch('');
      setCiLeadResults([]);
      setCiProjectId('');
      setCiNote('');
      setCiGpsError('');
      setCiGpsSkipped(false);
      loadVisits();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to check in');
    } finally {
      setCiSubmitting(false);
    }
  };

  const doCheckOut = async () => {
    if (!checkOutTarget) return;
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await getPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // checkout still works without GPS
    }
    setCoSubmitting(true);
    try {
      const res = await fetch('/api/site-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkout',
          id: checkOutTarget.id,
          outcome: coOutcome,
          note: coNote,
          lat,
          lng,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Check-out failed');
      toast.success('Checked out — visit completed');
      setCheckOutTarget(null);
      setCoOutcome('Completed');
      setCoNote('');
      loadVisits();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to check out');
    } finally {
      setCoSubmitting(false);
    }
  };

  const shareLocation = () => {
    if (sharing) return;
    setSharingError('');
    setSharing(true);
    getPosition()
      .then(async (pos) => {
        try {
          const res = await fetch('/api/site-visits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'checkin',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              project_name: 'My Location',
              note: 'Location shared from the Locations page',
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to share location');
          toast.success('Location shared');
          loadVisits();
        } catch (e: any) {
          setSharingError(e?.message || 'Failed to share location');
          toast.error(e?.message || 'Failed to share location');
        } finally {
          setSharing(false);
        }
      })
      .catch((err: any) => {
        setSharingError(err?.message || 'Location unavailable — check permission.');
        setSharing(false);
      });
  };

  const openInMaps = (lat: number, lng: number) =>
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');

  const navigateTo = (lat: number, lng: number) =>
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');

  const history = useMemo(() => {
    let r = visits.filter((v) => v.id !== myActive[0]?.id);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (v) =>
          (v.project_name || '').toLowerCase().includes(q) ||
          (v.lead_name || '').toLowerCase().includes(q) ||
          (v.agent_name || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) r = r.filter((v) => v.status === statusFilter);
    if (dateFrom) r = r.filter((v) => !v.check_in_at || v.check_in_at >= dateFrom);
    if (dateTo) r = r.filter((v) => !v.check_in_at || v.check_in_at <= dateTo + 'T23:59:59');
    return r;
  }, [visits, myActive, search, statusFilter, dateFrom, dateTo]);

  const adminName = useMemo(() => {
    if (!isAdmin || !filterUserId) return '';
    return users.find((u) => u.id === filterUserId)?.name || '';
  }, [isAdmin, filterUserId, users]);

  const visitDuration = (v: Visit) =>
    v.duration_seconds != null
      ? v.duration_seconds
      : v.check_in_at
        ? Math.round((now - new Date(v.check_in_at).getTime()) / 1000)
        : null;

  return (
    <div className="space-y-5 pb-4">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">{t('common.locations')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin
              ? adminName
                ? `Site visits for ${adminName}`
                : 'Site visit locations for the whole team'
              : profile?.full_name || 'Your site visit locations'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={shareLocation}
            disabled={sharing}
            className="btn-secondary flex items-center gap-1.5 text-sm h-9"
            title="Share your current location as a visit"
          >
            {sharing ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
            Share location
          </button>
          {isAdmin && users.length > 1 && (
            <select
              aria-label="Filter by agent"
              className="input-base appearance-none pr-8 h-9 text-sm w-44"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
            >
              {users.map((u) => (
                <option key={`loc-user-${u.id || 'all'}`} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={loadVisits}
            className="btn-secondary flex items-center gap-1.5 text-sm h-9"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {sharingError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
          <span className="flex-shrink-0 mt-0.5">⚠</span>
          {sharingError}
        </div>
      )}

      {/* Smart Check In / Out card */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        {myActive.length > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse flex-shrink-0" />
                <p className="font-semibold text-foreground truncate">
                  Visit in progress — {myActive[0].project_name || 'No project'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {myActive[0].lead_name ? `Lead: ${myActive[0].lead_name} · ` : ''}Started{' '}
                {fmtDateTime(myActive[0].check_in_at)} · Duration{' '}
                <span className="font-medium text-foreground font-mono-data">
                  {fmtDuration(visitDuration(myActive[0]))}
                </span>
              </p>
            </div>
            <button
              onClick={() => {
                setCheckOutTarget(myActive[0]);
                setCoOutcome('Completed');
                setCoNote('');
              }}
              className="btn-primary flex items-center justify-center gap-1.5 text-sm h-10 flex-shrink-0"
            >
              <LogOut size={15} />
              Check out
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Check in to a site visit</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add an optional lead and project, capture the location, and confirm you're on site.
              </p>
            </div>
            <button
              onClick={() => {
                setCiGpsError('');
                setCiGpsSkipped(false);
                setCheckInOpen(true);
              }}
              className="btn-primary flex items-center justify-center gap-1.5 text-sm h-10 flex-shrink-0"
            >
              <LogIn size={15} />
              Check in
            </button>
          </div>
        )}
      </div>

      {/* Active visits (whole team for admins) */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : fallback ? (
        <EmptyState
          icon={<MapPin size={24} className="text-muted-foreground" />}
          title="Locations are not set up yet"
          description="Turn on site-visit GPS tracking to see locations here."
        />
      ) : (
        <>
          {activeVisits.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-foreground">
                  Active visits ({activeVisits.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeVisits.map((v) => (
                  <div
                    key={v.id}
                    className="bg-card border border-border rounded-2xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {v.project_name || 'Unknown project'}
                        </p>
                        {v.agent_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <Users size={11} className="inline mr-1" />
                            {v.agent_name}
                          </p>
                        )}
                        {v.lead_name && (
                          <p className="text-xs text-foreground/70 mt-0.5 truncate">
                            Lead: {v.lead_name}
                          </p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                        In progress
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-foreground">
                        <span className="text-xs text-muted-foreground w-16">Check-in</span>
                        <span className="font-medium">{fmtDateTime(v.check_in_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-xs w-16">Duration</span>
                        <span className="font-mono-data">{fmtDuration(visitDuration(v))}</span>
                      </div>
                    </div>
                    {v.check_in_lat != null && v.check_in_lng != null && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs bg-muted/50 rounded-lg px-2.5 py-2">
                        <MapPin size={13} className="text-primary flex-shrink-0" />
                        <span className="font-mono-data truncate">
                          {v.check_in_lat.toFixed(5)}, {v.check_in_lng.toFixed(5)}
                        </span>
                        <span className="ml-auto flex-shrink-0">
                          {v.verified
                            ? '✓ On-site'
                            : v.distance_m != null
                              ? `~${Math.round(v.distance_m)}m away`
                              : '—'}
                        </span>
                      </div>
                    )}
                    {v.check_in_lat != null && v.check_in_lng != null && (
                      <>
                        <div className="mt-3">
                          <MapPreview
                            lat={v.check_in_lat}
                            lng={v.check_in_lng}
                            title={`${v.project_name || 'Visit'} location`}
                          />
                        </div>
                        <div className="mt-2.5 flex gap-2">
                          <button
                            onClick={() => openInMaps(v.check_in_lat!, v.check_in_lng!)}
                            className="btn-secondary flex items-center gap-1.5 text-xs h-8 flex-1 justify-center"
                          >
                            <ExternalLink size={13} />
                            View on map
                          </button>
                          <button
                            onClick={() => navigateTo(v.check_in_lat!, v.check_in_lng!)}
                            className="btn-secondary flex items-center gap-1.5 text-xs h-8 flex-1 justify-center"
                          >
                            <Navigation size={13} />
                            Navigate
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Visit history */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">Visit history</h2>
            <div className="flex flex-col gap-2 mb-3">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="input-base pl-9 h-9 text-sm"
                  placeholder="Search project, lead or agent…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter by status"
                  className="input-base appearance-none pr-8 h-9 text-sm flex-1 min-w-[140px]"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {VISIT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar size={13} className="flex-shrink-0" />
                  <input
                    type="date"
                    className="input-base h-9 text-sm w-auto"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  className="input-base h-9 text-sm w-auto"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {history.length === 0 ? (
              <EmptyState
                icon={<MapPin size={24} className="text-muted-foreground" />}
                title={visits.length === 0 ? 'No site visits yet' : 'Nothing matches your filters'}
                description={
                  visits.length === 0
                    ? 'Site visits recorded by the team will appear here with their GPS location.'
                    : 'Try adjusting the search, status or date filters.'
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((v) => {
                  const hasCoord = v.check_in_lat != null && v.check_in_lng != null;
                  const done = v.check_out_at != null;
                  return (
                    <div
                      key={v.id}
                      className="bg-card border border-border rounded-2xl p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {v.project_name || 'Unknown project'}
                          </p>
                          {v.agent_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <Users size={11} className="inline mr-1" />
                              {v.agent_name}
                            </p>
                          )}
                          {v.lead_name && (
                            <p className="text-xs text-foreground/70 mt-0.5 truncate">
                              Lead: {v.lead_name}
                            </p>
                          )}
                        </div>
                        <span
                          className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            done
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : v.status === 'scheduled'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                          }`}
                        >
                          {done
                            ? 'Completed'
                            : v.status === 'scheduled'
                              ? 'Scheduled'
                              : `${v.status === 'no_show' ? 'No-show' : v.status === 'cancelled' ? 'Cancelled' : 'In progress'}`}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-foreground">
                          <span className="text-xs text-muted-foreground w-16">Check-in</span>
                          <span className="font-medium">{fmtDateTime(v.check_in_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-xs w-16">Check-out</span>
                          <span>{fmtDateTime(v.check_out_at)}</span>
                        </div>
                        {v.duration_seconds != null && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-xs w-16">Duration</span>
                            <span className="font-mono-data">
                              {fmtDuration(v.duration_seconds)}
                            </span>
                          </div>
                        )}
                      </div>
                      {hasCoord && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs bg-muted/50 rounded-lg px-2.5 py-2">
                          <MapPin size={13} className="text-primary flex-shrink-0" />
                          <span className="font-mono-data truncate">
                            {v.check_in_lat!.toFixed(5)}, {v.check_in_lng!.toFixed(5)}
                          </span>
                          <span className="ml-auto flex-shrink-0">
                            {v.verified
                              ? '✓ On-site'
                              : v.distance_m != null
                                ? `~${Math.round(v.distance_m)}m away`
                                : '—'}
                          </span>
                        </div>
                      )}
                      {v.note ? (
                        <p className="mt-2 text-xs text-muted-foreground truncate">{v.note}</p>
                      ) : null}
                      {hasCoord && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => openInMaps(v.check_in_lat!, v.check_in_lng!)}
                            className="btn-secondary flex items-center gap-1.5 text-xs h-8 flex-1 justify-center"
                          >
                            <ExternalLink size={13} />
                            View on map
                          </button>
                          <button
                            onClick={() => navigateTo(v.check_in_lat!, v.check_in_lng!)}
                            className="btn-secondary flex items-center gap-1.5 text-xs h-8 flex-1 justify-center"
                          >
                            <Navigation size={13} />
                            Navigate
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Self-service attendance (check in/out with GPS) */}
      <AttendanceSelfCard />

      {/* Check-in modal */}
      <Modal
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        title="Check in"
        subtitle="Start a site visit — we capture the location to confirm you're on site"
        size="sm"
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="label-base">Lead (optional)</label>
            <div className="relative">
              {ciLead ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
                  <CheckCircle2 size={15} className="flex-shrink-0" />
                  <span className="truncate font-medium">
                    {ciLead.name}
                    {ciLead.phone ? ` · ${ciLead.phone}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCiLead(null);
                      setCiLeadSearch('');
                      setCiLeadResults([]);
                    }}
                    className="ml-auto text-emerald-700/70 hover:text-emerald-700 flex-shrink-0"
                    aria-label="Remove lead"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="input-base pl-9"
                    placeholder="Search leads by name, phone, project or unit…"
                    value={ciLeadSearch}
                    onChange={(e) => setCiLeadSearch(e.target.value)}
                  />
                  {ciLeadSearching && (
                    <Loader2
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary"
                    />
                  )}
                  {ciLeadSearch.trim().length >= 2 && (
                    <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl shadow-modal overflow-y-auto max-h-44 fade-in">
                      {ciLeadResults.length === 0 && !ciLeadSearching ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No leads found</p>
                      ) : (
                        ciLeadResults.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setCiLead(r);
                              setCiLeadSearch('');
                              setCiLeadResults([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                          >
                            <span className="block text-sm font-medium text-foreground">
                              {r.name}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {[r.project, r.unit, r.property_type].filter(Boolean).join(' · ') ||
                                r.phone ||
                                '—'}
                            </span>
                            <span className="block text-[11px] text-muted-foreground/80">
                              {r.phone || ''}
                              {r.email ? ` · ${r.email}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <label className="label-base">Project (optional)</label>
            <select
              className="input-base"
              value={ciProjectId}
              onChange={(e) => setCiProjectId(e.target.value)}
            >
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={`ci-project-${p.id}`} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {ciProjectName && ciProjectLat != null && ciProjectLng != null && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                Verified radius around{' '}
                <span className="font-medium text-foreground">{ciProjectName}</span>
              </p>
              <MapPreview
                lat={ciProjectLat}
                lng={ciProjectLng}
                title={`${ciProjectName} location`}
              />
            </div>
          )}

          <div>
            <label className="label-base">Note</label>
            <textarea
              className="input-base resize-none"
              rows={2}
              placeholder="Optional note for this visit…"
              value={ciNote}
              onChange={(e) => setCiNote(e.target.value)}
            />
          </div>

          {ciGpsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              {ciGpsError}
              <button
                type="button"
                onClick={() => {
                  setCiGpsError('');
                  setCiGpsSkipped(true);
                  doCheckIn(false);
                }}
                className="block mt-1.5 font-semibold hover:underline"
              >
                Continue without GPS instead
              </button>
            </div>
          )}
          {ciGpsSkipped && (
            <p className="text-xs text-amber-600">
              GPS was skipped — this visit will not be verified on-site.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setCheckInOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => doCheckIn(true)}
              disabled={ciSubmitting}
              className="btn-primary flex items-center gap-2"
            >
              {ciSubmitting && <Loader2 size={14} className="animate-spin" />}
              Check in with GPS
            </button>
          </div>
        </div>
      </Modal>

      {/* Check-out modal */}
      <Modal
        open={!!checkOutTarget}
        onClose={() => setCheckOutTarget(null)}
        title="Check out"
        subtitle={checkOutTarget?.project_name || 'Complete the visit'}
        size="sm"
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="label-base">Outcome</label>
            <select
              className="input-base"
              value={coOutcome}
              onChange={(e) => setCoOutcome(e.target.value)}
            >
              <option value="Completed">Completed</option>
              <option value="Not Interested">Not Interested</option>
              <option value="Sold">Sold</option>
              <option value="Lost">Lost</option>
              <option value="Rescheduled">Rescheduled</option>
            </select>
          </div>
          <div>
            <label className="label-base">Note</label>
            <textarea
              className="input-base resize-none"
              rows={2}
              placeholder="Optional summary…"
              value={coNote}
              onChange={(e) => setCoNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setCheckOutTarget(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={doCheckOut}
              disabled={coSubmitting}
              className="btn-primary flex items-center gap-2"
            >
              {coSubmitting && <Loader2 size={14} className="animate-spin" />}
              Complete visit
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

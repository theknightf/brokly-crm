'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  MapPin,
  LogIn,
  LogOut,
  CheckCircle2,
  XCircle,
  X,
  Navigation,
  CalendarPlus,
  Search,
  User as UserIcon,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';

interface ProjectRef {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusM?: number | null;
}

interface LeadRef {
  id: string;
  name?: string;
  phone?: string;
  project?: string | null;
}

interface Visit {
  id: string;
  status?: string;
  lead_id?: string | null;
  lead_name?: string;
  lead_phone?: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  distance_m?: number | null;
  verified?: boolean;
  within_radius?: boolean;
  outcome?: string;
  next_action?: string;
  visit_type?: string;
  meeting_link?: string;
  platform?: string;
}

interface SiteVisitSheetProps {
  project?: ProjectRef | null;
  lead?: LeadRef | null;
  onClose: () => void;
  onChanged?: () => void;
}

interface LeadOption extends LeadRef {
  name: string;
  phone?: string;
}

type GeoState = { lat: number; lng: number; error: '' } | { error: string };

const OUTCOMES = [
  'Interested',
  'Not Interested',
  'Site Visit Done',
  'Won Deal',
  'Need Follow-up',
  'No Show',
];

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function SiteVisitSheet({ project, lead, onClose, onChanged }: SiteVisitSheetProps) {
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [locating, setLocating] = useState(false);
  const [openVisit, setOpenVisit] = useState<Visit | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [visitType, setVisitType] = useState<'In-person' | 'Online' | 'Phone'>('In-person');
  const [meetingLink, setMeetingLink] = useState('');
  const [platform, setPlatform] = useState('');

  // Lead selector state
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(
    lead && (lead.name || lead.phone)
      ? { id: lead.id, name: lead.name || '', phone: lead.phone || '' }
      : null
  );
  const [leadQuery, setLeadQuery] = useState('');
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectId = project?.id || '';
  const projectName = project?.name || '';

  // Re-open an active visit for this user+project after a refresh so "End Site
  // Visit" keeps working.
  const loadOpenVisit = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/site-visits?project_id=${encodeURIComponent(pid)}&open=1`, {
        cache: 'no-store',
      });
      const json = await res.json();
      const visits = (json.visits || []) as any[];
      if (visits[0]) setOpenVisit(visits[0]);
    } catch {
      // Best-effort — check-in still returns the created row from the API
    }
  }, []);

  useEffect(() => {
    if (projectId) loadOpenVisit(projectId);
  }, [projectId, loadOpenVisit]);

  // Search leads (debounced) from the lead list.
  const searchLeads = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setLeadOptions([]);
      setShowLeadPicker(false);
      return;
    }
    setLeadLoading(true);
    try {
      const res = await fetch(
        `/api/site-visits?lead_query=${encodeURIComponent(q.trim())}&lead_search=1`
      );
      const json = await res.json();
      const list = (json?.leads || []) as any[];
      setLeadOptions(list.map((l) => ({ id: l.id, name: l.name || '—', phone: l.phone || '' })));
      setShowLeadPicker(true);
    } catch {
      setLeadOptions([]);
      setShowLeadPicker(false);
    } finally {
      setLeadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchLeads(leadQuery), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [leadQuery, searchLeads]);

  const locate = () => {
    if (locating) return;
    if (!navigator.geolocation) {
      setGeo({ error: 'Geolocation is not supported in this browser.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: '' });
        setLocating(false);
      },
      (err) => {
        setGeo({ error: err.message || 'Location unavailable — check permission.' });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const hasGeo = !!geo && 'lat' in geo;
  const latitude = hasGeo ? (geo as { lat: number }).lat : null;
  const longitude = hasGeo ? (geo as { lng: number }).lng : null;

  const distanceInfo =
    hasGeo && project?.latitude != null && project.longitude != null
      ? (() => {
          const km = haversineKm(
            latitude as number,
            longitude as number,
            project.latitude!,
            project.longitude!
          );
          const radiusM = project.radiusM ?? 300;
          return { km, radiusM, within: km * 1000 <= radiusM };
        })()
      : null;

  const basePayload = () => ({
    project_id: projectId || null,
    project_name: projectName,
    lead_id: selectedLead?.id || null,
    lead_name: selectedLead?.name || '',
    lead_phone: selectedLead?.phone || '',
  });

  const send = async (action: 'schedule' | 'checkin' | 'checkout' | 'cancel' | 'noshow') => {
    setBusy(true);
    try {
      const res = await fetch('/api/site-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...basePayload(),
          action,
          id: openVisit?.id,
          lat: latitude,
          lng: longitude,
          note: note || '',
          outcome: outcome || (action === 'checkout' ? 'Site Visit Done' : ''),
          next_action: nextAction || '',
          scheduled_at: scheduleAt ? new Date(scheduleAt).toISOString() : null,
          visit_type: visitType,
          meeting_link: meetingLink.trim(),
          platform: platform.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      if (action === 'checkin') {
        setOpenVisit(json.visit);
        setOutcome('');
        setNextAction('');
        setNote('');
      } else if (action === 'checkout') {
        setOpenVisit(null);
        toast.success('Site visit completed');
        onChanged?.();
      } else if (action === 'schedule') {
        setOpenVisit(json.visit);
        toast.success('Site visit scheduled');
        onChanged?.();
      } else {
        setOpenVisit(null);
        toast.success(action === 'cancel' ? 'Visit cancelled' : 'Marked no-show');
        onChanged?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const verified = !!openVisit?.verified || !!openVisit?.within_radius;
  const canCheckIn = !openVisit && hasGeo && !!project;
  const canSchedule = !openVisit && !!selectedLead;
  const isScheduled = !!openVisit && openVisit.status === 'scheduled';

  const filteredLeads = useMemo(() => {
    if (!leadQuery.trim() || leadQuery.trim().length < 2) return [];
    const q = leadQuery.trim().toLowerCase();
    return leadOptions.filter(
      (l) =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }, [leadOptions, leadQuery]);

  const leadSearchEnabled = !project; // Opening from a lead-less intent needs a selector; project default uses linked lead.

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-float fade-in max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <MapPin size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isScheduled
                  ? 'Scheduled visit'
                  : openVisit
                    ? 'Site visit in progress'
                    : 'Site Visit'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {project?.name ||
                  (selectedLead?.name ? `Lead: ${selectedLead.name}` : 'Select a lead first')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Lead selector */}
          {!openVisit && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Linked lead</p>
              {selectedLead ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <UserIcon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">
                        {selectedLead.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {selectedLead.phone}
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      placeholder="Search lead by name or phone…"
                      className="input-base w-full pl-9 h-10 text-sm"
                    />
                    {leadLoading && (
                      <Loader2
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary"
                      />
                    )}
                  </div>
                  {showLeadPicker && (
                    <div className="mt-2 rounded-xl border border-border bg-background max-h-44 overflow-y-auto">
                      {filteredLeads.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-muted-foreground">No leads found</p>
                      ) : (
                        filteredLeads.slice(0, 12).map((l) => (
                          <button
                            key={l.id}
                            onClick={() => {
                              setSelectedLead(l);
                              setLeadQuery(` ${l.name}`);
                              setShowLeadPicker(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                          >
                            <UserIcon size={13} className="text-muted-foreground flex-shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-sm text-foreground truncate">
                                {l.name}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {l.phone}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status banner when a visit is active/scheduled */}
          {openVisit && (
            <div
              className={`rounded-xl border p-4 flex items-start gap-3 ${
                verified
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : isScheduled
                    ? 'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
              }`}
            >
              <span
                className={`mt-0.5 flex-shrink-0 ${
                  verified ? 'text-emerald-600' : isScheduled ? 'text-sky-600' : 'text-amber-600'
                }`}
              >
                <CheckCircle2 size={18} />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-foreground">
                  {isScheduled
                    ? 'Scheduled'
                    : `In progress since ${fmtTime(openVisit.check_in_at)}`}
                </p>
                <p
                  className={`mt-0.5 text-xs ${verified ? 'text-emerald-700' : isScheduled ? 'text-sky-700' : 'text-amber-700'}`}
                >
                  {isScheduled
                    ? `Scheduled${openVisit.lead_name ? ` for ${openVisit.lead_name}` : ''}${openVisit.visit_type && openVisit.visit_type !== 'In-person' ? ` · ${openVisit.visit_type}` : ''}${openVisit.check_in_at ? ` · ${new Date(openVisit.check_in_at).toLocaleString()}` : ''}`
                    : verified
                      ? 'You are at the site — visit verified.'
                      : openVisit.distance_m != null
                        ? `Distance ${(openVisit.distance_m / 1000).toFixed(2)} km — outside radius.`
                        : 'Visit logged without radius verification.'}
                </p>
              </div>
            </div>
          )}

          {/* Check-in flow (create or scheduled → start) */}
          {!openVisit && project && (
            <>
              <p className="text-xs text-muted-foreground">
                Capture your GPS position, then start the visit.
              </p>
              <button
                onClick={locate}
                disabled={locating}
                className="w-full h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center gap-2 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Navigation size={16} />
                )}
                {geo ? 'Retry location' : 'Use my location'}
              </button>
              {locating && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Fetching your position…
                </p>
              )}
              {geo && 'error' in geo && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
                  <XCircle size={15} className="flex-shrink-0 mt-0.5" />
                  {geo.error}
                </div>
              )}
              {hasGeo && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">
                      {(geo as { lat: number }).lat.toFixed(5)},
                      {(geo as { lng: number }).lng.toFixed(5)}
                    </span>
                    <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Captured
                    </span>
                  </div>
                  {distanceInfo ? (
                    <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {distanceInfo.km.toFixed(2)} km from site pin
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${distanceInfo.within ? 'text-emerald-600' : 'text-amber-600'}`}
                      >
                        {distanceInfo.within ? 'Within radius' : 'Outside radius'}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                      No site pin set on the project — logs without radius verification.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Schedule block */}
          {!openVisit && !project && (
            <>
              <p className="text-xs text-muted-foreground">
                Pick a date/time to schedule the site visit for this lead.
              </p>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="input-base w-full h-11 text-sm"
              />
            </>
          )}

          {/* Visit type */}
          {!openVisit && (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Visit type</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['In-person', 'Online', 'Phone'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setVisitType(t)}
                      className={`h-10 rounded-xl text-xs font-semibold transition-colors ${
                        visitType === t
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {visitType === 'Online' && (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Platform</p>
                    <input
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      placeholder="e.g. Zoom, Google Meet, Teams"
                      className="input-base w-full h-10 text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Meeting link</p>
                    <input
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="https://meet.google.com/…"
                      className="input-base w-full h-10 text-sm"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Note */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={isScheduled ? 'Note…' : 'Visit note… (optional)'}
            className="w-full border border-input bg-background text-foreground rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          {/* Outcome + next action when ending */}
          {openVisit && !isScheduled && (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Outcome</p>
                <div className="flex flex-wrap gap-1.5">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o}
                      onClick={() => setOutcome(o)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        outcome === o
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="Next action (optional)"
                className="input-base w-full h-10 text-sm"
              />
            </>
          )}

          {/* CTA */}
          {openVisit ? (
            isScheduled ? (
              <div className="flex gap-2">
                <button
                  onClick={() => send('noshow')}
                  disabled={busy}
                  className="flex-1 h-11 rounded-xl bg-amber-600/90 hover:bg-amber-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  No-show
                </button>
                <button
                  onClick={() => send('cancel')}
                  disabled={busy}
                  className="flex-1 h-11 rounded-xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  Cancel visit
                </button>
              </div>
            ) : (
              <button
                onClick={() => send('checkout')}
                disabled={busy}
                className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                End Site Visit
              </button>
            )
          ) : project ? (
            <button
              onClick={() => send('checkin')}
              disabled={busy || !hasGeo}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Start Site Visit
            </button>
          ) : (
            <button
              onClick={() => send('schedule')}
              disabled={busy || !selectedLead || !scheduleAt}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
              Schedule Visit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

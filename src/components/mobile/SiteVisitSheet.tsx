'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  MapPin,
  LogIn,
  LogOut,
  CheckCircle2,
  XCircle,
  X,
  Navigation,
} from 'lucide-react';
import { toast } from 'sonner';

interface ProjectRef {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusM?: number | null;
}

interface Visit {
  id: string;
  check_in_at?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  distance_m?: number | null;
  verified?: boolean;
  within_radius?: boolean;
}

interface SiteVisitSheetProps {
  project: ProjectRef;
  onClose: () => void;
  onChanged?: () => void;
}

type GeoState = { lat: number; lng: number; error: '' } | { error: string };

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

export function SiteVisitSheet({ project, onClose, onChanged }: SiteVisitSheetProps) {
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [locating, setLocating] = useState(false);
  const [openVisit, setOpenVisit] = useState<Visit | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Re-open an active visit for this user+project after a refresh so "End Site
  // Visit" keeps working.
  const loadOpenVisit = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(
        `/api/site-visits?project_id=${encodeURIComponent(projectId)}&open=1`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      const visits = (json.visits || []) as any[];
      if (visits[0]) setOpenVisit(visits[0]);
    } catch {
      // Best-effort — check-in still returns the created row from the API
    }
  }, []);

  useEffect(() => {
    loadOpenVisit(project.id);
  }, [project.id, loadOpenVisit]);

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
    hasGeo && project.latitude != null && project.longitude != null
      ? (() => {
          const km = haversineKm(latitude as number, longitude as number, project.latitude, project.longitude);
          const radiusM = project.radiusM ?? 300;
          return { km, radiusM, within: km * 1000 <= radiusM };
        })()
      : null;

  const send = async (action: 'checkin' | 'checkout') => {
    setBusy(true);
    try {
      const res = await fetch('/api/site-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          project_id: project.id,
          project_name: project.name,
          lat: latitude,
          lng: longitude,
          note: `[Lead: ${project.name}] check-in. ${note}`.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      setOpenVisit(action === 'checkin' ? json.visit : null);
      toast.success(action === 'checkin' ? 'Site visit started' : 'Site visit ended');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const verified = !!openVisit?.verified || !!openVisit?.within_radius;

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
              <h3 className="text-sm font-semibold text-foreground">Site Visit</h3>
              <p className="text-xs text-muted-foreground">{project.name}</p>
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
          {openVisit ? (
            <div
              className={`rounded-xl border p-4 flex items-start gap-3 ${
                verified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <span className={`mt-0.5 flex-shrink-0 ${verified ? 'text-emerald-600' : 'text-amber-600'}`}>
                <CheckCircle2 size={18} />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-foreground">
                  In progress since {fmtTime(openVisit.check_in_at)}
                </p>
                <p className={`mt-0.5 text-xs ${verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {verified
                    ? 'You are at the site — visit verified.'
                    : openVisit.distance_m != null
                      ? `Distance ${(openVisit.distance_m / 1000).toFixed(2)} km — outside radius.`
                      : 'Project has no pin yet — visit logged without verification.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Press <strong className="text-foreground">Use my site</strong> to capture your GPS
                position, then start the visit.
              </p>
              <button
                onClick={locate}
                disabled={locating}
                className="w-full h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center gap-2 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {locating ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                {geo ? 'Retry location' : 'Use my site'}
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
                      {(geo as { lat: number }).lat.toFixed(5)},{(geo as { lng: number }).lng.toFixed(5)}
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
                      No site pin set on the project — visit logs without radius verification.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Visit note… (optional)"
            className="w-full border border-input bg-background text-foreground rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          {openVisit ? (
            <button
              onClick={() => send('checkout')}
              disabled={busy}
              className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              End Site Visit
            </button>
          ) : (
            <button
              onClick={() => send('checkin')}
              disabled={busy || !hasGeo}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Start Site Visit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
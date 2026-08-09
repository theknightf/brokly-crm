'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Loader2, ExternalLink, Users, RefreshCw, Navigation, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole } from '@/lib/roles';
import { teamsService } from '@/lib/services/crmService';
import EmptyState from '@/components/ui/EmptyState';

interface Visit {
  id: string;
  project_id?: string | null;
  project_name?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  distance_m?: number | null;
  verified?: boolean;
  within_radius?: boolean;
  note?: string | null;
  agent_name?: string;
  user_id?: string;
}

interface UserOption {
  id: string;
  name: string;
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

export default function LocationsScreen() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sharingError, setSharingError] = useState('');

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
      if (filterOpen) qs.set('open', '1');
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
  }, [isAdmin, filterUserId, filterOpen]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const shareLocation = () => {
    if (sharing) return;
    setSharingError('');
    if (!navigator.geolocation) {
      setSharingError(
        'Geolocation is not supported. Enable it in your browser or use an HTTPS connection.'
      );
      return;
    }
    setSharing(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch('/api/site-visits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'checkin',
              lat,
              lng,
              project_name: 'My Location',
              note: `Location shared from the map`,
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
      },
      (err) => {
        setSharingError(err.message || 'Location unavailable — check permission.');
        setSharing(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const openInMaps = (lat: number, lng: number) =>
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');

  const adminName = useMemo(() => {
    if (!isAdmin || !filterUserId) return '';
    return users.find((u) => u.id === filterUserId)?.name || '';
  }, [isAdmin, filterUserId, users]);

  return (
    <div className="space-y-5">
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
            className="btn-primary flex items-center gap-1.5 text-sm h-9 self-start sm:self-auto"
          >
            {sharing ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
            {sharing ? 'Getting location…' : 'Share my location'}
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
            onClick={() => setFilterOpen((o) => !o)}
            className="btn-secondary flex items-center gap-1.5 text-sm h-9"
          >
            <Navigation size={14} />
            Active visits {filterOpen ? 'ON' : 'OFF'}
          </button>
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : visits.length === 0 ? (
        <EmptyState
          icon={<MapPin size={24} className="text-muted-foreground" />}
          title={fallback ? 'Locations are not set up yet' : 'No site visits yet'}
          description={
            fallback
              ? 'Apply the migrations in Supabase to enable site-visit GPS tracking, then agents can check in from the Projects page.'
              : 'Site visits recorded by the team will appear here with their GPS location.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visits.map((v) => {
            const hasCoord = v.check_in_lat != null && v.check_in_lng != null;
            const open = v.check_out_at == null;
            return (
              <div key={v.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {v.project_name || 'Unknown project'}
                    </p>
                    {v.agent_name ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Users size={11} className="inline mr-1" />
                        {v.agent_name}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      open
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                  >
                    {open ? 'In progress' : 'Ended'}
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
                </div>

                {hasCoord && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs bg-muted/50 rounded-lg px-2.5 py-2">
                    <MapPin size={13} className="text-primary flex-shrink-0" />
                    <span className="font-mono-data">
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

                <div className="mt-3 flex gap-2">
                  {hasCoord && (
                    <button
                      onClick={() => openInMaps(v.check_in_lat!, v.check_in_lng!)}
                      className="btn-secondary flex items-center gap-1.5 text-xs h-8 flex-1 justify-center"
                    >
                      <ExternalLink size={13} />
                      View on map
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
'use client';
// NOTE: The legacy daily-mark AttendanceTab was retired — team attendance
// management now lives at /attendance (AdminAttendanceView) and this tab only
// keeps the GPS work-location config below (used by AdminScreen shortcuts).
import React, { useState, useEffect } from 'react';
import {
  Loader2,
  MapPin,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminSettingsService } from '@/lib/services/crmService';

export function WorkLocationCard() {
  const [lat, setLat] = useState('30.0444');
  const [lng, setLng] = useState('31.2357');
  const [radius, setRadius] = useState('800');
  const [id, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const grouped: any = await adminSettingsService.getAll();
        const item = (grouped?.workLocation || []).find((s: any) => s.name === 'default');
        if (item) {
          setId(item.id);
          try {
            const parsed = JSON.parse(item.color || '{}');
            if (parsed.lat != null) setLat(String(parsed.lat));
            if (parsed.lng != null) setLng(String(parsed.lng));
            if (parsed.radius_m != null) setRadius(String(parsed.radius_m));
            else if (parsed.radiusM != null) setRadius(String(parsed.radiusM));
          } catch {
            // keep defaults
          }
        }
      } catch {
        // settings table may not exist yet — keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    const lats = parseFloat(lat);
    const lngs = parseFloat(lng);
    const rad = parseInt(radius, 10);
    if (Number.isNaN(lats) || Number.isNaN(lngs) || !Number.isFinite(rad) || rad <= 0) {
      toast.error('Enter valid latitude, longitude and radius');
      return;
    }
    setSaving(true);
    try {
      const color = JSON.stringify({
        lat: lats,
        lng: lngs,
        radius_m: rad,
        label: 'Work location',
      });
      if (id) {
        await adminSettingsService.update(id, { name: 'default', color, order: 0, active: true });
      } else {
        const created = await adminSettingsService.create('workLocation', {
          name: 'default',
          color,
          order: 0,
          active: true,
        });
        setId(created.id);
      }
      toast.success('Work location saved — GPS attendance now enforces this radius');
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 mr-2 pb-1">
        <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
          <MapPin size={15} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Work location &amp; GPS radius</p>
          <p className="text-xs text-muted-foreground">
            Check-ins further than this radius are rejected.
          </p>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Latitude</span>
        <input
          type="text"
          inputMode="decimal"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          className="input-base h-8 w-[110px] text-xs"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Longitude</span>
        <input
          type="text"
          inputMode="decimal"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          className="input-base h-8 w-[110px] text-xs"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Radius (m)</span>
        <input
          type="number"
          min={1}
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className="input-base h-8 w-[90px] text-xs"
        />
      </label>
      <button
        onClick={save}
        disabled={saving || loading}
        className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        {saving ? 'Saving…' : 'Save location'}
      </button>
    </div>
  );
}

export default WorkLocationCard;

'use client';
import React, { useState, useEffect } from 'react';
import { Building2, Plus, X, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { projectsService, recommendedUnitsService, unitsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';

interface RecommendedUnitsSectionProps {
  leadId: string;
  onChanged?: () => void;
}

/** Small cover thumbnail: unit image if set, otherwise the project cover. */
function UnitThumb({ unit }: { unit: any }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const path = unit?.imagePath || unit?.projectImagePath;
    if (!path) {
      setUrl('');
      return;
    }
    let mounted = true;
    projectsService.getImageUrl(path).then((u) => {
      if (mounted) setUrl(u || '');
    });
    return () => {
      mounted = false;
    };
  }, [unit?.imagePath, unit?.projectImagePath]);
  if (!url) {
    return (
      <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Building2 size={16} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
  );
}

export default function RecommendedUnitsSection({
  leadId,
  onChanged,
}: RecommendedUnitsSectionProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [units, setUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    try {
      const data = await recommendedUnitsService.listByLead(leadId);
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const openPicker = async () => {
    setPickerOpen(true);
    setLoadingUnits(true);
    try {
      const data = await unitsService.getAll();
      setUnits(data || []);
    } catch {
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const addUnit = async (unit: any) => {
    setBusyId(unit.id);
    try {
      await recommendedUnitsService.add(leadId, unit.id, user?.id);
      toast.success(`"${unit.name}" recommended`);
      setItems((prev) => [
        { id: `tmp-${unit.id}`, unitId: unit.id, unit, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setPickerOpen(false);
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add recommended unit');
    } finally {
      setBusyId('');
    }
  };

  const removeUnit = async (unitId: string) => {
    try {
      await recommendedUnitsService.remove(leadId, unitId);
      setItems((prev) => prev.filter((i) => i.unitId !== unitId));
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove unit');
    }
  };

  const filtered = units.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(u.name || '')
        .toLowerCase()
        .includes(q) ||
      String(u.projectName || '')
        .toLowerCase()
        .includes(q) ||
      String(u.unitType || '')
        .toLowerCase()
        .includes(q)
    );
  });

  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Building2 size={12} /> Recommended units
        </p>
        <button
          onClick={openPicker}
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <Plus size={11} /> Add unit
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No units suggested yet. Add one from the picker below.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const unit = item.unit || {};
            const sellingPoints = unit.projectSellingPoints || [];
            return (
              <li
                key={item.id}
                className="flex items-start gap-2 bg-background/70 rounded-lg px-2.5 py-2"
              >
                <UnitThumb unit={unit} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {unit.name || 'Unit'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[unit.projectName, unit.unitType, unit.area ? `${unit.area} m²` : '']
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                  {unit.projectPaymentPlanSummary && (
                    <p className="text-[11px] font-medium text-primary truncate mt-0.5">
                      {unit.projectPaymentPlanSummary}
                    </p>
                  )}
                  {sellingPoints.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {sellingPoints.slice(0, 3).map((sp: string, i: number) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5"
                        >
                          <CheckCircle2 size={9} className="text-emerald-500" />
                          {sp}
                        </span>
                      ))}
                      {sellingPoints.length > 3 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{sellingPoints.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground flex-shrink-0">
                  EGP {Number(unit.price || 0).toLocaleString()}
                </span>
                <button
                  onClick={() => removeUnit(item.unitId)}
                  className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label="Remove unit"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Unit picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-md fade-in max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Add recommended unit</p>
              <button onClick={() => setPickerOpen(false)} className="btn-ghost p-1.5 rounded-lg">
                <X size={15} />
              </button>
            </div>
            <div className="px-4 py-2.5 border-b border-border">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by unit, project or type…"
                  className="input-base !pl-8 !h-9 text-xs"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {loadingUnits ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No units found. Add units from the Units page first.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((u) => (
                    <li key={u.id} className="px-4 py-2.5 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[u.projectName, u.unitType, u.area ? `${u.area} m²` : '', u.status]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums flex-shrink-0">
                        EGP {Number(u.price || 0).toLocaleString()}
                      </span>
                      <button
                        onClick={() => addUnit(u)}
                        disabled={busyId === u.id}
                        className="btn-primary !h-8 !px-2.5 text-xs flex-shrink-0"
                      >
                        {busyId === u.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Plus size={12} />
                        )}
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

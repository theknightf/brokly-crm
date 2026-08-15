'use client';
import React from 'react';
import {
  Building2,
  MapPin,
  Ruler,
  Layers,
  Eye,
  Pencil,
  BadgeCheck,
  BedDouble,
  Bath,
  Hash,
} from 'lucide-react';

const fmt = (n: number) => (n ? n.toLocaleString() : '0');

export function UnitStatusBadge({ status }: { status?: string }) {
  const s = status || 'Available';
  const cls =
    s === 'Available'
      ? 'bg-emerald-500 text-white'
      : s === 'Reserved'
        ? 'bg-amber-500 text-white'
        : 'bg-slate-500 text-white';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {s === 'Available' && <BadgeCheck size={11} />}
      {s}
    </span>
  );
}

interface UnitCardProps {
  unit: any;
  imageUrl?: string;
  showProject?: boolean;
  onReserve?: (unit: any) => void;
  onPreview?: (unit: any) => void;
  onDetails?: (unit: any) => void;
}

export default function UnitCard({
  unit,
  imageUrl,
  showProject = true,
  onReserve,
  onPreview,
  onDetails,
}: UnitCardProps) {
  const planBits = [
    Number(unit.downPaymentPct || 0) > 0 ? `${unit.downPaymentPct}% down` : '',
    Number(unit.installmentYears || 0) > 0 ? `${unit.installmentYears} yrs` : '',
    unit.paymentPlan && unit.paymentPlan.trim() ? unit.paymentPlan.trim() : '',
  ].filter(Boolean);

  return (
    <div className="card-base !p-0 overflow-hidden flex flex-col h-full">
      {/* Cover */}
      <button
        type="button"
        onClick={() => onPreview?.(unit)}
        className="relative block w-full aspect-[16/9] overflow-hidden bg-muted"
        aria-label={`Preview ${unit.name}`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={unit.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
            <Building2 size={28} className="text-primary/50" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <UnitStatusBadge status={unit.status} />
        </div>
      </button>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{unit.name}</p>
            {showProject && (
              <p className="text-[11px] font-semibold text-primary truncate">
                {unit.projectName || '—'}
              </p>
            )}
          </div>
          {unit.unitCode && (
            <span className="text-[10px] font-semibold font-mono text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 flex items-center gap-1 shrink-0">
              <Hash size={9} /> {unit.unitCode}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {unit.unitType && (
            <span className="inline-flex items-center gap-1">
              <Layers size={11} />
              {unit.unitType}
            </span>
          )}
          {Number(unit.area) > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Ruler size={11} />
              {unit.area} m²
            </span>
          )}
          {Number(unit.bedrooms) > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <BedDouble size={11} />
              {unit.bedrooms}
            </span>
          )}
          {Number(unit.bathrooms) > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Bath size={11} />
              {unit.bathrooms}
            </span>
          )}
          {Number(unit.floor) > 0 && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} />
              Floor {unit.floor}
            </span>
          )}
          {unit.building && (
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} />
              {unit.building}
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <p className="text-base font-bold text-foreground tabular-nums">
            EGP {fmt(Number(unit.price) || 0)}
          </p>
          {planBits.length > 0 && (
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 truncate max-w-[55%]">
              {planBits.join(' · ')}
            </span>
          )}
        </div>

        {unit.sellingPoint && (
          <p className="text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
            {unit.sellingPoint}
          </p>
        )}

        {unit.notes && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{unit.notes}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-auto pt-1">
          {onReserve && (
            <button
              type="button"
              disabled={unit.status !== 'Available'}
              onClick={() => onReserve(unit)}
              className="btn-primary flex-1 !h-8 !px-2 !py-0 !text-xs disabled:opacity-40"
            >
              Reserve
            </button>
          )}
          {onPreview && (
            <button
              type="button"
              onClick={() => onPreview(unit)}
              className="btn-ghost flex-1 !h-8 !px-2 !py-0 !text-xs"
            >
              <Eye size={12} />
              Preview
            </button>
          )}
          {onDetails && (
            <button
              type="button"
              onClick={() => onDetails(unit)}
              className="btn-ghost !h-8 !w-8 !px-0 !py-0 flex items-center justify-center"
              aria-label={`Edit ${unit.name}`}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import React from 'react';
import { Download, Plus, Search, SlidersHorizontal, Upload, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { FilterState } from './LeadsManagementScreen';
import { ALL_REAL_STATUSES } from './leadStages';

/**
 * Phone-only header of the Leads screen (rendered inside `sm:hidden`): title + count, add / import / export,
 * one search box with the filters button, and a scrollable row of stage chips with live counts.
 * Desktop keeps the existing header, toolbar and stage strip.
 */
export default function MobileLeadsHeader({
  title,
  total,
  filters,
  statusCounts,
  activeFilterCount,
  selectedCount,
  onSearch,
  onStage,
  onOpenFilters,
  onClearFilters,
  onAdd,
  onImport,
  onExport,
}: {
  title: string;
  total: number;
  filters: FilterState;
  statusCounts: Record<string, number>;
  activeFilterCount: number;
  selectedCount: number;
  onSearch: (q: string) => void;
  onStage: (s: FilterState['status']) => void;
  onOpenFilters: () => void;
  onClearFilters: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  const { t } = useLanguage();
  const allCount = Object.values(statusCounts || {}).reduce((a, b) => a + (Number(b) || 0), 0) || total;
  const stages = ALL_REAL_STATUSES.filter((s) => (statusCounts?.[s] || 0) > 0 || filters.status === s);
  const anyFilter = activeFilterCount > 0 || !!filters.search || !!filters.status;

  const chip = (active: boolean) =>
    `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
    }`;

  return (
    <div className="space-y-3 sm:hidden">
      {/* Title row */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold text-foreground">{title}</h1>
          <p className="text-xs tabular-nums text-muted-foreground">
            {total.toLocaleString()} {total === 1 ? 'lead' : 'leads'}
            {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          </p>
        </div>
        <button type="button" onClick={onImport} aria-label={t('leads.import')} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
          <Upload size={18} />
        </button>
        <button
          type="button"
          onClick={onExport}
          aria-label={t('leads.export')}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <Download size={18} />
          {selectedCount > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {selectedCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={t('leads.add')}
          className="flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(132,204,22,0.7)] active:scale-95"
        >
          <Plus size={18} strokeWidth={2.5} /> {t('leads.add')}
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('leads.searchPlaceholder')}
            aria-label={t('leads.searchPlaceholder')}
            className="input-base h-11 w-full ps-9 text-base"
          />
        </label>
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label="Filters and sort"
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            activeFilterCount > 0 ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'
          }`}
        >
          <SlidersHorizontal size={18} />
          {activeFilterCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Stage chips */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Stages">
        <button type="button" role="tab" aria-selected={!filters.status} onClick={() => onStage('' as FilterState['status'])} className={chip(!filters.status)}>
          All <span className="tabular-nums opacity-80">{allCount.toLocaleString()}</span>
        </button>
        {stages.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={filters.status === s}
            onClick={() => onStage((filters.status === s ? '' : s) as FilterState['status'])}
            className={chip(filters.status === s)}
          >
            {s} <span className="tabular-nums opacity-80">{(statusCounts?.[s] || 0).toLocaleString()}</span>
          </button>
        ))}
      </div>

      {anyFilter && (
        <button type="button" onClick={onClearFilters} className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-muted-foreground">
          <X size={14} /> Clear search and filters
        </button>
      )}
    </div>
  );
}

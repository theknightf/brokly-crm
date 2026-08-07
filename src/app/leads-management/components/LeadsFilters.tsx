'use client';
import React from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { FilterState } from './LeadsManagementScreen';
import {
  ALL_STATUSES,
  ALL_SOURCES,
  ALL_PROPERTY_TYPES,
  LeadStatus,
  LeadSource,
  PropertyType,
} from './mockLeads';

interface LeadsFiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

export default function LeadsFilters({ filters, onChange }: LeadsFiltersProps) {
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          placeholder="Search by name, email, phone, city…"
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
          className="input-base pl-8 h-9 text-sm"
        />
      </div>

      {/* Status */}
      <div className="relative">
        <select
          value={filters.status}
          onChange={(e) => update('status', e.target.value as LeadStatus | '')}
          className="input-base h-9 text-sm appearance-none pr-8 min-w-[160px]"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={`filter-status-${s}`} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>

      {/* Source */}
      <div className="relative">
        <select
          value={filters.source}
          onChange={(e) => update('source', e.target.value as LeadSource | '')}
          className="input-base h-9 text-sm appearance-none pr-8 min-w-[130px]"
        >
          <option value="">All Sources</option>
          {ALL_SOURCES.map((s) => (
            <option key={`filter-source-${s}`} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>

      {/* Property type */}
      <div className="relative">
        <select
          value={filters.propertyType}
          onChange={(e) => update('propertyType', e.target.value as PropertyType | '')}
          className="input-base h-9 text-sm appearance-none pr-8 min-w-[150px]"
        >
          <option value="">All Property Types</option>
          {ALL_PROPERTY_TYPES.map((p) => (
            <option key={`filter-prop-${p}`} value={p}>
              {p}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>
  );
}

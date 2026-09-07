'use client';
import React, { useEffect, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { FilterState } from './LeadsManagementScreen';
import { teamsService, projectsService } from '@/lib/services/crmService';
import {
  ALL_STATUSES,
  ALL_SOURCES,
  ALL_PROPERTY_TYPES,
  LEAD_ACTIONS,
  LeadStatus,
  LeadSource,
  PropertyType,
  LeadAction,
} from './mockLeads';

interface LeadsFiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

export default function LeadsFilters({ filters, onChange }: LeadsFiltersProps) {
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    teamsService
      .getAssignableUsers()
      .then((data: any) => {
        if (!alive) return;
        const names = (Array.isArray(data) ? data : [])
          .map((u: any) => (u?.name as string) || '')
          .filter(Boolean);
        setAgentOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    projectsService
      .getAll()
      .then((data: any) => {
        if (!alive) return;
        const names = (Array.isArray(data) ? data : [])
          .map((p: any) => (p?.name as string) || '')
          .filter(Boolean);
        setProjectOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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

      {/* Agent */}
      <div className="relative">
        <select
          value={filters.agent}
          onChange={(e) => update('agent', e.target.value)}
          className="input-base h-9 text-sm appearance-none pr-8 min-w-[140px]"
        >
          <option value="">All Agents</option>
          {agentOptions.map((a) => (
            <option key={`filter-agent-${a}`} value={a}>
              {a}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>

      {/* Project */}
      <div className="relative">
        <select
          value={filters.project}
          onChange={(e) => update('project', e.target.value)}
          className="input-base h-9 text-sm appearance-none pr-8 min-w-[150px]"
        >
          <option value="">All Projects</option>
          {projectOptions.map((p) => (
            <option key={`filter-project-${p}`} value={p}>
              {p}
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

      {/* Action taken on lead */}
      <div className="relative">
        <select
          value={filters.action}
          onChange={(e) => update('action', e.target.value as LeadAction | '')}
          className="input-base h-9 text-sm appearance-none pr-8 min-w-[180px]"
        >
          <option value="">All Actions</option>
          {LEAD_ACTIONS.map((a) => (
            <option key={`filter-action-${a}`} value={a}>
              {a}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>

      {/* Action Taken — replaces Contacted. Covers call, note, stage, follow-up (last_action_at). */}
      <div
        className="inline-flex items-center rounded-lg border border-border bg-card p-0.5 h-9"
        role="group"
        aria-label="Action taken filter"
      >
        {(
          [
            { value: '', label: 'All Leads' },
            { value: 'today', label: 'Action Taken' },
            { value: 'no-action', label: 'No Action Taken' },
          ] as const
        ).map((opt) => {
          // Map deprecated contacted to the new keys for active state
          const cur =
            filters.actionTaken || (filters.contacted === 'today' ? 'today' : filters.contacted === 'not-today' ? 'no-action' : '');
          const active = cur === opt.value;
          const nextVal = opt.value as FilterState['actionTaken'];
          return (
            <button
              key={opt.value || 'all'}
              type="button"
              onClick={() => {
                const next: FilterState = {
                  ...filters,
                  actionTaken: nextVal,
                  contacted: '' as FilterState['contacted'],
                };
                if (nextVal !== 'today') {
                  next.actionFrom = '';
                  next.actionTo = '';
                }
                onChange(next);
              }}
              aria-pressed={active}
              className={`h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Date range refinement — visible when Action Taken is active */}
      {(filters.actionTaken === 'today' || !!filters.actionFrom || !!filters.actionTo) && filters.actionTaken !== 'no-action' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.actionFrom}
            onChange={(e) => update('actionFrom', e.target.value)}
            className="input-base h-9 text-xs px-2 w-[150px]"
            aria-label="Action from date"
            title="From date — filter Action Taken in range"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={filters.actionTo}
            onChange={(e) => update('actionTo', e.target.value)}
            className="input-base h-9 text-xs px-2 w-[150px]"
            aria-label="Action to date"
            title="To date — filter Action Taken in range"
          />
          {(filters.actionFrom || filters.actionTo) && (
            <button
              type="button"
              onClick={() => {
                update('actionFrom', '');
                update('actionTo', '');
              }}
              className="h-9 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary"
              title="Clear date range"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

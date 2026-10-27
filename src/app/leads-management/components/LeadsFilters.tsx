'use client';
import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FilterState } from './LeadsManagementScreen';
import { teamsService, projectsService, adminSettingsService, leadSourcesService } from '@/lib/services/crmService';
import { useLanguage } from '@/contexts/LanguageContext';
import { ALL_STATUSES, ALL_SOURCES, LEAD_ACTIONS, LeadAction } from './mockLeads';

export interface LeadFilterOptions {
  statusOptions: string[];
  agentOptions: string[];
  sourceOptions: string[];
  projectOptions: string[];
}

/**
 * Loads the dropdown options once (status / agent / source / project) so the
 * toolbar and the filter drawer share a single set of requests.
 */
export function useLeadFilterOptions(): LeadFilterOptions {
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>(ALL_STATUSES);
  const [sourceOptions, setSourceOptions] = useState<string[]>(ALL_SOURCES);

  // Dynamically fetch and synchronize lead sources from database
  useEffect(() => {
    let alive = true;

    const loadSources = () => {
      Promise.all([
        leadSourcesService.getActive().catch(() => []),
        adminSettingsService.getAll().catch(() => ({})),
      ]).then(([apiSources, settings]) => {
        if (!alive) return;
        const fromApi = (Array.isArray(apiSources) ? apiSources : [])
          .map((s: any) => String(s?.name || '').trim())
          .filter(Boolean);
        const fromSettings = ((settings as any)?.leadSources || [])
          .filter((s: any) => s.active !== false)
          .map((s: any) => String(s?.name || '').trim())
          .filter(Boolean);

        const seen = new Set<string>();
        const merged: string[] = [];
        [...fromApi, ...fromSettings, ...ALL_SOURCES].forEach((s) => {
          const lower = s.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            merged.push(s);
          }
        });
        setSourceOptions(merged.sort((a, b) => a.localeCompare(b)));
      });
    };

    loadSources();
    const unsub = leadSourcesService.onSourcesChanged(() => {
      if (alive) loadSources();
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

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
    adminSettingsService
      .getAll()
      .then((g: any) => {
        if (!alive) return;
        const stages = (g.pipelineStages || [])
          .filter((s: any) => s.active)
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((s: any) => String(s.name || '').trim())
          .filter(Boolean);
        if (stages.length) {
          // Merge fallback + pipeline stages so custom stages auto-appear without losing correct classification
          const seen = new Set(ALL_STATUSES.map((s) => s.toLowerCase()));
          const merged = [...ALL_STATUSES];
          for (const name of stages) {
            if (!seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              merged.push(name);
            }
          }
          setStatusOptions(merged);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return { statusOptions, agentOptions, sourceOptions, projectOptions };
}

// ─── Activity: ONE filter that replaces Called / Action taken ───────────────
//
// It only maps to the same FilterState fields the query layer already reads
// (called, calledFrom/To, actionTaken, actionFrom/To) — no data logic changes.

export type ActivityValue = '' | 'called' | 'not-called' | 'action-today' | 'no-action';

export function activityOf(f: FilterState): ActivityValue {
  if (f.called === 'called' || f.calledFrom || f.calledTo) return 'called';
  if (f.called === 'not-called') return 'not-called';
  const taken =
    f.actionTaken ||
    (f.contacted === 'today' ? 'today' : f.contacted === 'not-today' ? 'no-action' : '');
  if (taken === 'today' || f.actionFrom || f.actionTo) return 'action-today';
  if (taken === 'no-action') return 'no-action';
  return '';
}

export function applyActivity(f: FilterState, value: ActivityValue): FilterState {
  const next: FilterState = {
    ...f,
    called: '',
    calledFrom: '',
    calledTo: '',
    actionTaken: '',
    actionFrom: '',
    actionTo: '',
    contacted: '',
  };
  if (value === 'called') next.called = 'called';
  else if (value === 'not-called') next.called = 'not-called';
  else if (value === 'action-today') next.actionTaken = 'today';
  else if (value === 'no-action') next.actionTaken = 'no-action';
  return next;
}

export function activityRange(f: FilterState): { from: string; to: string } {
  return activityOf(f) === 'called'
    ? { from: f.calledFrom, to: f.calledTo }
    : { from: f.actionFrom, to: f.actionTo };
}

export function applyActivityRange(f: FilterState, from: string, to: string): FilterState {
  return activityOf(f) === 'called'
    ? { ...f, calledFrom: from, calledTo: to }
    : { ...f, actionFrom: from, actionTo: to };
}

export const ACTIVITY_OPTIONS: { value: ActivityValue; labelKey: string }[] = [
  { value: '', labelKey: 'leads.activity.any' },
  { value: 'called', labelKey: 'leads.activity.called' },
  { value: 'not-called', labelKey: 'leads.activity.notCalled' },
  { value: 'action-today', labelKey: 'leads.activity.actionToday' },
  { value: 'no-action', labelKey: 'leads.activity.noAction' },
];

// ─── Drawer body ─────────────────────────────────────────────────────────────

interface LeadsFiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  options: LeadFilterOptions;
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-base">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base h-11 appearance-none ps-3 pe-9 truncate"
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>
  );
}

export default function LeadsFilters({ filters, onChange, options }: LeadsFiltersProps) {
  const { t } = useLanguage();
  const activity = activityOf(filters);
  const range = activityRange(filters);
  const showRange = activity === 'called' || activity === 'action-today';

  return (
    <div className="space-y-4">
      <SelectField
        id="lf-source"
        label={t('leads.source')}
        value={filters.source}
        onChange={(v) => onChange({ ...filters, source: v as FilterState['source'] })}
      >
        <option value="">{t('leads.allSources')}</option>
        {options.sourceOptions.map((s) => (
          <option key={`filter-source-${s}`} value={s}>
            {s}
          </option>
        ))}
        {/* Keep a custom/deep-linked source visible even if it is not in the options yet */}
        {filters.source && !options.sourceOptions.includes(filters.source) && (
          <option value={filters.source}>{filters.source}</option>
        )}
      </SelectField>

      <SelectField
        id="lf-project"
        label={t('leads.project')}
        value={filters.project}
        onChange={(v) => onChange({ ...filters, project: v })}
      >
        <option value="">{t('leads.allProjects')}</option>
        {options.projectOptions.map((p) => (
          <option key={`filter-project-${p}`} value={p}>
            {p}
          </option>
        ))}
      </SelectField>

      <SelectField
        id="lf-activity"
        label={t('leads.activity')}
        value={activity}
        onChange={(v) => onChange(applyActivity(filters, v as ActivityValue))}
      >
        {ACTIVITY_OPTIONS.map((o) => (
          <option key={o.value || 'any'} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </SelectField>

      {showRange && (
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            {t('leads.activityRange')}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="lf-from" className="text-xs text-muted-foreground">
                {t('leads.dateFrom')}
              </label>
              <input
                id="lf-from"
                type="date"
                value={range.from}
                onChange={(e) => onChange(applyActivityRange(filters, e.target.value, range.to))}
                className="input-base h-11 text-sm"
              />
            </div>
            <div>
              <label htmlFor="lf-to" className="text-xs text-muted-foreground">
                {t('leads.dateTo')}
              </label>
              <input
                id="lf-to"
                type="date"
                value={range.to}
                onChange={(e) => onChange(applyActivityRange(filters, range.from, e.target.value))}
                className="input-base h-11 text-sm"
              />
            </div>
          </div>
        </fieldset>
      )}

      <SelectField
        id="lf-action"
        label={t('leads.actionType')}
        value={filters.action}
        onChange={(v) => onChange({ ...filters, action: v as LeadAction | '' })}
      >
        <option value="">{t('leads.allActionTypes')}</option>
        {LEAD_ACTIONS.map((a) => (
          <option key={`filter-action-${a}`} value={a}>
            {a}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

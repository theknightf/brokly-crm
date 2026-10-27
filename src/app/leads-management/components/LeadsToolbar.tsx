'use client';
import React, { useEffect, useRef } from 'react';
import { ChevronDown, LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { FilterState } from './LeadsManagementScreen';
import { LeadFilterOptions, activityOf, applyActivity, activityRange, ACTIVITY_OPTIONS } from './LeadsFilters';
import { useLanguage } from '@/contexts/LanguageContext';

interface LeadsToolbarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  options: LeadFilterOptions;
  /** Number of active filters that live in the drawer (badge on the Filters button). */
  drawerCount: number;
  onOpenFilters: () => void;
  filtersOpen: boolean;
  viewMode: 'list' | 'board';
  onViewModeChange: (mode: 'list' | 'board') => void;
  onClearAll: () => void;
}

function ToolbarSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex-1 min-w-[140px] sm:flex-none sm:w-44">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-base h-11 sm:h-10 appearance-none ps-3 pe-9 truncate bg-card shadow-sm"
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
    </div>
  );
}

export default function LeadsToolbar({
  filters,
  onChange,
  options,
  drawerCount,
  onOpenFilters,
  filtersOpen,
  viewMode,
  onViewModeChange,
  onClearAll,
}: LeadsToolbarProps) {
  const { t } = useLanguage();

  const activity = activityOf(filters);
  const range = activityRange(filters);
  const activityLabel = activity
    ? `${t(ACTIVITY_OPTIONS.find((o) => o.value === activity)!.labelKey)}${
        range.from || range.to ? ` · ${range.from || '…'} → ${range.to || '…'}` : ''
      }`
    : '';

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.status)
    chips.push({
      key: 'status',
      label: `${t('leads.status')}: ${filters.status}`,
      onRemove: () => onChange({ ...filters, status: '' }),
    });
  if (filters.agent)
    chips.push({
      key: 'agent',
      label: `${t('leads.agent')}: ${filters.agent}`,
      onRemove: () => onChange({ ...filters, agent: '' }),
    });
  if (filters.source)
    chips.push({
      key: 'source',
      label: `${t('leads.source')}: ${filters.source}`,
      onRemove: () => onChange({ ...filters, source: '' }),
    });
  if (filters.project)
    chips.push({
      key: 'project',
      label: `${t('leads.project')}: ${filters.project}`,
      onRemove: () => onChange({ ...filters, project: '' }),
    });
  if (filters.propertyType)
    chips.push({
      key: 'propertyType',
      label: `${t('leads.propertyType')}: ${filters.propertyType}`,
      onRemove: () => onChange({ ...filters, propertyType: '' }),
    });
  if (activity)
    chips.push({
      key: 'activity',
      label: `${t('leads.activity')}: ${activityLabel}`,
      onRemove: () => onChange(applyActivity(filters, '')),
    });
  if (filters.action)
    chips.push({
      key: 'action',
      label: `${t('leads.actionType')}: ${filters.action}`,
      onRemove: () => onChange({ ...filters, action: '' }),
    });

  const hasAnything = chips.length > 0 || !!filters.search;

  return (
    <div
      className="animate-rise-in"
      style={{ animationDelay: '140ms' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* The ONE page-level search (name, phone, email, city) */}
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[240px]">
          <Search
            size={16}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder={t('leads.searchPlaceholder')}
            aria-label={t('leads.searchPlaceholder')}
            className="input-base h-11 sm:h-10 ps-9 pe-3 w-full bg-card shadow-sm"
          />
        </div>

        <ToolbarSelect
          label={t('leads.status')}
          value={filters.status}
          onChange={(v) => onChange({ ...filters, status: v as FilterState['status'] })}
        >
          <option value="">{t('leads.allStatuses')}</option>
          {options.statusOptions.map((s) => (
            <option key={`tb-status-${s}`} value={s}>
              {s}
            </option>
          ))}
          {filters.status && !options.statusOptions.includes(filters.status) && (
            <option value={filters.status}>{filters.status}</option>
          )}
        </ToolbarSelect>

        <ToolbarSelect
          label={t('leads.agent')}
          value={filters.agent}
          onChange={(v) => onChange({ ...filters, agent: v })}
        >
          <option value="">{t('leads.allAgents')}</option>
          {options.agentOptions.map((a) => (
            <option key={`tb-agent-${a}`} value={a}>
              {a}
            </option>
          ))}
          {filters.agent && !options.agentOptions.includes(filters.agent) && (
            <option value={filters.agent}>{filters.agent}</option>
          )}
        </ToolbarSelect>

        <button
          type="button"
          onClick={onOpenFilters}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          className={`btn-secondary h-11 sm:h-10 min-w-[44px] flex items-center justify-center gap-1.5 text-sm ${
            drawerCount > 0 ? 'ring-1 ring-lime-500/40 text-primary' : ''
          }`}
        >
          <SlidersHorizontal size={15} />
          <span className="hidden sm:inline">{t('leads.filters')}</span>
          {drawerCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full font-semibold">
              {drawerCount}
            </span>
          )}
        </button>

        <div
          className="flex items-center bg-muted rounded-xl p-1 h-11 sm:h-10"
          role="group"
          aria-label="View mode"
        >
          {(
            [
              { mode: 'list', icon: <List size={15} />, label: t('leads.list') },
              { mode: 'board', icon: <LayoutGrid size={15} />, label: t('leads.board') },
            ] as const
          ).map((v) => (
            <button
              key={v.mode}
              type="button"
              onClick={() => onViewModeChange(v.mode)}
              aria-pressed={viewMode === v.mode}
              aria-label={v.label}
              className={`h-9 sm:h-8 min-w-[44px] px-3 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === v.mode
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.icon}
              <span className="hidden md:inline">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active filters as removable chips */}
      {hasAnything && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2" aria-label={t('leads.filtersTitle')}>
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 max-w-full ps-2.5 pe-1 py-1 rounded-full bg-lime-500/10 text-primary text-xs font-medium border border-lime-500/20"
            >
              <span className="truncate">{c.label}</span>
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`${t('leads.clearFilters')}: ${c.label}`}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-lime-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground underline-offset-2 hover:underline min-h-[32px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {t('leads.clearAll')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Filters drawer (collapsed by default) ──────────────────────────────────

interface LeadsFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  count: number;
  children: React.ReactNode;
}

export function LeadsFilterDrawer({ open, onClose, onClear, count, children }: LeadsFilterDrawerProps) {
  const { t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t('leads.filtersTitle')}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 end-0 w-full sm:w-[400px] bg-card border-s border-border shadow-2xl flex flex-col animate-in fade-in">
        <header className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <SlidersHorizontal size={16} className="text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">{t('leads.filtersTitle')}</h2>
          {count > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-semibold">
              {count}
            </span>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('leads.close')}
            className="ms-auto w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        <footer className="flex items-center gap-2 px-5 py-4 border-t border-border">
          <button type="button" onClick={onClear} className="btn-secondary h-11 flex-1">
            {t('leads.clearAll')}
          </button>
          <button type="button" onClick={onClose} className="btn-primary h-11 flex-1">
            {t('leads.done')}
          </button>
        </footer>
      </aside>
    </div>
  );
}

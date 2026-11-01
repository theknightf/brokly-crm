'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  Check,
  Download,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { FilterState } from './LeadsManagementScreen';
import { LeadFilterOptions, activityOf, applyActivity, ACTIVITY_OPTIONS } from './LeadsFilters';
import { PIPELINE_STAGES } from './leadStages';
import { accentFor } from '@/app/components/KpiCardsGrid';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  title: string;
  subtitle?: string;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  options: LeadFilterOptions;
  statusCounts: Record<string, number>;
  total: number;
  viewMode: 'list' | 'board';
  onViewModeChange: (mode: 'list' | 'board') => void;
  drawerCount: number;
  onOpenFilters: () => void;
  onClearAll: () => void;
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
}

/** Stages promoted to the segmented bar; every other stage lives under "More". */
const SEGMENTS: { stage: FilterState['status']; label: string }[] = [
  { stage: 'Fresh Leads', label: 'Fresh' },
  { stage: 'Following Up', label: 'Follow-Up' },
  { stage: 'Interested', label: 'Interested' },
  { stage: 'Done Deal', label: 'Closed' },
];

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** Compact popover trigger + panel (used for Agent / Source / Date / More stages / Export menu). */
function Popover({
  label,
  active,
  icon,
  align = 'start',
  children,
  width = 'w-60',
}: {
  label: React.ReactNode;
  active?: boolean;
  icon?: React.ReactNode;
  align?: 'start' | 'end';
  width?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 [@media(pointer:coarse)]:h-11 ${
          active
            ? 'border-lime-400/40 bg-lime-400/10 text-lime-300'
            : 'border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:text-zinc-100'
        }`}
      >
        {icon}
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1.5 ${width} ${
            align === 'end' ? 'end-0' : 'start-0'
          } overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

function OptionList({
  value,
  items,
  allLabel,
  onPick,
  searchable,
}: {
  value: string;
  items: string[];
  allLabel: string;
  onPick: (v: string) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => items.filter((i) => i.toLowerCase().includes(q.trim().toLowerCase())), [items, q]);
  const row = (v: string, text: string) => (
    <button
      key={v || '__all'}
      type="button"
      role="menuitemradio"
      aria-checked={value === v}
      onClick={() => onPick(v)}
      className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-start text-[13px] text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
    >
      <span className="flex-1 truncate">{text}</span>
      {value === v && <Check size={14} className="text-lime-400" />}
    </button>
  );
  return (
    <>
      {searchable && (
        <div className="p-1">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-8 w-full rounded-md border border-white/10 bg-black/30 px-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-lime-400"
          />
        </div>
      )}
      <div className="custom-scrollbar max-h-64 overflow-y-auto">
        {row('', allLabel)}
        {shown.map((i) => row(i, i))}
        {shown.length === 0 && <p className="px-3 py-3 text-xs text-zinc-500">No matches</p>}
      </div>
    </>
  );
}

export default function LeadsCommandCenter({
  title,
  subtitle,
  filters,
  onChange,
  options,
  statusCounts,
  total,
  viewMode,
  onViewModeChange,
  drawerCount,
  onOpenFilters,
  onClearAll,
  onAdd,
  onExport,
  onImport,
}: Props) {
  const { t, lang } = useLanguage();
  const nf = useMemo(() => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US'), [lang]);
  const searchRef = useRef<HTMLInputElement>(null);

  const counted = Object.values(statusCounts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const allCount = counted > 0 ? counted : total;
  const countOf = (s: string) => statusCounts?.[s] ?? 0;
  const pct = (n: number) => (allCount > 0 ? Math.min(100, Math.round((n / allCount) * 100)) : 0);

  // ⌘K / Ctrl+K focuses the one page-level search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const setStatus = (status: FilterState['status']) => onChange({ ...filters, status });
  const activity = activityOf(filters);
  const dirty = !!(
    filters.search ||
    filters.status ||
    filters.agent ||
    filters.source ||
    filters.project ||
    filters.propertyType ||
    filters.action ||
    activity
  );

  const kpis: { key: string; label: string; stage: FilterState['status']; value: number; hint?: string }[] = [
    { key: 'all', label: 'Total Leads', stage: '', value: allCount },
    { key: 'fresh', label: 'Fresh Leads', stage: 'Fresh Leads', value: countOf('Fresh Leads') },
    { key: 'follow', label: 'Follow-up Required', stage: 'Following Up', value: countOf('Following Up') },
    { key: 'hot', label: 'Hot · Reservation', stage: 'Reservation', value: countOf('Reservation') },
    { key: 'closed', label: 'Closed Deals', stage: 'Done Deal', value: countOf('Done Deal') },
  ];

  const segBtn = (active: boolean) =>
    `inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 [@media(pointer:coarse)]:h-11 ${
      active ? 'bg-lime-400/15 text-lime-300 shadow-[inset_0_0_0_1px_rgba(163,230,53,0.35)]' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
    }`;
  const countPill = (n: number, active: boolean) => (
    <span
      className={`rounded-md px-1.5 text-[11px] font-bold tabular-nums ${
        active ? 'bg-lime-400/20 text-lime-200' : 'bg-white/5 text-zinc-500'
      }`}
    >
      {nf.format(n)}
    </span>
  );

  const promoted = SEGMENTS.map((s) => s.stage);
  const moreStages = PIPELINE_STAGES.filter((s) => !promoted.includes(s));
  const moreActive = !!filters.status && !promoted.includes(filters.status) ;

  return (
    <section className="space-y-3 animate-rise-in">
      {/* Header: title + the only primary/secondary actions on the page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title sm:text-xl">{title}</h1>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {subtitle || `${nf.format(total)} lead${total !== 1 ? 's' : ''} in your list`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex h-9 items-center rounded-lg border border-white/10 bg-zinc-900/60 p-0.5 [@media(pointer:coarse)]:h-11"
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
                className={`flex h-8 min-w-[40px] items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 [@media(pointer:coarse)]:h-10 ${
                  viewMode === v.mode ? 'bg-lime-400/15 text-lime-300' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {v.icon}
                <span className="hidden md:inline">{v.label}</span>
              </button>
            ))}
          </div>

          <Popover label={<span className="hidden sm:inline">Import / Export</span>} icon={<MoreHorizontal size={15} />} align="end" width="w-56">
            {(close) => (
              <>
                {[
                  { icon: <Download size={14} />, text: t('leads.export'), run: onExport },
                  { icon: <Upload size={14} />, text: t('leads.import'), run: onImport },
                ].map((i) => (
                  <button
                    key={i.text}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      i.run();
                    }}
                    className="flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2.5 text-start text-[13px] text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
                  >
                    {i.icon} {i.text}
                  </button>
                ))}
                <a
                  href="/import-history"
                  role="menuitem"
                  className="flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2.5 text-[13px] text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
                >
                  <ClipboardList size={14} /> Import History
                </a>
              </>
            )}
          </Popover>

          <button
            id="add-lead-btn"
            type="button"
            onClick={onAdd}
            title="Add lead (press N)"
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-lime-400 px-4 text-sm font-semibold text-zinc-950 shadow-[0_6px_20px_-6px_rgba(163,230,53,0.6)] transition hover:brightness-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 [@media(pointer:coarse)]:h-11"
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('leads.add')}
            <kbd className="ms-1 hidden h-5 w-5 items-center justify-center rounded bg-black/15 text-[10px] font-bold sm:inline-flex">N</kbd>
          </button>
        </div>
      </div>

      {/* KPI ribbon (click a card to filter by that stage) */}
      <div className="custom-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible">
        {kpis.map((k) => {
          const active = k.key === 'all' ? !filters.status : filters.status === k.stage;
          const accent = k.key === 'all' ? { dot: 'bg-lime-400' } : accentFor(k.stage);
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setStatus(active && k.key !== 'all' ? '' : k.stage)}
              aria-pressed={active}
              className={`min-w-[150px] flex-1 rounded-xl border p-3 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 sm:min-w-0 ${
                active
                  ? 'border-lime-400/40 bg-lime-400/[0.07]'
                  : 'border-white/5 bg-zinc-900/60 hover:border-white/15'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
                <span className="truncate">{k.label}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-bold tabular-nums text-zinc-100">{nf.format(k.value)}</span>
                {k.key !== 'all' && <span className="text-[11px] tabular-nums text-zinc-500">{pct(k.value)}%</span>}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden>
                <div
                  className={`h-full rounded-full ${accent.dot} transition-[width] duration-500`}
                  style={{ width: `${k.key === 'all' ? 100 : pct(k.value)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Unified toolbar: search · pipeline segments · filter popovers */}
      <div className="space-y-2 rounded-2xl border border-white/5 bg-zinc-900/60 p-2.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto sm:min-w-[260px] sm:flex-1">
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchRef}
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Search name, phone, email, project..."
              aria-label={t('leads.searchPlaceholder')}
              className="h-9 w-full rounded-lg border border-white/10 bg-black/30 ps-9 pe-16 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-lime-400/50 focus:outline-none focus:ring-1 focus:ring-lime-400/50 [@media(pointer:coarse)]:h-11"
            />
            <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {filters.search ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, search: '' })}
                  aria-label="Clear search"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                >
                  <X size={13} />
                </button>
              ) : (
                <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 sm:inline">⌘K</kbd>
              )}
            </div>
          </div>

          <Popover
            label={filters.agent || t('leads.agent')}
            active={!!filters.agent}
            width="w-64"
          >
            {(close) => (
              <OptionList
                searchable
                value={filters.agent}
                items={options.agentOptions}
                allLabel={t('leads.allAgents')}
                onPick={(v) => {
                  close();
                  onChange({ ...filters, agent: v });
                }}
              />
            )}
          </Popover>

          <Popover label={filters.source || t('leads.source')} active={!!filters.source} width="w-64">
            {(close) => (
              <OptionList
                searchable
                value={filters.source}
                items={options.sourceOptions}
                allLabel="All sources"
                onPick={(v) => {
                  close();
                  onChange({ ...filters, source: v });
                }}
              />
            )}
          </Popover>

          <Popover
            label={activity ? t(ACTIVITY_OPTIONS.find((o) => o.value === activity)!.labelKey) : 'Date'}
            active={!!activity}
            width="w-56"
          >
            {(close) => (
              <div className="custom-scrollbar max-h-64 overflow-y-auto">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!activity}
                  onClick={() => {
                    close();
                    onChange(applyActivity(filters, ''));
                  }}
                  className="flex min-h-[36px] w-full items-center rounded-lg px-2.5 text-[13px] text-zinc-300 hover:bg-white/5"
                >
                  Any time
                </button>
                {ACTIVITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activity === o.value}
                    onClick={() => {
                      close();
                      onChange(applyActivity(filters, o.value));
                    }}
                    className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-start text-[13px] text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
                  >
                    <span className="flex-1 truncate">{t(o.labelKey)}</span>
                    {activity === o.value && <Check size={14} className="text-lime-400" />}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <button
            type="button"
            onClick={onOpenFilters}
            aria-haspopup="dialog"
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 [@media(pointer:coarse)]:h-11 ${
              drawerCount > 0
                ? 'border-lime-400/40 bg-lime-400/10 text-lime-300'
                : 'border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:text-zinc-100'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">{t('leads.filters')}</span>
            {drawerCount > 0 && (
              <span className="rounded-full bg-lime-400 px-1.5 text-[10px] font-bold text-zinc-950">{drawerCount}</span>
            )}
          </button>

          {dirty && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 [@media(pointer:coarse)]:h-11"
            >
              <X size={13} /> Clear filters
            </button>
          )}
        </div>

        {/* Pipeline segments */}
        <div
          className="custom-scrollbar flex items-center gap-1 overflow-x-auto"
          role="group"
          aria-label={t('leads.colStage')}
        >
          <button type="button" onClick={() => setStatus('')} aria-pressed={!filters.status} className={segBtn(!filters.status)}>
            {t('leads.allLeadsPill')} {countPill(allCount, !filters.status)}
          </button>
          {SEGMENTS.map((s) => {
            const active = filters.status === s.stage;
            return (
              <button
                key={s.stage}
                type="button"
                onClick={() => setStatus(active ? '' : s.stage)}
                aria-pressed={active}
                className={segBtn(active)}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${accentFor(s.stage).dot}`} aria-hidden />
                {s.label} {countPill(countOf(s.stage), active)}
              </button>
            );
          })}
          <Popover
            label={moreActive ? filters.status : 'More stages'}
            active={moreActive}
            width="w-64"
          >
            {(close) => (
              <div className="custom-scrollbar max-h-72 overflow-y-auto">
                {moreStages.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filters.status === s}
                    onClick={() => {
                      close();
                      setStatus(filters.status === s ? '' : s);
                    }}
                    className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-start text-[13px] text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${accentFor(s).dot}`} aria-hidden />
                    <span className="flex-1 truncate">{s}</span>
                    <span className="text-[11px] tabular-nums text-zinc-500">{nf.format(countOf(s))}</span>
                  </button>
                ))}
              </div>
            )}
          </Popover>
        </div>
      </div>
    </section>
  );
}

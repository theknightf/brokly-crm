'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Compass, Download, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import AnalyticsOverview from './AnalyticsOverview';
import AssignedReport from './AssignedReport';
import CallsTable from './CallsTable';
import FilterDrawer from './FilterDrawer';
import FunnelMatrix from './FunnelMatrix';
import {
  AGENTS,
  CALLS,
  CHANNELS,
  OVERVIEW,
  SOURCES,
  TEAMS,
  filterCalls,
  funnelRows,
  teamReports,
} from './mockData';
import { EMPTY_FILTERS, PIPELINE_STAGES, type FilterState } from './types';
import { exportCsv, formatDateTime, formatMmSs, maskPhone, nf } from './utils';

type View = 'overview' | 'calls' | 'assigned' | 'funnel';

const VIEWS: { key: View; label: string }[] = [
  { key: 'overview', label: 'Analytics Overview' },
  { key: 'calls', label: 'Calls Log' },
  { key: 'assigned', label: 'Assigned Report' },
  { key: 'funnel', label: 'Funnel Matrix' },
];

const activeFilterCount = (f: FilterState) =>
  [
    f.assignDate.from || f.assignDate.to,
    f.actionDate.from || f.actionDate.to,
    f.creationDate.from || f.creationDate.to,
    f.source,
    f.channel,
    f.isColdCall !== 'any',
    f.createdBy,
  ].filter(Boolean).length;

/**
 * Analytics & Reports dashboard. Uses MOCK data (see mockData.ts); the filters apply to the
 * Calls Log in this version.
 */
export default function AnalyticsDashboard({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<View>('overview');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Client-only clock so server and client markup match.
  useEffect(() => {
    const tick = () => setSyncedAt(new Date().toLocaleTimeString('en-GB'));
    tick();
    const t = window.setInterval(tick, 15_000);
    return () => window.clearInterval(t);
  }, []);

  const calls = useMemo(() => filterCalls(CALLS, filters), [filters]);
  const reports = useMemo(() => teamReports(), []);
  const funnel = useMemo(() => funnelRows(), []);
  const filterCount = activeFilterCount(filters);

  const agentName = (id: string) => AGENTS.find((a) => a.id === id)?.name || '';

  const onExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (view === 'calls') {
      exportCsv(
        `calls-log-${stamp}.csv`,
        ['Lead name', 'Mobile', 'Sales agent', 'Call type', 'Call result', 'Duration', 'Timestamp'],
        calls.map((c) => [c.leadName || '', maskPhone(c.phone), agentName(c.agentId), c.direction, c.outcome, formatMmSs(c.durationSeconds), formatDateTime(c.at)])
      );
    } else if (view === 'assigned') {
      const rows = reports.filter((r) => !teamId || r.teamId === teamId);
      exportCsv(
        `assigned-report-${stamp}.csv`,
        ['Agent', 'Team', 'Leads assigned', 'Assign from', 'Total volume'],
        [
          ...rows.map((r) => [r.agentName, r.teamName, r.leadsAssigned, r.assignFrom, r.total]),
          [`Total Accounts (${rows.length})`, '', rows.reduce((n, r) => n + r.leadsAssigned, 0), rows.reduce((n, r) => n + r.assignFrom, 0), rows.reduce((n, r) => n + r.total, 0)],
        ]
      );
    } else if (view === 'funnel') {
      const rows = funnel.filter((r) => !teamId || r.teamId === teamId);
      exportCsv(
        `funnel-matrix-${stamp}.csv`,
        ['Agent', ...PIPELINE_STAGES.map((s) => s.label)],
        rows.map((r) => [r.agentName, ...PIPELINE_STAGES.map((s) => r.counts[s.key])])
      );
    } else {
      exportCsv(
        `analytics-overview-${stamp}.csv`,
        ['Metric', 'Value'],
        [
          ['Total calls', OVERVIEW.totalCalls],
          ['Total calls by hour', nf(OVERVIEW.totalCallsByHour, 3)],
          ['Answered', OVERVIEW.outcome.answered],
          ['No answer', OVERVIEW.outcome.noAnswer],
          ['Closed', OVERVIEW.outcome.closed],
          ['Incoming', OVERVIEW.dial.incoming],
          ['Outgoing', OVERVIEW.dial.outgoing],
        ]
      );
    }
    toast.success('Report exported');
  };

  return (
    <div className="min-h-[calc(100dvh-8rem)] rounded-[2rem] bg-[#0B0E14] p-3 text-slate-200 sm:p-6">
      {/* Top bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
            Brokly CRM <span aria-hidden="true">/</span>{' '}
            {embedded ? (
              <>
                Reports <span aria-hidden="true">/</span> <span className="text-slate-300">Analytics</span>
              </>
            ) : (
              <span className="text-slate-300">Analytics &amp; Reports</span>
            )}
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {!embedded && <h1 className="text-xl font-bold text-slate-100">Analytics &amp; Reports</h1>}
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
              Sample data
            </span>
            <span className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-400" role="status">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
              </span>
              Live{syncedAt ? ` · ${syncedAt}` : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toast.info('NAVI is not available yet')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <Compass size={16} aria-hidden="true" /> Explore New NAVI
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <SlidersHorizontal size={16} aria-hidden="true" /> Filter
            {filterCount > 0 && (
              <span className="ms-1 rounded-full bg-lime-400 px-1.5 text-[11px] font-bold text-black">{filterCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-lime-400 px-4 text-sm font-semibold text-black hover:bg-lime-300"
          >
            <Download size={16} aria-hidden="true" /> Export Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Report views" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-800">
        {VIEWS.map((v) => {
          const active = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.key)}
              className={`-mb-px min-h-[44px] flex-shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors ${
                active ? 'border-lime-400 text-lime-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {filterCount > 0 && view !== 'calls' && (
        <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          Active filters apply to the Calls Log in this version.
        </p>
      )}

      {view === 'overview' && <AnalyticsOverview stats={OVERVIEW} />}
      {view === 'calls' && <CallsTable calls={calls} agents={AGENTS} />}
      {view === 'assigned' && (
        <AssignedReport teams={TEAMS} reports={reports} teamId={teamId} onTeamChange={setTeamId} />
      )}
      {view === 'funnel' && <FunnelMatrix teams={TEAMS} rows={funnel} teamId={teamId} onTeamChange={setTeamId} />}

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters}
        onApply={setFilters}
        agents={AGENTS}
        sources={SOURCES}
        channels={CHANNELS}
      />
    </div>
  );
}

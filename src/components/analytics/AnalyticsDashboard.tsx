'use client';
import React, { useState } from 'react';
import { Compass, Download, Loader2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import AnalyticsOverview from './AnalyticsOverview';
import AssignedReport from './AssignedReport';
import CallsTable from './CallsTable';
import FilterDrawer from './FilterDrawer';
import FunnelMatrix, { stageColumns } from './FunnelMatrix';
import { useAnalyticsData } from './useAnalyticsData';
import { EMPTY_FILTERS, type CallsPage, type FilterState } from './types';
import { activeFilterCount, exportCsv, filtersToQuery, formatDateTime, formatMmSs, getJson, maskPhone, nf } from './utils';

type View = 'overview' | 'calls' | 'assigned' | 'funnel';

const VIEWS: { key: View; label: string }[] = [
  { key: 'overview', label: 'Analytics Overview' },
  { key: 'calls', label: 'Calls Log' },
  { key: 'assigned', label: 'Assigned Report' },
  { key: 'funnel', label: 'Funnel Matrix' },
];

/**
 * Reports > Analytics. Every number comes from the database through /api/reports/analytics/*
 * (SQL aggregation); filters are re-applied on every query and Supabase Realtime keeps the view
 * current while calls are being logged.
 */
export default function AnalyticsDashboard({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<View>('overview');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [exporting, setExporting] = useState(false);

  const d = useAnalyticsData(filters, true);
  const filterCount = activeFilterCount(filters);

  const onExport = async () => {
    if (exporting) return;
    const stamp = new Date().toISOString().slice(0, 10);
    setExporting(true);
    try {
      if (view === 'calls') {
        // Export everything that matches the filters / search (up to 5,000 rows), not just the visible page.
        const qs = filtersToQuery(filters, { page: 1, pageSize: 5000, sort: d.sort.key, dir: d.sort.dir, search: d.search });
        const all = await getJson<CallsPage>(`/api/reports/analytics/calls?${qs}`);
        exportCsv(
          `calls-log-${stamp}.csv`,
          ['Lead name', 'Mobile', 'Sales agent', 'Call type', 'Call result', 'Duration', 'Timestamp'],
          all.rows.map((c) => [
            c.lead_name || '',
            maskPhone(c.phone),
            c.agent_name || '',
            c.direction || '',
            c.bucket,
            formatMmSs(c.duration_seconds),
            formatDateTime(c.created_at),
          ])
        );
      } else if (view === 'assigned' || view === 'funnel') {
        const agents = (d.assigned.data?.agents ?? []).filter((r) => !teamId || r.teamId === teamId);
        if (view === 'assigned') {
          exportCsv(
            `assigned-report-${stamp}.csv`,
            ['Agent', 'Team', 'Leads assigned', 'Assign from', 'Total volume'],
            [
              ...agents.map((r) => [r.agentName, r.teamName, r.leadsAssigned, r.assignFrom, r.total]),
              [
                `Total Accounts (${agents.length})`,
                '',
                agents.reduce((n, r) => n + r.leadsAssigned, 0),
                agents.reduce((n, r) => n + r.assignFrom, 0),
                agents.reduce((n, r) => n + r.total, 0),
              ],
            ]
          );
        } else {
          const cols = stageColumns(agents, d.options.stages);
          exportCsv(
            `funnel-matrix-${stamp}.csv`,
            ['Agent', 'Total calls', ...cols, 'Total leads'],
            [
              ...agents.map((r) => [r.agentName, r.calls, ...cols.map((s) => r.allStages?.[s] || 0), r.total]),
              [
                `Total Accounts (${agents.length})`,
                agents.reduce((n, r) => n + r.calls, 0),
                ...cols.map((s) => agents.reduce((n, r) => n + (r.allStages?.[s] || 0), 0)),
                agents.reduce((n, r) => n + r.total, 0),
              ],
            ]
          );
        }
      } else {
        const s = d.overview.data;
        if (!s) throw new Error('Nothing to export yet');
        exportCsv(
          `analytics-overview-${stamp}.csv`,
          ['Metric', 'Value'],
          [
            ['Total calls', s.totalCalls],
            ['Calls per active hour', nf(s.callsByHour, 3)],
            ['Answered', s.answered],
            ['No answer', s.noAnswer],
            ['Closed', s.closed],
            ['Incoming', s.incoming],
            ['Outgoing', s.outgoing],
          ]
        );
      }
      toast.success('Report exported');
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
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
            <span
              className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-400"
              role="status"
              aria-live="polite"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {d.live === 'live' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-60" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    d.live === 'live' ? 'bg-lime-400' : d.live === 'connecting' ? 'bg-amber-400' : 'bg-slate-500'
                  }`}
                />
              </span>
              {d.live === 'live' ? 'Live' : d.live === 'connecting' ? 'Connecting' : 'Offline'}
              {d.syncedAt ? ` · ${d.syncedAt}` : ''}
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
            onClick={() => void onExport()}
            disabled={exporting}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-lime-400 px-4 text-sm font-semibold text-black hover:bg-lime-300 disabled:opacity-60"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            Export Report
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

      {view === 'overview' && (
        <AnalyticsOverview state={d.overview} frame={d.frame} onFrameChange={d.setFrame} onRetry={d.reload} />
      )}
      {view === 'calls' && (
        <CallsTable
          state={d.calls}
          page={d.page}
          pageSize={d.pageSize}
          sort={d.sort}
          search={d.search}
          onSearch={d.setSearch}
          onSort={d.toggleSort}
          onPage={d.setPage}
          onRetry={d.reload}
        />
      )}
      {view === 'assigned' && (
        <AssignedReport state={d.assigned} teamId={teamId} onTeamChange={setTeamId} onRetry={d.reload} />
      )}
      {view === 'funnel' && (
        <FunnelMatrix state={d.assigned} teamId={teamId} onTeamChange={setTeamId} onRetry={d.reload} configuredStages={d.options.stages} />
      )}

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters}
        onApply={setFilters}
        agents={d.options.agents}
        sources={d.options.sources}
        channels={d.options.channels}
      />
    </div>
  );
}

'use client';
import React from 'react';
import { CountBadge, PanelEmpty, PanelError, PanelSkeleton } from './StatusBadge';
import { TeamChips } from './AssignedReport';
import { ALL_STATUSES } from '@/lib/ui';
import type { AssignedData, Loadable } from './types';
import { nf } from './utils';

interface Props {
  state: Loadable<AssignedData>;
  teamId: string;
  onTeamChange: (teamId: string) => void;
  onRetry: () => void;
}

const TONE: Record<string, 'lime' | 'purple' | 'emerald'> = {
  Interested: 'lime',
  Meeting: 'purple',
  'Reschedule Meeting': 'purple',
  Reservation: 'purple',
  'Done Deal': 'emerald',
};

/** Every pipeline stage, in the app's stage order, plus any extra stage found in the data. */
export function stageColumns(agents: { allStages: Record<string, number> }[]): string[] {
  const present = new Set<string>();
  agents.forEach((a) => Object.keys(a.allStages || {}).forEach((s) => present.add(s)));
  const known = ALL_STATUSES;
  const extra = Array.from(present)
    .filter((s) => !ALL_STATUSES.includes(s))
    .sort();
  return [...known, ...extra];
}

/**
 * One row per agent: total calls, the lead count in EVERY pipeline stage (current stage), and the
 * agent's total leads. The last row sums the rows above it.
 */
export default function FunnelMatrix({ state, teamId, onTeamChange, onRetry }: Props) {
  const data = state.data;
  const visible = (data?.agents ?? []).filter((r) => !teamId || r.teamId === teamId);
  const stages = stageColumns(visible);
  const stageTotal = (s: string) => visible.reduce((n, r) => n + (r.allStages?.[s] || 0), 0);
  const totalCalls = visible.reduce((n, r) => n + (r.calls || 0), 0);
  const totalLeads = visible.reduce((n, r) => n + r.total, 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">Sales pipeline funnel</h3>
        <p className="text-xs text-slate-500">
          Total calls and leads per agent across every pipeline stage (the lead&apos;s current stage).
        </p>
      </div>
      <TeamChips teams={data?.teams ?? []} value={teamId} onChange={onTeamChange} />

      <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#161B22]">
        {state.error && !data ? (
          <PanelError message={state.error} onRetry={onRetry} />
        ) : state.loading && !data ? (
          <div className="p-4">
            <PanelSkeleton rows={6} />
          </div>
        ) : visible.length === 0 ? (
          <PanelEmpty text="No leads match these filters." />
        ) : (
          <table className={`w-full text-sm ${state.loading ? 'opacity-60 transition-opacity' : ''}`} style={{ minWidth: 260 + stages.length * 96 }}>
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="sticky start-0 z-10 bg-slate-900 px-4 py-3 text-start font-semibold">Agent</th>
                <th className="px-3 py-3 text-center font-semibold text-[#00EBFF]">Total calls</th>
                {stages.map((s) => (
                  <th key={s} className="px-3 py-3 text-center font-semibold">
                    {s}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-semibold">Total leads</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.agentId} className="group border-t border-slate-800/60 hover:bg-slate-800/40">
                  <td className="sticky start-0 z-10 bg-[#161B22] px-4 py-3 font-medium text-slate-100 group-hover:bg-[#1c222b]">
                    {r.agentName}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold tabular-nums text-[#00EBFF]">{nf(r.calls)}</td>
                  {stages.map((s) => (
                    <td key={s} className="px-3 py-3 text-center">
                      <CountBadge value={r.allStages?.[s] || 0} tone={TONE[s] || 'slate'} />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-semibold tabular-nums text-lime-400">{nf(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-semibold">
                <td className="sticky start-0 z-10 bg-slate-900 px-4 py-3 text-slate-100">Total Accounts ({visible.length})</td>
                <td className="px-3 py-3 text-center tabular-nums text-[#00EBFF]">{nf(totalCalls)}</td>
                {stages.map((s) => (
                  <td key={s} className="px-3 py-3 text-center tabular-nums text-slate-100">
                    {nf(stageTotal(s))}
                  </td>
                ))}
                <td className="px-3 py-3 text-center tabular-nums text-lime-400">{nf(totalLeads)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

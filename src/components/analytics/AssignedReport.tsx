'use client';
import React, { useMemo, useState } from 'react';
import { CountBadge, PanelEmpty, PanelError, PanelSkeleton, leadsLink } from './StatusBadge';
import type { AssignedData, Loadable } from './types';
import { nf } from './utils';

export function TeamChips({
  teams,
  value,
  onChange,
}: {
  teams: { id: string; name: string }[];
  value: string;
  onChange: (teamId: string) => void;
}) {
  const chips = [{ id: '', label: '#All Teams' }, ...teams.map((t) => ({ id: t.id, label: `#Team: ${t.name}` }))];
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Teams">
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.id)}
            className={`min-h-[40px] flex-shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${
              active
                ? 'border-lime-400 bg-lime-400 text-black'
                : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  state: Loadable<AssignedData>;
  teamId: string;
  onTeamChange: (teamId: string) => void;
  onRetry: () => void;
}

/**
 * Leads assigned = leads the agent currently owns that were assigned directly.
 * Assign from   = currently owned leads that were received through a reassignment.
 * Total volume  = Leads assigned + Assign from (= every lead the agent owns).
 * The last row sums the rows above it.
 */
export default function AssignedReport({ state, teamId, onTeamChange, onRetry }: Props) {
  const [sortDesc, setSortDesc] = useState(true);
  const data = state.data;
  const rows = useMemo(() => {
    const r = (data?.agents ?? []).filter((x) => !teamId || x.teamId === teamId);
    return r.slice().sort((a, b) => (sortDesc ? b.total - a.total : a.total - b.total));
  }, [data, teamId, sortDesc]);

  const totals = rows.reduce(
    (s, r) => ({ leads: s.leads + r.leadsAssigned, from: s.from + r.assignFrom, total: s.total + r.total }),
    { leads: 0, from: 0, total: 0 }
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">Assigned report</h3>
        <p className="text-xs text-slate-500">Leads currently owned, leads received by reassignment, and the total volume per agent.</p>
      </div>
      <TeamChips teams={data?.teams ?? []} value={teamId} onChange={onTeamChange} />

      <div className="custom-scrollbar overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#161B22]">
        {state.error && !data ? (
          <PanelError message={state.error} onRetry={onRetry} />
        ) : state.loading && !data ? (
          <div className="p-4">
            <PanelSkeleton rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty text="No assigned leads match these filters." />
        ) : (
          <table className={`w-full min-w-[560px] text-sm ${state.loading ? 'opacity-60 transition-opacity' : ''}`}>
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">Agent / Team</th>
                <th className="px-4 py-3 text-end font-semibold">Leads assigned</th>
                <th className="px-4 py-3 text-end font-semibold">Assign from</th>
                <th className="px-4 py-3 text-end font-semibold">
                  <button type="button" onClick={() => setSortDesc((v) => !v)} className="hover:text-slate-200">
                    Total volume {sortDesc ? '↓' : '↑'}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentId} className="border-t border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-100">{r.agentName}</span>
                    <span className="ms-2 text-xs text-slate-500">{r.teamName}</span>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-200">{nf(r.leadsAssigned)}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-300">{nf(r.assignFrom)}</td>
                  <td className="px-4 py-3 text-end"><CountBadge value={r.total} tone="lime" href={leadsLink(r.agentName)} /></td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-semibold">
                <td className="px-4 py-3 text-slate-100">Total Accounts ({rows.length})</td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-100">{nf(totals.leads)}</td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-100">{nf(totals.from)}</td>
                <td className="px-4 py-3 text-end tabular-nums text-lime-400">{nf(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

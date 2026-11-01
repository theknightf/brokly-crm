'use client';
import React from 'react';
import { CountBadge } from './StatusBadge';
import { TeamChips } from './AssignedReport';
import { PIPELINE_STAGES, type FunnelRow, type PipelineStage, type Team } from './types';
import { nf } from './utils';

interface Props {
  teams: Team[];
  rows: FunnelRow[];
  teamId: string;
  onTeamChange: (teamId: string) => void;
}

const TONE: Partial<Record<PipelineStage, 'lime' | 'purple' | 'emerald'>> = {
  interested: 'lime',
  meeting: 'purple',
  reschedule_meeting: 'purple',
  reserved: 'purple',
  closed_won: 'emerald',
};

/** One row per agent, one counter per pipeline stage. The last row sums the rows above it. */
export default function FunnelMatrix({ teams, rows, teamId, onTeamChange }: Props) {
  const visible = rows.filter((r) => !teamId || r.teamId === teamId);
  const totals = PIPELINE_STAGES.reduce(
    (acc, s) => ({ ...acc, [s.key]: visible.reduce((n, r) => n + r.counts[s.key], 0) }),
    {} as Record<PipelineStage, number>
  );
  const sum = (c: Record<PipelineStage, number>) => PIPELINE_STAGES.reduce((n, s) => n + c[s.key], 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">Sales pipeline funnel</h3>
        <p className="text-xs text-slate-500">Leads per agent across every pipeline stage.</p>
      </div>
      <TeamChips teams={teams} value={teamId} onChange={onTeamChange} />

      <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#161B22]">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="sticky start-0 z-10 bg-slate-900 px-4 py-3 text-start font-semibold">Agent</th>
              {PIPELINE_STAGES.map((s) => (
                <th key={s.key} className="px-3 py-3 text-center font-semibold">
                  {s.label}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.agentId} className="group border-t border-slate-800/60 hover:bg-slate-800/40">
                <td className="sticky start-0 z-10 bg-[#161B22] px-4 py-3 font-medium text-slate-100 group-hover:bg-[#1c222b]">
                  {r.agentName}
                </td>
                {PIPELINE_STAGES.map((s) => (
                  <td key={s.key} className="px-3 py-3 text-center">
                    <CountBadge value={r.counts[s.key]} tone={TONE[s.key] || 'slate'} />
                  </td>
                ))}
                <td className="px-3 py-3 text-center font-semibold tabular-nums text-lime-400">{nf(sum(r.counts))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-semibold">
              <td className="sticky start-0 z-10 bg-slate-900 px-4 py-3 text-slate-100">Total Accounts ({visible.length})</td>
              {PIPELINE_STAGES.map((s) => (
                <td key={s.key} className="px-3 py-3 text-center tabular-nums text-slate-100">
                  {nf(totals[s.key])}
                </td>
              ))}
              <td className="px-3 py-3 text-center tabular-nums text-lime-400">{nf(sum(totals))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

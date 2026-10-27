'use client';
import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchKpiCardsCached } from './KpiCardsGrid';

interface Team { id: string; name: string }
interface Agent { id: string; full_name: string }

export default function DashboardTeamFilter({ onChange }: { onChange: (teamId:string|null, agentId:string|null)=>void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teamId, setTeamId] = useState('');
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    fetchKpiCardsCached(teamId || undefined)
      .then((j) => {
        if (!teamId && j?.teams) setTeams(j.teams);
        setAgents(j?.agents || []);
      })
      .catch(() => {});
    if (teamId) setAgentId('');
  }, [teamId]);

  useEffect(()=>{ onChange(teamId||null, agentId||null); }, [teamId, agentId]);

  return (
    <div className="dash-card p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="relative block">
        <span className="sr-only">Team</span>
        <select value={teamId} onChange={e=>setTeamId(e.target.value)} className="input-base h-10 appearance-none ps-3 pe-9">
          <option value="">All Teams</option>
          {teams.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </label>
      <label className="relative block">
        <span className="sr-only">Agent</span>
        <select value={agentId} onChange={e=>setAgentId(e.target.value)} className="input-base h-10 appearance-none ps-3 pe-9">
          <option value="">All Agents</option>
          {agents.map(a=> <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </label>
    </div>
  );
}

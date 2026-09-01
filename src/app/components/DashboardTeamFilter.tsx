'use client';
import React, { useEffect, useState } from 'react';

interface Team { id: string; name: string }
interface Agent { id: string; full_name: string }

export default function DashboardTeamFilter({ onChange }: { onChange: (teamId:string|null, agentId:string|null)=>void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teamId, setTeamId] = useState('');
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    fetch('/api/dashboard/kpi-cards', { cache: 'no-store' }).then(r=>r.json()).then(j=>{
      setTeams(j.teams||[]);
      setAgents(j.agents||[]);
    });
  }, []);

  useEffect(() => {
    if (!teamId) {
      fetch('/api/dashboard/kpi-cards').then(r=>r.json()).then(j=> setAgents(j.agents||[]));
      return;
    }
    fetch(`/api/dashboard/kpi-cards?teamId=${teamId}`).then(r=>r.json()).then(j=> setAgents(j.agents||[]));
    setAgentId('');
  }, [teamId]);

  useEffect(()=>{ onChange(teamId||null, agentId||null); }, [teamId, agentId]);

  return (
    <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2">
      <select value={teamId} onChange={e=>setTeamId(e.target.value)} className="bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-sm flex-1">
        <option value="">All Teams</option>
        {teams.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select value={agentId} onChange={e=>setAgentId(e.target.value)} className="bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-sm flex-1">
        <option value="">All Agents</option>
        {agents.map(a=> <option key={a.id} value={a.id}>{a.full_name}</option>)}
      </select>
    </div>
  );
}

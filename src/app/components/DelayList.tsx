'use client';
import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface Task { id: string; scheduled_at: string; status: string; isDelayed: boolean; delayMinutes: number; lead: { name: string }; assignee: { full_name: string } }

export default function DelayList() {
  const [filter, setFilter] = useState<'all'|'delayed'|'pending'>('delayed');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/follow-ups/delayed?filter=${filter}`, { cache: 'no-store' })
      .then(r=>r.json())
      .then(j=> setTasks(j.followUps||[]))
      .finally(()=> setLoading(false));
  }, [filter]);

  return (
    <div className="dash-card overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold flex items-center gap-2 text-foreground">
          <span className="dash-icon-chip bg-sky-500/10 text-sky-500"><Clock size={16}/></span> Follow-ups
        </h2>
        <div className="flex bg-muted rounded-full p-1 gap-1" role="group" aria-label="Follow-up filter">
          {(['all','delayed','pending'] as const).map(f=>(
            <button
              key={f}
              onClick={()=>setFilter(f)}
              aria-pressed={filter===f}
              className={`px-3.5 py-1 [@media(pointer:coarse)]:min-h-[44px] rounded-full text-xs font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter===f?'bg-primary text-primary-foreground font-bold shadow-sm':'text-muted-foreground hover:text-foreground'}`}
            >{f}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="divide-y divide-border" aria-hidden>
          {[0,1,2].map(i=>(
            <div key={i} className="px-4 py-3 space-y-2 animate-pulse">
              <div className="h-3.5 w-44 rounded bg-muted" />
              <div className="h-3 w-32 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : tasks.length===0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <span className="dash-icon-chip bg-muted"><Clock size={16}/></span>
          <p className="text-sm">No {filter} follow-ups</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[320px] overflow-auto">
          {tasks.map(t=>(
            <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-500/10 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{t.lead?.name || 'Lead'} <span className="text-xs font-normal text-muted-foreground">· {t.assignee?.full_name}</span></p>
                <p className="text-xs text-muted-foreground tabular-nums">{new Date(t.scheduled_at).toLocaleString()} · {t.status}</p>
              </div>
              {t.isDelayed && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30 text-xs font-bold px-2.5 py-1">
                  <AlertTriangle size={11}/> Delayed {t.delayMinutes}m
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

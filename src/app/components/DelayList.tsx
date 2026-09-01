'use client';
import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle, Loader2 } from 'lucide-react';

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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Clock size={16}/> Follow-ups</h3>
        <div className="flex bg-zinc-200 dark:bg-zinc-800 rounded-xl p-1 gap-1">
          {(['all','delayed','pending'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${filter===f?'bg-lime-500 text-zinc-900 font-bold':'text-zinc-600 dark:text-zinc-400'}`}>{f}</button>
          ))}
        </div>
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin"/></div> :
        tasks.length===0 ? <p className="text-center py-8 text-sm text-zinc-500">No {filter} follow-ups</p> :
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[300px] overflow-auto">
          {tasks.map(t=>(
            <div key={t.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{t.lead?.name || 'Lead'} <span className="text-xs text-zinc-500">· {t.assignee?.full_name}</span></p>
                <p className="text-xs text-zinc-500">{new Date(t.scheduled_at).toLocaleString()} · {t.status}</p>
              </div>
              {t.isDelayed && <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1"><AlertTriangle size={10}/> Delayed {t.delayMinutes}m</span>}
            </div>
          ))}
        </div>
      }
    </div>
  );
}

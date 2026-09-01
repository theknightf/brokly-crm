'use client';
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function ActivityPerHourChart({ date, teamId, agentId }: { date?: string; teamId?: string; agentId?: string }) {
  const [data, setData] = useState<{hour:number; label:string; count:number}[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (teamId) params.set('teamId', teamId);
    if (agentId) params.set('agentId', agentId);
    fetch(`/api/activity/hourly?${params}`, { cache: 'no-store' }).then(r=>r.json()).then(j=> setData(j.hours||[]));
  }, [date, teamId, agentId]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
      <h3 className="font-bold text-sm mb-3 text-zinc-900 dark:text-white">Activity Per Hour (9 AM - 6 PM)</h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#a3e635" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

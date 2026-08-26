'use client';
import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { reportsService } from '@/lib/services/crmService';

const stageColors: Record<string, string> = {
  New: '#84cc16',
  Contacted: '#65a30d',
  Qualified: '#a3e635',
  'Site Visit Scheduled': '#4d7c0f',
  'Site Visited': '#22c55e',
  Negotiation: '#365314',
  Won: '#4d7c0f',
  Lost: '#9ca3af',
};

interface TooltipPayloadItem {
  value: number;
  payload: { stage: string; count: number; color: string };
}

function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : '0';
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground">{d.stage}</p>
      <p className="text-muted-foreground">
        {d.count} leads <span className="font-medium text-foreground">({pct}%)</span>
      </p>
    </div>
  );
}

export default function CustomerLifecycleChart() {
  const [data, setData] = useState<{ stage: string; count: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsService
      .getSummary()
      .then((result: any) => {
        const byStatus: Record<string, number> = result?.leadsByStatus ?? {};
        const chartData = Object.entries(byStatus).map(([stage, count]) => ({
          stage,
          count: count as number,
          color: stageColors[stage] ?? '#94a3b8',
        }));
        setData(chartData);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="card-base flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground text-sm">Leads by Stage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Leads at each stage — New → Negotiation → Closed
          </p>
        </div>
        <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-1 rounded-full">
          {total} total
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">
          No data yet
        </div>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barCategoryGap="30%"
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip total={total} />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {data.map((d) => (
          <div key={d.stage} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span>{d.stage}</span>
            <span className="font-medium text-foreground">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

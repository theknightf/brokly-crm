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

const stageColors = [
  '#d4e157',
  '#a3e635',
  '#86efac',
  '#4ade80',
  '#7dd3fc',
  '#38bdf8',
  '#fbbf24',
  '#f59e0b',
  '#f0a898',
  '#c4c6cb',
];

interface TooltipPayload {
  payload: { stage: string; count: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-modal text-sm">
      <p className="font-semibold text-foreground mb-1">{d.stage}</p>
      <p className="text-muted-foreground">
        Leads: <span className="text-foreground font-medium">{d.count}</span>
      </p>
    </div>
  );
}

export default function PipelineStageChart() {
  const [data, setData] = useState<{ stage: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsService
      .getSummary()
      .then((result: any) => {
        const byStatus: Record<string, number> = result?.leadsByStatus ?? {};
        const chartData = Object.entries(byStatus).map(([stage, count]) => ({
          stage,
          count: count as number,
        }));
        setData(chartData);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="card-base h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="section-header">Pipeline Stage Distribution</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} active leads across {data.length} stages
          </p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
          Live data
        </span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
          No leads yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-stage-${entry.stage}`}
                  fill={stageColors[index % stageColors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

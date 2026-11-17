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
import { useLanguage } from '@/contexts/LanguageContext';

const sourceColors = [
  '#6366F1',
  '#10B981',
  '#3B82F6',
  '#F59E0B',
  '#EC4899',
  '#64748B',
  '#F97316',
  '#06B6D4',
];

interface TooltipPayload {
  payload: { source: string; count: number; pct: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-modal text-sm">
      <p className="font-semibold text-foreground mb-1">{d.source}</p>
      <p className="text-muted-foreground">
        Leads: <span className="text-foreground font-medium">{d.count}</span>
      </p>
      <p className="text-muted-foreground">
        Share: <span className="text-foreground font-medium">{d.pct}%</span>
      </p>
    </div>
  );
}

export default function LeadSourceChart({ variant = 'default' }: { variant?: 'default' | 'agent' } = {}) {
  // variant="agent": sans heading + i18n copy on the sales-agent dashboard. Default is unchanged.
  const agent = variant === 'agent';
  const { t } = useLanguage();
  const L = (key: string, fallback: string) => (agent ? t(key) : fallback);
  const [data, setData] = useState<{ source: string; count: number; pct: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsService
      .getSummary()
      .then((result: any) => {
        const bySource: Record<string, number> = result?.leadsBySource ?? {};
        const total = Object.values(bySource).reduce((s: number, v) => s + (v as number), 0);
        const chartData = Object.entries(bySource).map(([source, count]) => ({
          source,
          count: count as number,
          pct: total > 0 ? Math.round(((count as number) / total) * 100) : 0,
        }));
        setData(chartData);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card-base h-full">
      <div className="mb-5">
        <h2 className={agent ? 'text-base font-semibold text-foreground' : 'section-header'}>{L('agent.src.title', 'Leads by Source')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{L('agent.src.subtitle', 'Where your leads come from')}</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
          {L('common.loading', 'Loading…')}
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
          {L('agent.chart.empty', 'No data yet')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="source"
              type="category"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-source-${entry.source}`}
                  fill={sourceColors[index % sourceColors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

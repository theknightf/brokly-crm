'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Target, Trash2 } from 'lucide-react';
import { kpiTargetsService, type KpiTarget } from '@/lib/services/peopleOpsService';

const METRIC_META: Record<string, { label: string; unit: string; periodType: string }> = {
  daily_calls: { label: 'Daily calls', unit: 'calls', periodType: 'day' },
  daily_followups: { label: 'Daily follow-ups', unit: 'follow-ups', periodType: 'day' },
  daily_meetings: { label: 'Daily meetings', unit: 'meetings', periodType: 'day' },
  leads_worked: { label: 'Leads worked', unit: 'leads', periodType: 'day' },
  deals: { label: 'Deals closed', unit: 'deals', periodType: 'month' },
  revenue: { label: 'Revenue generated', unit: 'EGP', periodType: 'month' },
};

export default function KpiTargetsTab() {
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [metric, setMetric] = useState('daily_calls');
  const [value, setValue] = useState('30');

  const load = async () => {
    setLoading(true);
    const list = await kpiTargetsService.getAll();
    setTargets(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return toast.error('Enter a valid target value');
    setSaving(true);
    try {
      await kpiTargetsService.upsert({
        metric,
        label: METRIC_META[metric]?.label || metric,
        targetValue: num,
        periodType: (METRIC_META[metric]?.periodType || 'day') as 'day' | 'week' | 'month',
      });
      toast.success('Target saved');
      setValue('30');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save target');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await kpiTargetsService.remove(id);
      toast.success('Target removed');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove target');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Target size={15} className="text-primary" /> Set a KPI target
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="input-base text-sm">
              {Object.keys(METRIC_META).map((k) => (
                <option key={k} value={k}>
                  {METRIC_META[k].label} ({METRIC_META[k].periodType})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Target value</label>
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-base text-sm"
            />
          </div>
          <div className="flex items-end">
            <button onClick={save} disabled={saving} className="btn-primary h-9 px-3 text-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Target size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Active targets</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : targets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No targets configured yet. Add one above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Metric</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Period</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Target</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {targets.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium text-foreground">
                      {METRIC_META[t.metric]?.label || t.label || t.metric}
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{t.periodType}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {t.targetValue.toLocaleString('en-US')}{' '}
                      <span className="text-xs text-muted-foreground font-normal">
                        {METRIC_META[t.metric]?.unit || ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => remove(t.id)}
                        disabled={deletingId === t.id}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                        title="Remove target"
                      >
                        {deletingId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

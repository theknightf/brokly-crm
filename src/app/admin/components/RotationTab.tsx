'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { History, Loader2, Play, RefreshCw, Repeat, Save } from 'lucide-react';
import { rotationService } from '@/lib/services/peopleOpsService';

interface RotationLogRow {
  id: string;
  leadId: string;
  leadName: string;
  fromUserName: string;
  toUserName: string;
  reason: string;
  detail: string;
  rotatedAt: string;
}

export default function RotationTab() {
  const [enabled, setEnabled] = useState(false);
  const [inactivityDays, setInactivityDays] = useState(7);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<RotationLogRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const load = useCallback(async () => {
    const [cfg, hist] = await Promise.all([rotationService.getConfig(), rotationService.history()]);
    setEnabled(cfg.enabled);
    setInactivityDays(cfg.inactivityDays);
    setHistory(hist);
    setLoaded(true);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await rotationService.saveConfig(enabled, inactivityDays);
      toast.success('Rotation settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await rotationService.run();
      toast.success(`Rotation complete: ${res.rotated} lead${res.rotated !== 1 ? 's' : ''} reassigned`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run rotation');
    } finally {
      setRunning(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Repeat size={15} className="text-primary" /> Lead Rotation
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Automatically reassign leads the current assignee has not worked on for the configured
          inactivity period. Eligible leads go to the least-recently-assigned active salesperson.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer md:col-span-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Enable rotation
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Inactivity period (days)
            </label>
            <input
              type="number"
              min={1}
              value={inactivityDays}
              onChange={(e) => setInactivityDays(Math.max(1, Number(e.target.value) || 1))}
              className="input-base text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="btn-primary h-9 px-3 text-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save settings
            </button>
            <button onClick={runNow} disabled={running || !enabled} className="btn-secondary h-9 px-3 text-sm flex items-center gap-1.5 disabled:opacity-50">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now
            </button>
          </div>
        </div>
        {!enabled && (
          <p className="text-xs text-amber-600 mt-3">
            Rotation is currently disabled — no automatic reassignments happen.
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <History size={15} className="text-primary" /> Rotation history
          </h3>
          <button onClick={load} className="btn-ghost p-1.5 rounded-lg">
            <RefreshCw size={14} />
          </button>
        </div>
        {loadingHistory ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No rotations yet. Enable rotation and run it to see history here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Lead</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">From</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">To</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {h.rotatedAt ? h.rotatedAt.split('T')[0] : '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate">
                      {h.leadName || h.leadId}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{h.fromUserName}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{h.toUserName}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[240px] truncate">
                      {h.reason}
                      {h.detail ? ` — ${h.detail}` : ''}
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

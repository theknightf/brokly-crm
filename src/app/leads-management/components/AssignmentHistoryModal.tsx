'use client';
import React, { useEffect, useState } from 'react';
import { History, Loader2, Users, UserCheck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';

interface Tally {
  label: string;
  count: number;
}

interface Batch {
  id: string;
  created_at: string;
  created_by_name: string | null;
  kind: 'agents' | 'team';
  team_name: string | null;
  stage: string | null;
  lead_count: number;
  assignees: { id?: string; name: string; count: number }[];
  by_stage: Tally[];
  by_source: Tally[];
  by_owner: Tally[];
}

function Chips({ title, rows }: { title: string; rows: Tally[] }) {
  if (!rows?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.slice(0, 8).map((r) => (
          <span
            key={`${title}-${r.label}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-foreground"
          >
            <span className="max-w-[130px] truncate">{r.label}</span>
            <span className="font-bold tabular-nums text-primary">{r.count}</span>
          </span>
        ))}
        {rows.length > 8 && <span className="px-1 text-[11px] text-muted-foreground">+{rows.length - 8}</span>}
      </div>
    </div>
  );
}

/**
 * History of bulk assignments (owners/admins): when, by whom, how many leads, to whom, into which stage, and what
 * those leads looked like at the time (current stage, source, previous owner).
 */
export default function AssignmentHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    createClient()
      .from('lead_assignment_batches')
      .select('id, created_at, created_by_name, kind, team_name, stage, lead_count, assignees, by_stage, by_source, by_owner')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data, error: err }: { data: any; error: any }) => {
        if (cancelled) return;
        if (err) setError(true);
        else setBatches((data as Batch[]) || []);
      })
      .then(
        () => !cancelled && setLoading(false),
        () => !cancelled && setLoading(false)
      );
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Assignment history / سجل التعيينات" subtitle="Latest bulk assignments" size="lg">
      <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">Couldn&apos;t load the history. Try again.</p>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <History size={20} />
            <p className="text-sm">No bulk assignments recorded yet. They appear here after you assign leads.</p>
          </div>
        ) : (
          batches.map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card p-3.5 space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-foreground">
                  {b.lead_count} lead{b.lead_count !== 1 ? 's' : ''}
                </span>
                {b.stage && (
                  <span className="rounded-full bg-lime-500/10 px-2.5 py-0.5 text-xs font-semibold text-lime-600 dark:text-lime-300">
                    → {b.stage}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {b.kind === 'team' ? <Users size={12} /> : <UserCheck size={12} />}
                  {b.kind === 'team' ? `Team: ${b.team_name || '—'}` : 'Agents'}
                </span>
                <span className="ms-auto text-xs text-muted-foreground" title={new Date(b.created_at).toLocaleString()}>
                  {new Date(b.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  {b.created_by_name ? ` · ${b.created_by_name}` : ''}
                </span>
              </div>

              {b.assignees?.length > 0 && (
                <Chips
                  title="Assigned to / تم التعيين لـ"
                  rows={b.assignees.map((a) => ({ label: a.name, count: a.count }))}
                />
              )}
              <Chips title="Stage before / المرحلة قبل" rows={b.by_stage} />
              <Chips title="Source / المصدر" rows={b.by_source} />
              <Chips title="Was with / كان عند" rows={b.by_owner} />
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

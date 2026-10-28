'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ACTION_STATUSES,
  ACTION_TYPES,
  type ActionItem,
  type CallItem,
} from '@/lib/leadWorkShared';
import type { ActionsData } from './useEmployeeDrawerData';
import { CallLinkSelect, EmptyState, ErrorState, SkeletonRows, api, fmtDateTime } from './shared';

interface UserOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  data: ActionsData;
  setData: React.Dispatch<React.SetStateAction<ActionsData>>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Silent refresh after a change (keeps history in sync with the server). */
  onReload: () => void;
  calls: CallItem[];
  linkedCallId: string;
  onLinkChange: (callId: string) => void;
  employeeId: string;
  employeeName: string;
  meId: string;
  isManager: boolean;
}

const typeLabel = (t: string) => ACTION_TYPES.find((x) => x.value === t)?.label || t;

export default function ActionsTab(p: Props) {
  const [type, setType] = useState<string>('status_update');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [assigneeId, setAssigneeId] = useState(p.employeeId);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => setAssigneeId(p.employeeId), [p.employeeId]);

  // Only managers/admins can hand work to someone else, so only they need the user list.
  useEffect(() => {
    if (!p.isManager) return;
    let cancelled = false;
    api<{ users: UserOption[] }>('/api/employees/list-simple')
      .then((j) => !cancelled && setUsers(j.users || []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [p.isManager]);

  const linkedCall = p.calls.find((c) => c.id === p.linkedCallId) || null;
  const needsStatus = type === 'status_update';

  const save = async () => {
    if (savingRef.current) return;
    if (!linkedCall?.leadId) return toast.error('Choose the call this action is about');
    if (needsStatus && !status) return toast.error('Pick the new status');

    savingRef.current = true;
    setSaving(true);
    const assigneeName =
      assigneeId === p.employeeId
        ? p.employeeName
        : users.find((u) => u.id === assigneeId)?.full_name || 'Assignee';
    const tempId = `tmp-${Date.now()}`;
    const dueAt = dueLocal ? new Date(dueLocal).toISOString() : null;
    const temp: ActionItem = {
      id: tempId,
      leadId: linkedCall.leadId,
      leadName: linkedCall.leadName,
      callId: linkedCall.id,
      type,
      status: status || null,
      note: note.trim() || null,
      dueAt,
      doneAt: needsStatus ? new Date().toISOString() : null,
      assigneeId,
      assigneeName,
      createdBy: p.meId,
      createdByName: 'You',
      createdAt: new Date().toISOString(),
    };
    const snapshot = { type, status, note, dueLocal };
    // A status update is logged as done at once, so it only shows up in History after the refresh.
    if (!needsStatus) p.setData((d) => ({ ...d, upcoming: [temp, ...d.upcoming] }));
    setNote('');
    setDueLocal('');
    try {
      const j = await api<{ action: ActionItem }>(`/api/leads/${linkedCall.leadId}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          status: status || null,
          note: note.trim() || null,
          dueAt,
          assigneeId,
          callId: linkedCall.id,
        }),
      });
      if (!needsStatus) {
        p.setData((d) => ({ ...d, upcoming: d.upcoming.map((a) => (a.id === tempId ? j.action : a)) }));
      }
      toast.success(needsStatus ? 'Status updated' : 'Action saved');
      p.onReload();
    } catch (e: any) {
      p.setData((d) => ({ ...d, upcoming: d.upcoming.filter((a) => a.id !== tempId) }));
      setType(snapshot.type);
      setStatus(snapshot.status);
      setNote(snapshot.note);
      setDueLocal(snapshot.dueLocal);
      toast.error(e?.message || 'Could not save the action');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const markDone = async (a: ActionItem) => {
    if (togglingId || a.id.startsWith('tmp-')) return;
    setTogglingId(a.id);
    const index = p.data.upcoming.findIndex((x) => x.id === a.id);
    p.setData((d) => ({ ...d, upcoming: d.upcoming.filter((x) => x.id !== a.id) }));
    try {
      await api(`/api/actions/${a.id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) });
      toast.success('Marked as done');
      p.onReload();
    } catch (e: any) {
      p.setData((d) => {
        const next = d.upcoming.slice();
        next.splice(Math.min(index, next.length), 0, a);
        return { ...d, upcoming: next };
      });
      toast.error(e?.message || 'Could not mark it as done');
    } finally {
      setTogglingId(null);
    }
  };

  const now = Date.now();

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div>
          <label htmlFor="act-link" className="mb-1 block text-xs font-semibold text-muted-foreground">
            Link to a call
          </label>
          <CallLinkSelect id="act-link" calls={p.calls} value={p.linkedCallId} onChange={p.onLinkChange} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted-foreground">
            Action type
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input-base mt-1 h-11 min-h-[44px] text-base sm:text-sm"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Status{needsStatus && <span className="text-red-500"> *</span>}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input-base mt-1 h-11 min-h-[44px] text-base sm:text-sm"
            >
              <option value="">{needsStatus ? 'Choose a status' : 'No status change'}</option>
              {ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Due date and time
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              className="input-base mt-1 h-11 min-h-[44px] text-base sm:text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Assignee
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!p.isManager}
              className="input-base mt-1 h-11 min-h-[44px] text-base sm:text-sm disabled:opacity-60"
            >
              <option value={p.employeeId}>{p.employeeName}</option>
              {users
                .filter((u) => u.id !== p.employeeId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-muted-foreground">
          Note (optional)
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-base mt-1 resize-none text-base sm:text-sm"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-primary inline-flex min-h-[44px] items-center gap-2 px-5 text-sm disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Save action
          </button>
        </div>
      </section>

      {p.loading ? (
        <SkeletonRows rows={3} />
      ) : p.error ? (
        <ErrorState message={p.error} onRetry={p.onRetry} />
      ) : p.data.upcoming.length === 0 && p.data.history.length === 0 ? (
        <EmptyState text="No actions yet" />
      ) : (
        <>
          <section aria-labelledby="actions-upcoming">
            <h3 id="actions-upcoming" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Upcoming ({p.data.upcoming.length})
            </h3>
            {p.data.upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nothing scheduled
              </p>
            ) : (
              <ul className="space-y-2">
                {p.data.upcoming.map((a) => {
                  const overdue = !!a.dueAt && new Date(a.dueAt).getTime() < now;
                  return (
                    <li
                      key={a.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${
                        overdue ? 'border-red-500/50 bg-red-500/10' : 'border-border bg-card'
                      } ${a.id.startsWith('tmp-') ? 'opacity-70' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={!!togglingId || a.id.startsWith('tmp-')}
                        onChange={() => void markDone(a)}
                        aria-label={`Mark "${typeLabel(a.type)}" as done`}
                        className="mt-1 h-5 w-5 flex-shrink-0 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {typeLabel(a.type)}
                          {a.status ? ` · ${a.status}` : ''}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.leadName || 'Lead'}
                          {a.assigneeName ? ` · ${a.assigneeName}` : ''}
                        </p>
                        {a.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{a.note}</p>}
                        <p
                          className={`mt-1 text-xs font-semibold ${
                            overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                          }`}
                        >
                          {a.dueAt ? `${overdue ? 'Overdue · ' : 'Due '}${fmtDateTime(a.dueAt)}` : 'No due date'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="actions-history">
            <h3 id="actions-history" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              History ({p.data.history.length})
            </h3>
            {p.data.history.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No history in this period
              </p>
            ) : (
              <ol className="space-y-2">
                {p.data.history.map((h) => (
                  <li key={h.id} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-sm font-semibold text-foreground">{h.label}</p>
                    {h.kind === 'status_change' && (h.from || h.to) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{h.from || '—'}</span>
                        <ArrowRight size={13} className="text-muted-foreground rtl:rotate-180" aria-label="to" />
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{h.to || '—'}</span>
                      </p>
                    )}
                    {h.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{h.note}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {h.byName} · {fmtDateTime(h.at)}
                      {h.leadName ? ` · ${h.leadName}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

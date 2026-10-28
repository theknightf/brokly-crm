'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  GitMerge,
  Loader2,
  RefreshCw,
  Repeat,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import DuplicateMergeDialog from './DuplicateMergeDialog';
import {
  DUPLICATES_CHANGED_EVENT,
  DUPLICATE_FIELDS,
  displayValue,
  fieldDiffers,
  fmtDateTime,
  type DuplicateItem,
  type DuplicatePerson,
} from './duplicateFields';

type Tab = 'pending' | 'merged' | 'dismissed';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'merged', label: 'Merged' },
  { id: 'dismissed', label: 'Dismissed' },
];

function Who({
  icon,
  label,
  person,
}: {
  icon: React.ReactNode;
  label: string;
  person: DuplicatePerson | null;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{person?.name || '—'}</p>
    </div>
  );
}

function DuplicateCard({
  item,
  busy,
  onMerge,
  onDismiss,
}: {
  item: DuplicateItem;
  busy: boolean;
  onMerge: () => void;
  onDismiss: () => void;
}) {
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const diffs = DUPLICATE_FIELDS.filter((f) => fieldDiffers(f.key, item.existing, item.submitted));
  const rows = DUPLICATE_FIELDS.filter(
    (f) => displayValue(f.key, item.existing?.[f.key]) || displayValue(f.key, item.submitted?.[f.key])
  );
  const newNotes = String(item.submitted?.notes || '').trim();
  const oldNotes = String(item.existing?.notes || '').trim();
  const pending = item.status === 'pending';

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-base font-bold text-foreground sm:text-lg">
            {item.existing?.name || item.submitted?.name || 'Lead'}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-primary">
              {item.matchType === 'email' ? 'Email match' : 'Phone match'}
            </span>
            {item.attemptCount > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                <Repeat size={11} /> Tried {item.attemptCount}×
              </span>
            )}
            {!pending && (
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  item.status === 'merged'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {item.status === 'merged' ? 'Merged' : 'Dismissed'}
                {item.resolvedBy ? ` by ${item.resolvedBy.name}` : ''} · {fmtDateTime(item.resolvedAt)}
              </span>
            )}
          </div>
        </div>
        {pending && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-shrink-0">
            {confirmDismiss ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDismiss(false);
                    onDismiss();
                  }}
                  disabled={busy}
                  className="btn-secondary min-h-[44px]"
                >
                  Confirm dismiss
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDismiss(false)}
                  className="btn-ghost min-h-[44px]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDismiss(true)}
                  disabled={busy}
                  className="btn-secondary inline-flex min-h-[44px] items-center justify-center gap-2"
                >
                  <X size={16} /> Dismiss
                </button>
                <button
                  type="button"
                  onClick={onMerge}
                  disabled={busy || !item.existing}
                  className="btn-primary inline-flex min-h-[44px] items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />}
                  Merge
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {/* Provenance */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Who icon={<UserPlus size={12} />} label="Original added by" person={item.originalAddedBy} />
        <Who icon={<UserCheck size={12} />} label="First owner" person={item.firstOwner} />
        <Who icon={<UserPlus size={12} />} label="Duplicate attempted by" person={item.attemptedBy} />
        <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock size={12} /> Attempted
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{fmtDateTime(item.createdAt)}</p>
          {item.attemptCount > 1 && (
            <p className="text-[11px] text-muted-foreground">Last: {fmtDateTime(item.lastAttemptAt)}</p>
          )}
        </div>
      </div>
      {item.currentOwner && item.firstOwner && item.currentOwner.id !== item.firstOwner.id && (
        <p className="mt-2 text-xs text-muted-foreground">
          Current owner of the lead: <strong className="text-foreground">{item.currentOwner.name}</strong>
        </p>
      )}

      {/* Comparison: stacked on phones, side by side from sm up */}
      {!item.existing ? (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          The original lead is no longer available.
        </p>
      ) : (
        <div className="mt-4">
          <div className="hidden grid-cols-[8rem_1fr_1fr] gap-2 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span />
            <span>Existing lead</span>
            <span>Newly submitted</span>
          </div>
          <dl className="space-y-2">
            {rows.map((f) => {
              const differs = diffs.some((d) => d.key === f.key);
              const existing = displayValue(f.key, item.existing?.[f.key]);
              const incoming = displayValue(f.key, item.submitted?.[f.key]);
              return (
                <div
                  key={f.key}
                  className={`grid grid-cols-1 gap-1.5 rounded-lg border p-2.5 sm:grid-cols-[8rem_1fr_1fr] sm:gap-2 ${
                    differs ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-card'
                  }`}
                >
                  <dt className="text-xs font-semibold text-muted-foreground">
                    {f.label}
                    {differs && <span className="sr-only"> (differs)</span>}
                  </dt>
                  <dd className="min-w-0 break-words text-sm text-foreground">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground sm:hidden">
                      Existing
                    </span>
                    {existing || <span className="text-muted-foreground">—</span>}
                  </dd>
                  <dd
                    className={`min-w-0 break-words text-sm ${
                      differs ? 'font-semibold text-foreground' : 'text-foreground'
                    }`}
                  >
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground sm:hidden">
                      New
                    </span>
                    {incoming || <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>
              );
            })}
            {(newNotes || oldNotes) && (
              <div
                className={`grid grid-cols-1 gap-1.5 rounded-lg border p-2.5 sm:grid-cols-[8rem_1fr_1fr] sm:gap-2 ${
                  newNotes && newNotes !== oldNotes
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-border bg-card'
                }`}
              >
                <dt className="text-xs font-semibold text-muted-foreground">Notes</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground sm:hidden">
                    Existing
                  </span>
                  {oldNotes || <span className="text-muted-foreground">—</span>}
                </dd>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground sm:hidden">
                    New
                  </span>
                  {newNotes || <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            )}
          </dl>
          {item.existing?.id && (
            <Link
              href={`/leads/${item.existing.id}`}
              className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
            >
              Open the existing lead
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export default function DuplicatesPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<DuplicateItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mergeItem, setMergeItem] = useState<DuplicateItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/duplicates?status=${tab}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to load duplicates');
      setItems(j.items || []);
      setPendingCount(Number(j.pendingCount || 0));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load duplicates');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    item: DuplicateItem,
    body: Record<string, unknown>,
    successMsg: string
  ): Promise<boolean> => {
    setBusyId(item.id);
    try {
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Action failed');
      toast.success(successMsg);
      window.dispatchEvent(new Event(DUPLICATES_CHANGED_EVENT));
      await load();
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppLayout>
      <div className="page-aurora min-h-[calc(100dvh-8rem)] space-y-5 rounded-[2rem] p-3 sm:p-5">
        <div className="flex flex-col gap-3 rounded-[1.75rem] border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <Link
              href="/leads-management"
              className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={13} /> Back to Leads Management
            </Link>
            <h1 className="text-xl font-bold text-foreground">Duplicates</h1>
            <p className="text-xs text-muted-foreground">
              Someone tried to add a lead that already exists. Merge the new details into it, or
              dismiss the attempt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-secondary inline-flex min-h-[44px] items-center justify-center gap-2"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div role="tablist" aria-label="Duplicate status" className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] flex-shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.id === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-xs">Loading duplicates…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-500" />
            <h3 className="text-base font-bold text-foreground">
              {tab === 'pending' ? 'No duplicates to review' : `No ${tab} duplicates`}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              When someone adds or imports a lead that already exists, it shows up here for the
              lead&apos;s owner.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <DuplicateCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onMerge={() => setMergeItem(item)}
                onDismiss={() => void act(item, { action: 'dismiss' }, 'Duplicate dismissed')}
              />
            ))}
          </div>
        )}
      </div>

      <DuplicateMergeDialog
        item={mergeItem}
        busy={!!mergeItem && busyId === mergeItem.id}
        onClose={() => setMergeItem(null)}
        onConfirm={async (choices, appendNotes) => {
          if (!mergeItem) return;
          const ok = await act(
            mergeItem,
            { action: 'merge', choices, appendNotes },
            'Merged into the existing lead'
          );
          if (ok) setMergeItem(null);
        }}
      />
    </AppLayout>
  );
}

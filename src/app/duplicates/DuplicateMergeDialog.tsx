'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, GitMerge, ShieldCheck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  DUPLICATE_FIELDS,
  differingFields,
  displayValue,
  type DuplicateFieldKey,
  type DuplicateItem,
} from './duplicateFields';

interface Props {
  item: DuplicateItem | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (choices: Record<string, 'new' | 'existing'>, appendNotes: boolean) => void;
}

/**
 * Merge dialog: keep-existing is the default for every differing field; where
 * the existing lead has no value yet the new one is pre-selected (nothing is
 * lost by filling a blank). The owner can flip any field. Ownership of the
 * lead never changes.
 */
export default function DuplicateMergeDialog({ item, busy, onClose, onConfirm }: Props) {
  const fields = useMemo(
    () => (item ? differingFields(item.existing, item.submitted) : []),
    [item]
  );
  const newNotes = String(item?.submitted?.notes || '').trim();

  const [choices, setChoices] = useState<Record<string, 'new' | 'existing'>>({});
  const [appendNotes, setAppendNotes] = useState(true);

  useEffect(() => {
    if (!item) return;
    const initial: Record<string, 'new' | 'existing'> = {};
    for (const key of fields) {
      initial[key] = displayValue(key, item.existing?.[key]) ? 'existing' : 'new';
    }
    setChoices(initial);
    setAppendNotes(Boolean(newNotes));
  }, [item, fields, newNotes]);

  if (!item) return null;

  const label = (key: DuplicateFieldKey) => DUPLICATE_FIELDS.find((f) => f.key === key)?.label || key;
  const changing = fields.filter((k) => choices[k] === 'new').length;

  return (
    <Modal
      open={!!item}
      onClose={busy ? () => undefined : onClose}
      title="Merge into existing lead"
      subtitle="Keep existing values or pick the new ones, field by field"
      size="lg"
      mobileFullScreen
    >
      <div className="space-y-5">
        {fields.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            The new submission has no field that differs from the existing lead.
            {newNotes ? ' Only the notes can be appended.' : ' Merging will just close this duplicate.'}
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Fields that differ">
            {fields.map((key) => {
              const existing = displayValue(key, item.existing?.[key]) || '—';
              const incoming = displayValue(key, item.submitted?.[key]) || '—';
              const picked = choices[key] || 'existing';
              return (
                <li key={key} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label(key)}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={label(key)}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    {(
                      [
                        ['existing', 'Keep existing', existing],
                        ['new', 'Use new', incoming],
                      ] as const
                    ).map(([value, title, text]) => (
                      <label
                        key={value}
                        className={`flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                          picked === value
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`merge-${key}`}
                          className="mt-1 accent-[hsl(var(--primary))]"
                          checked={picked === value}
                          onChange={() => setChoices((c) => ({ ...c, [key]: value }))}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold text-muted-foreground">
                            {title}
                          </span>
                          <span className="block break-words font-medium text-foreground">{text}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {newNotes && (
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3">
            <input
              type="checkbox"
              className="mt-1 accent-[hsl(var(--primary))]"
              checked={appendNotes}
              onChange={(e) => setAppendNotes(e.target.checked)}
            />
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-foreground">
                Append the new notes to the lead
              </span>
              <span className="mt-1 block whitespace-pre-wrap break-words text-muted-foreground">
                {newNotes}
              </span>
            </span>
          </label>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-primary" />
          Ownership of the lead does not change. The merge is written to the lead&apos;s activity
          history.
        </p>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary min-h-[44px]">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(choices, appendNotes)}
            className="btn-primary inline-flex min-h-[44px] items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />}
            Merge{changing > 0 ? ` (${changing} field${changing === 1 ? '' : 's'} updated)` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

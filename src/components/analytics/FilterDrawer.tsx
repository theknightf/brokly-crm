'use client';
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { EMPTY_FILTERS, type Agent, type DateRange, type FilterState } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  value: FilterState;
  onApply: (next: FilterState) => void;
  agents: Agent[];
  sources: string[];
  channels: string[];
}

const INPUT =
  'h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400';

function RangeField({ label, value, onChange }: { label: string; value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold text-slate-400">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          aria-label={`${label} from`}
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className={INPUT}
        />
        <input
          type="date"
          aria-label={`${label} to`}
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className={INPUT}
        />
      </div>
    </fieldset>
  );
}

/** Right-side slide-over with every report filter; edits are applied only on "Apply Filter". */
export default function FilterDrawer({ open, onClose, value, onApply, agents, sources, channels }: Props) {
  const [draft, setDraft] = useState<FilterState>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label="Advanced filters">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-s border-slate-800 bg-[#161B22] shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <RangeField label="Assign Date" value={draft.assignDate} onChange={(r) => set('assignDate', r)} />
          <RangeField label="Action Date" value={draft.actionDate} onChange={(r) => set('actionDate', r)} />
          <RangeField label="Creation Date" value={draft.creationDate} onChange={(r) => set('creationDate', r)} />

          <label className="block space-y-1.5 text-xs font-semibold text-slate-400">
            Broker / Source
            <select value={draft.source} onChange={(e) => set('source', e.target.value)} className={INPUT}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-xs font-semibold text-slate-400">
            Channel
            <select value={draft.channel} onChange={(e) => set('channel', e.target.value)} className={INPUT}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-400">Is Cold Call</span>
            <div role="radiogroup" aria-label="Is Cold Call" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-900 p-1">
              {(['any', 'yes', 'no'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={draft.isColdCall === opt}
                  onClick={() => set('isColdCall', opt)}
                  className={`min-h-[36px] rounded-md text-sm font-semibold capitalize ${
                    draft.isColdCall === opt ? 'bg-lime-400 text-black' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt === 'any' ? 'Any' : opt}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5 text-xs font-semibold text-slate-400">
            Created By
            <select value={draft.createdBy} onChange={(e) => set('createdBy', e.target.value)} className={INPUT}>
              <option value="">Anyone</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer className="sticky bottom-0 flex gap-3 border-t border-slate-800 bg-[#161B22] px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onApply(EMPTY_FILTERS);
            }}
            className="min-h-[44px] flex-1 rounded-lg px-4 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            Reset Filters
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="min-h-[44px] flex-[2] rounded-lg bg-lime-400 px-4 text-sm font-semibold text-black hover:bg-lime-300"
          >
            Apply Filter
          </button>
        </footer>
      </aside>
    </div>
  );
}

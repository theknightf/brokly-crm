'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PhoneOutgoing,
  Plus,
  Search,
  StickyNote,
  UserSearch,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DirectionBadge, OutcomeBadge, PanelEmpty, PanelError, PanelSkeleton } from './StatusBadge';
import { formatDateTime, formatMmSs, initials, maskPhone } from './utils';
import type { CallLogRow, CallsPage, Loadable, SortKey } from './types';

const AVATAR_TONES = [
  'bg-lime-400/15 text-lime-400',
  'bg-cyan-400/15 text-[#00EBFF]',
  'bg-violet-600/20 text-violet-300',
  'bg-amber-500/15 text-amber-400',
];
const toneFor = (id: string | null) => {
  let h = 0;
  for (const ch of id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

interface Props {
  state: Loadable<CallsPage>;
  page: number;
  pageSize: number;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  search: string;
  onSearch: (q: string) => void;
  onSort: (key: SortKey) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
}

export default function CallsTable({ state, page, pageSize, sort, search, onSearch, onSort, onPage, onRetry }: Props) {
  const [input, setInput] = useState(search);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [preview, setPreview] = useState<CallLogRow | null>(null);

  // Search runs in SQL; wait for the user to stop typing.
  useEffect(() => {
    if (input === search) return;
    const t = window.setTimeout(() => onSearch(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input, search, onSearch]);

  const data = state.data;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const saveNote = async (row: CallLogRow) => {
    const body = noteText.trim();
    if (!body || !row.lead_id || savingNote) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/leads/${row.lead_id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, callId: row.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Could not save the note');
      toast.success('Note saved');
      setNoteFor(null);
      setNoteText('');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the note');
    } finally {
      setSavingNote(false);
    }
  };

  const th = (k: SortKey, label: string) => {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-400"
      >
        <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1.5 hover:text-slate-200">
          {label}
          <Icon size={12} className={active ? 'text-lime-400' : 'text-slate-600'} aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-[#161B22]" aria-label="Calls log">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 p-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Calls log <span className="ms-1 text-xs font-normal text-slate-500">({total.toLocaleString('en-US')})</span>
        </h3>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search lead, mobile or agent"
            aria-label="Search calls"
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 ps-9 pe-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
          />
        </div>
      </div>

      {state.error && !data ? (
        <PanelError message={state.error} onRetry={onRetry} />
      ) : state.loading && !data ? (
        <div className="p-4">
          <PanelSkeleton rows={8} />
        </div>
      ) : (
        <div className={`overflow-x-auto ${state.loading ? 'opacity-60 transition-opacity' : ''}`}>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-900/60">
              <tr>
                {th('lead', 'Lead name')}
                {th('phone', 'Mobile')}
                {th('agent', 'Sales agent')}
                {th('direction', 'Call type')}
                {th('outcome', 'Call result')}
                {th('duration', 'Duration')}
                {th('at', 'Timestamp')}
                <th scope="col" className="w-28 px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <PanelEmpty text="No calls match these filters." />
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const name = c.agent_name || 'Unknown';
                const noteOpen = noteFor === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr className="group border-t border-slate-800/60 hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        {c.lead_id ? (
                          <Link
                            href={`/leads/${c.lead_id}`}
                            className="font-medium text-slate-100 hover:text-lime-400 hover:underline"
                          >
                            {c.lead_name || 'Unnamed lead'}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="text-slate-400">Unknown number</span>
                            <Link
                              href="/leads-management"
                              className="inline-flex items-center gap-1 rounded-md border border-lime-400/30 bg-lime-400/10 px-2 py-1 text-xs font-semibold text-lime-400 hover:bg-lime-400/20"
                            >
                              <Plus size={12} aria-hidden="true" /> Add Lead
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300" dir="ltr">
                        {maskPhone(c.phone)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 text-slate-200">
                          {c.agent_avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.agent_avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${toneFor(c.user_id)}`}
                              aria-hidden="true"
                            >
                              {initials(name)}
                            </span>
                          )}
                          {name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DirectionBadge direction={c.direction} />
                      </td>
                      <td className="px-4 py-3">
                        <OutcomeBadge bucket={c.bucket} outcome={c.outcome} />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatMmSs(c.duration_seconds)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{formatDateTime(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label="Quick log note"
                            title={c.lead_id ? 'Quick log note' : 'No lead to attach a note to'}
                            disabled={!c.lead_id}
                            onClick={() => {
                              setNoteFor(noteOpen ? null : c.id);
                              setNoteText('');
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-lime-400 disabled:opacity-30"
                          >
                            <StickyNote size={15} />
                          </button>
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              aria-label="Call back"
                              title="Call back"
                              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-[#00EBFF]"
                            >
                              <PhoneOutgoing size={15} />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            aria-label="Preview lead"
                            title="Preview lead"
                            disabled={!c.lead_id}
                            onClick={() => setPreview(c)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-slate-100 disabled:opacity-30"
                          >
                            <UserSearch size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {noteOpen && (
                      <tr className="bg-slate-900/50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                            <textarea
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              maxLength={500}
                              rows={2}
                              placeholder="Quick note about this call"
                              aria-label="Quick note"
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={!noteText.trim() || savingNote}
                                onClick={() => void saveNote(c)}
                                className="min-h-[40px] rounded-lg bg-lime-400 px-4 text-sm font-semibold text-black hover:bg-lime-300 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setNoteFor(null)}
                                className="min-h-[40px] rounded-lg px-3 text-sm text-slate-400 hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 p-3 text-xs text-slate-400">
        <span>
          Page {Math.min(page, pages)} of {pages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page <= 1 || state.loading}
            aria-label="Previous page"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 rtl:rotate-180"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => onPage(Math.min(pages, page + 1))}
            disabled={page >= pages || state.loading}
            aria-label="Next page"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 rtl:rotate-180"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Lead preview">
          <button type="button" className="flex-1 cursor-default" aria-label="Close preview" onClick={() => setPreview(null)} />
          <aside className="h-full w-full max-w-sm overflow-y-auto border-s border-slate-800 bg-[#161B22] p-5">
            <div className="mb-4 flex items-start justify-between">
              <h4 className="text-base font-semibold text-slate-100">{preview.lead_name || 'Lead'}</h4>
              <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                ['Mobile', maskPhone(preview.phone)],
                ['Source', preview.source || '—'],
                ['Stage', preview.lead_stage || '—'],
                ['Cold call', preview.is_cold ? 'Yes' : 'No'],
                ['Owner', preview.owner_name || '—'],
                ['Last call by', preview.agent_name || '—'],
                ['Last call', formatDateTime(preview.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-800/70 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-end text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
            {preview.lead_id && (
              <Link
                href={`/leads/${preview.lead_id}`}
                className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-lime-400 px-4 text-sm font-semibold text-black hover:bg-lime-300"
              >
                Open lead profile
              </Link>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

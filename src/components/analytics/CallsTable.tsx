'use client';
import React, { useMemo, useState } from 'react';
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
import { DirectionBadge, OutcomeBadge } from './StatusBadge';
import { LEADS } from './mockData';
import { formatDateTime, formatMmSs, initials, maskPhone } from './utils';
import type { Agent, CallRecord } from './types';

type SortKey = 'lead' | 'phone' | 'agent' | 'direction' | 'outcome' | 'duration' | 'at';

const PAGE_SIZE = 10;
const AVATAR_TONES = ['bg-lime-400/15 text-lime-400', 'bg-cyan-400/15 text-[#00EBFF]', 'bg-violet-600/20 text-violet-300', 'bg-amber-500/15 text-amber-400'];

interface Props {
  calls: CallRecord[];
  agents: Agent[];
}

export default function CallsTable({ calls, agents }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || 'Unknown';
  const agentIndex = (id: string) => Math.max(0, agents.findIndex((a) => a.id === id));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = calls.filter(
      (c) =>
        !q ||
        (c.leadName || '').toLowerCase().includes(q) ||
        c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000') ||
        agentName(c.agentId).toLowerCase().includes(q)
    );
    const val = (c: CallRecord): string | number => {
      switch (sort.key) {
        case 'lead': return (c.leadName || '').toLowerCase();
        case 'phone': return c.phone;
        case 'agent': return agentName(c.agentId).toLowerCase();
        case 'direction': return c.direction;
        case 'outcome': return c.outcome;
        case 'duration': return c.durationSeconds;
        default: return c.at;
      }
    };
    return filtered.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? r : -r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, query, sort, agents]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const preview = previewId ? LEADS.find((l) => l.id === previewId) || null : null;

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
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
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1.5 hover:text-slate-200">
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
          Calls log <span className="ms-1 text-xs font-normal text-slate-500">({rows.length})</span>
        </h3>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search lead, mobile or agent"
            aria-label="Search calls"
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 ps-9 pe-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
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
            {slice.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  No calls match these filters.
                </td>
              </tr>
            )}
            {slice.map((c) => {
              const name = agentName(c.agentId);
              const noteOpen = noteFor === c.id;
              return (
                <React.Fragment key={c.id}>
                  <tr className="group border-t border-slate-800/60 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      {c.leadId ? (
                        <button
                          type="button"
                          onClick={() => setPreviewId(c.leadId)}
                          className="font-medium text-slate-100 hover:text-lime-400 hover:underline"
                        >
                          {c.leadName}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toast.info('Mock data: lead creation is not wired yet')}
                          className="inline-flex items-center gap-1 rounded-md border border-lime-400/30 bg-lime-400/10 px-2 py-1 text-xs font-semibold text-lime-400 hover:bg-lime-400/20"
                        >
                          <Plus size={12} aria-hidden="true" /> Add Lead
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300" dir="ltr">
                      {maskPhone(c.phone)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-slate-200">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${AVATAR_TONES[agentIndex(c.agentId) % AVATAR_TONES.length]}`}
                          aria-hidden="true"
                        >
                          {initials(name)}
                        </span>
                        {name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DirectionBadge direction={c.direction} />
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeBadge outcome={c.outcome} />
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatMmSs(c.durationSeconds)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{formatDateTime(c.at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label="Quick log note"
                          title="Quick log note"
                          onClick={() => {
                            setNoteFor(noteOpen ? null : c.id);
                            setNoteText('');
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-lime-400"
                        >
                          <StickyNote size={15} />
                        </button>
                        <a
                          href={`tel:${c.phone}`}
                          aria-label="Call back"
                          title="Call back"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-[#00EBFF]"
                        >
                          <PhoneOutgoing size={15} />
                        </a>
                        <button
                          type="button"
                          aria-label="Preview lead"
                          title="Preview lead"
                          disabled={!c.leadId}
                          onClick={() => setPreviewId(c.leadId)}
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
                              disabled={!noteText.trim()}
                              onClick={() => {
                                toast.success('Note logged (mock data)');
                                setNoteFor(null);
                              }}
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 p-3 text-xs text-slate-400">
        <span>
          Page {current} of {pages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current <= 1}
            aria-label="Previous page"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 rtl:rotate-180"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(pages, current + 1))}
            disabled={current >= pages}
            aria-label="Next page"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 rtl:rotate-180"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Lead preview">
          <button type="button" className="flex-1 cursor-default" aria-label="Close preview" onClick={() => setPreviewId(null)} />
          <aside className="h-full w-full max-w-sm overflow-y-auto border-s border-slate-800 bg-[#161B22] p-5">
            <div className="mb-4 flex items-start justify-between">
              <h4 className="text-base font-semibold text-slate-100">{preview.name}</h4>
              <button type="button" onClick={() => setPreviewId(null)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                ['Mobile', maskPhone(preview.phone)],
                ['Source', preview.source],
                ['Channel', preview.channel],
                ['Cold call', preview.isColdCall ? 'Yes' : 'No'],
                ['Assigned to', agentName(preview.assignedTo)],
                ['Created by', agentName(preview.createdBy)],
                ['Created', formatDateTime(preview.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-800/70 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-end text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </section>
  );
}

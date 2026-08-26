'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Phone, RefreshCw, Search, Filter } from 'lucide-react';
import { verifyCall, VERIFICATION_CLS, VerificationCategory } from '@/lib/callVerification';
import { outcomeClass } from '@/lib/ui';

interface CallLog {
  id: string;
  user_id: string;
  agent_name?: string;
  entity_type?: string;
  contact_name?: string;
  contact_phone?: string;
  channel?: string;
  direction?: string;
  duration_seconds?: number;
  outcome?: string;
  notes?: string;
  created_at?: string;
}

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CallLogsTab() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [outcome, setOutcome] = useState('');
  const [verification, setVerification] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/call-log', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load call logs');
        setLogs([]);
      } else {
        setLogs(json.calls || []);
      }
    } catch {
      setError('Failed to load call logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const channels = useMemo(() => [...new Set(logs.map((l) => l.channel).filter(Boolean))], [logs]);
  const outcomes = useMemo(() => [...new Set(logs.map((l) => l.outcome).filter(Boolean))], [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      const matchQ =
        !q ||
        l.contact_name?.toLowerCase().includes(q) ||
        l.agent_name?.toLowerCase().includes(q) ||
        l.contact_phone?.toLowerCase().includes(q) ||
        l.notes?.toLowerCase().includes(q);
      const matchChannel = !channel || l.channel === channel;
      const matchOutcome = !outcome || l.outcome === outcome;
      const matchVerification = !verification || verifyCall(l).category === verification;
      return matchQ && matchChannel && matchOutcome && matchVerification;
    });
  }, [logs, search, channel, outcome, verification]);

  const totalCalls = logs.length;
  const reached = logs.filter((l) => l.outcome === 'Reached').length;
  const callbacks = logs.filter((l) => l.outcome === 'Call back later').length;
  const incomingCalls = logs.filter((l) => l.direction === 'incoming').length;
  const attempts = logs.filter((l) => {
    const v = verifyCall(l);
    return v.category === 'No Answer' || v.category === 'Call';
  }).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">
            Every call / WhatsApp logged by your team from the app.
          </p>
        </div>
        <button
          onClick={load}
          className="btn-ghost flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium">Total calls</p>
          <p className="text-2xl font-bold mt-1">{totalCalls}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium">Connected</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{reached}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium">Call back</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{callbacks}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium">Incoming</p>
          <p className="text-2xl font-bold text-sky-600 mt-1">{incomingCalls}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="input-base pl-9"
            placeholder="Search by contact, agent, phone, note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <select
            className="input-base appearance-none pr-8 min-w-[130px]"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Filter
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>
        <div className="relative">
          <select
            className="input-base appearance-none pr-8 min-w-[140px]"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All outcomes</option>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <Filter
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>
        <div className="relative">
          <select
            className="input-base appearance-none pr-8 min-w-[160px]"
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
          >
            <option value="">All verifications</option>
            {(
              ['Incoming Call', 'Successful', 'Short Call', 'No Answer'] as VerificationCategory[]
            ).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <Filter
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-40 text-center rounded-2xl border border-border bg-card">
          <Phone size={22} className="text-muted-foreground mb-2" />
          <p className="text-sm font-semibold text-foreground">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center rounded-2xl border border-border bg-card">
          <Phone size={22} className="text-muted-foreground mb-2" />
          <p className="text-sm font-semibold text-foreground">No call logs</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Calls logged from the app will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-mobile">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Agent
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Contact
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Channel
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Outcome
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Notes
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{l.agent_name || 'Agent'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{l.contact_name || '—'}</span>
                        {l.contact_phone && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {l.contact_phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const v = verifyCall(l);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${VERIFICATION_CLS[v.category] || 'bg-blue-50 text-blue-700'}`}
                          >
                            {l.channel || 'Call'}
                            <span className="opacity-60">·</span>
                            {v.label}
                            {l.duration_seconds
                              ? ` · ${Math.round((l.duration_seconds || 0) / 60)}m`
                              : ''}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${outcomeClass(
                          l.outcome || ''
                        )}`}
                      >
                        {l.outcome || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-muted-foreground text-xs line-clamp-1 max-w-[260px] block">
                        {l.notes || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(l.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

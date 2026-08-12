'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Phone,
  Video,
  MessageCircle,
  Mail,
  MapPin,
  CalendarClock,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  Filter,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

interface CallLog {
  id: string;
  entity_type?: string;
  entity_id?: string;
  contact_name?: string;
  contact_phone?: string;
  channel?: string;
  direction?: string;
  duration_seconds?: number;
  outcome?: string;
  notes?: string;
  client_ref?: string;
  project_name?: string;
  agent_name?: string;
  created_at?: string;
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  Call: <Phone size={13} />,
  'Video Call': <Video size={13} />,
  WhatsApp: <MessageCircle size={13} />,
  Email: <Mail size={13} />,
  'Site Visit': <MapPin size={13} />,
  Meeting: <CalendarClock size={13} />,
};

const OUTCOME_CLS: Record<string, string> = {
  Interested: 'bg-emerald-50 text-emerald-700',
  'Call back later': 'bg-blue-50 text-blue-700',
  Busy: 'bg-amber-50 text-amber-700',
  'No Answer': 'bg-slate-100 text-slate-600',
  'Not Interested': 'bg-red-50 text-red-600',
  'Won Deal': 'bg-emerald-50 text-emerald-700',
  'Wrong Number': 'bg-slate-100 text-slate-600',
};

const fmtDur = (s?: number) => {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

export default function CallLogsScreen() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch('/api/call-log')
      .then((r) => r.json())
      .then((data) => {
        if (mounted) setCalls((data?.calls || []) as CallLog[]);
      })
      .catch(() => {
        if (mounted) setCalls([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const channels = useMemo(
    () => [...new Set(calls.map((c) => c.channel || 'Call'))] as string[],
    [calls]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (channelFilter && (c.channel || 'Call') !== channelFilter) return false;
      if (!q) return true;
      const hay = [
        c.contact_name,
        c.contact_phone,
        c.outcome,
        c.project_name,
        c.notes,
        c.agent_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [calls, search, channelFilter]);

  const counts = useMemo(() => {
    const byOutcome: Record<string, number> = {};
    let totalDur = 0;
    for (const c of calls) {
      if (c.outcome) byOutcome[c.outcome] = (byOutcome[c.outcome] || 0) + 1;
      totalDur += Number(c.duration_seconds) || 0;
    }
    return { total: calls.length, byOutcome, totalDur };
  }, [calls]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Call Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.total} touchpoint{counts.total !== 1 ? 's' : ''} recorded
          </p>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-card border border-border rounded-full px-3 py-1.5">
          <Phone size={12} className="text-primary" />
          {counts.total} total
        </span>
        {Object.entries(counts.byOutcome)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([outcome, n]) => (
            <span
              key={outcome}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 ${
                OUTCOME_CLS[outcome] || 'bg-muted text-muted-foreground'
              }`}
            >
              {outcome}: {n}
            </span>
          ))}
        {counts.totalDur > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-muted text-muted-foreground rounded-full px-3 py-1.5">
            {fmtDur(counts.totalDur)} talk time
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="card-base !p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contact, phone, outcome, project…"
              className="input-base !pl-9"
            />
          </div>
          <div className="relative">
            <Filter
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="input-base !pl-9 appearance-none"
            >
              <option value="">All channels</option>
              {channels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Phone size={22} className="text-muted-foreground" />}
          title="No call logs yet"
          description="Calls, site visits and WhatsApp touches you log from a lead will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <div key={c.id} className="card-base !p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-secondary text-primary flex items-center justify-center flex-shrink-0">
                    {CHANNEL_ICON[c.channel || 'Call'] || <Phone size={14} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.contact_name || c.contact_phone || 'Unknown contact'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[c.channel || 'Call', c.contact_phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                  {c.direction === 'incoming' ? (
                    <PhoneIncoming size={12} className="text-emerald-500" />
                  ) : (
                    <PhoneOutgoing size={12} className="text-blue-500" />
                  )}
                  {c.direction === 'incoming' ? 'In' : 'Out'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {c.outcome && (
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-full ${
                      OUTCOME_CLS[c.outcome] || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {c.outcome}
                  </span>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {fmtDur(c.duration_seconds)}
                </span>
                {c.project_name && (
                  <span className="text-muted-foreground truncate max-w-[180px]">
                    · {c.project_name}
                  </span>
                )}
                {c.agent_name && <span className="text-muted-foreground">· {c.agent_name}</span>}
              </div>

              {c.notes && <p className="text-xs text-muted-foreground line-clamp-2">{c.notes}</p>}

              <p className="text-[11px] text-muted-foreground/70">
                {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

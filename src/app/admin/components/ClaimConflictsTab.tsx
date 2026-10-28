'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface Conflict {
  id: string;
  created_at: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  holder_id: string | null;
  holder_name: string | null;
  requester_id: string | null;
  requester_name: string | null;
  attempted_action: string;
  status: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Admin-only audit view of rejected lead claims (rows are also protected by RLS). */
export default function ClaimConflictsTab() {
  const [rows, setRows] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/claim-conflicts', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to load conflicts');
      setRows(j.conflicts || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load conflicts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <ShieldAlert size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Claim conflicts</h2>
            <p className="text-xs text-muted-foreground">
              Rejected attempts to take a lead another user already holds. Visible to admins only.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary inline-flex min-h-[44px] items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No conflicts logged.
        </p>
      ) : (
        <>
          {/* Phones: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-card p-3 text-sm space-y-1">
                <p className="font-semibold text-foreground">
                  {c.lead_id ? (
                    <Link href={`/leads/${c.lead_id}`} className="hover:underline">
                      {c.lead_name || c.lead_phone || 'Lead'}
                    </Link>
                  ) : (
                    c.lead_name || 'Lead (deleted)'
                  )}
                </p>
                <p className="text-muted-foreground">Held by: <span className="text-foreground">{c.holder_name || '—'}</span></p>
                <p className="text-muted-foreground">Requested by: <span className="text-foreground">{c.requester_name || '—'}</span></p>
                <p className="text-xs text-muted-foreground">
                  {fmt(c.created_at)} · <span className="font-semibold text-red-500">{c.status}</span>
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border text-start">
                  <th className="p-3 text-start font-semibold">When</th>
                  <th className="p-3 text-start font-semibold">Lead</th>
                  <th className="p-3 text-start font-semibold">Original holder</th>
                  <th className="p-3 text-start font-semibold">Requester</th>
                  <th className="p-3 text-start font-semibold">Action</th>
                  <th className="p-3 text-start font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{fmt(c.created_at)}</td>
                    <td className="p-3">
                      {c.lead_id ? (
                        <Link href={`/leads/${c.lead_id}`} className="font-medium text-foreground hover:underline">
                          {c.lead_name || c.lead_phone || 'Lead'}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{c.lead_name || 'Lead (deleted)'}</span>
                      )}
                      {c.lead_phone && (
                        <span className="block text-xs text-muted-foreground font-mono-data" dir="ltr">
                          {c.lead_phone}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{c.holder_name || '—'}</td>
                    <td className="p-3">{c.requester_name || '—'}</td>
                    <td className="p-3 capitalize">{c.attempted_action}</td>
                    <td className="p-3 font-semibold text-red-500">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

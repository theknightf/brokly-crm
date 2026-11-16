'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

/**
 * Admin/owner only: on an original lead in the leads list, a badge "Duplicate ×N" when someone
 * tried to add the same phone again. Clicking it shows the original next to each duplicate attempt.
 * Sales never see it (the badge is not rendered, and RLS hides duplicate_leads from them anyway).
 */

type Attempt = {
  id: string;
  original_lead_id: string;
  attempted_by: string | null;
  attempted_data: any;
  attempt_count: number | null;
  created_at: string;
  last_attempt_at: string | null;
  status: string | null;
};

// One shared fetch for all rows, refreshed at most every 2 minutes.
let cache: { at: number; byLead: Map<string, Attempt[]>; names: Map<string, string> } | null = null;
let inflight: Promise<typeof cache> | null = null;
const listeners = new Set<() => void>();

async function load() {
  if (cache && Date.now() - cache.at < 120_000) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const db: any = createClient();
    const { data } = await db
      .from('duplicate_leads')
      .select('id, original_lead_id, attempted_by, attempted_data, attempt_count, created_at, last_attempt_at, status')
      .not('original_lead_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000);
    const byLead = new Map<string, Attempt[]>();
    for (const r of (data || []) as Attempt[]) {
      const list = byLead.get(r.original_lead_id) || [];
      list.push(r);
      byLead.set(r.original_lead_id, list);
    }
    const ids = Array.from(new Set((data || []).map((r: Attempt) => r.attempted_by).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await db.from('user_profiles').select('id, full_name').in('id', ids);
      for (const p of profiles || []) names.set(p.id, p.full_name || '');
    }
    cache = { at: Date.now(), byLead, names };
    inflight = null;
    listeners.forEach((l) => l());
    return cache;
  })().catch(() => {
    inflight = null;
    return cache;
  });
  return inflight;
}

function fmt(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DuplicateAttemptsBadge({ lead }: { lead: any }) {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!admin) return;
    const l = () => force((n) => n + 1);
    listeners.add(l);
    load();
    return () => {
      listeners.delete(l);
    };
  }, [admin]);

  if (!admin || !cache) return null;
  const attempts = cache.byLead.get(String(lead.id)) || [];
  if (attempts.length === 0) return null;
  const total = attempts.reduce((s, a) => s + (a.attempt_count || 1), 0);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="This lead was entered again — click to see the duplicate"
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
      >
        <Copy size={10} />
        Duplicate ×{total}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-[#12121a]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Original lead and its duplicates</h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-muted">
                  <X size={18} />
                </button>
              </div>

              <div className="mb-3 rounded-xl border border-lime-500/40 bg-lime-500/5 p-3 text-sm">
                <div className="mb-1 text-[11px] font-semibold uppercase text-lime-700 dark:text-lime-400">Original</div>
                <div className="font-semibold text-foreground" dir="auto">{lead.name || '—'}</div>
                <div className="text-muted-foreground" dir="ltr">{lead.phone}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Owner: {lead.assignedToName || lead.agent || '—'} · Stage: {lead.status || '—'} · Added {fmt(lead.createdAtIso || lead.createdAt)}
                </div>
              </div>

              <div className="space-y-2">
                {attempts.map((a) => {
                  const d = a.attempted_data || {};
                  return (
                    <div key={a.id} className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase text-violet-700 dark:text-violet-300">
                        <span>Duplicate{(a.attempt_count || 1) > 1 ? ` ×${a.attempt_count}` : ''}</span>
                        <span className="normal-case">{a.status || 'pending'}</span>
                      </div>
                      <div className="font-semibold text-foreground" dir="auto">{d.name || '—'}</div>
                      <div className="text-muted-foreground" dir="ltr">{d.phone}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Entered by: {(a.attempted_by && cache?.names.get(a.attempted_by)) || '—'}
                        {d.source ? ` · Source: ${d.source}` : ''}
                        {d.crm_status ? ` · Stage chosen: ${d.crm_status}` : ''}
                        {' · '}
                        {fmt(a.last_attempt_at || a.created_at)}
                      </div>
                      {d.notes ? <div className="mt-1 text-xs text-foreground/80" dir="auto">{String(d.notes)}</div> : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <a href="/duplicates" className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700">
                  Open Duplicates page
                </a>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

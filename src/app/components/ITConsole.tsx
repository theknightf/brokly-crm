'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Database, Loader2, Lock, LockOpen, RefreshCw, Search, ShieldCheck, UserCheck, UserX, Users, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { roleLabelOf } from '@/lib/ui';

interface ItUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
  lastSeen: string | null;
  online: boolean;
  ip: string | null;
  device: string | null;
}
interface Overview {
  health: {
    dbOk: boolean;
    dbMs: number;
    usersTotal: number;
    usersActive: number;
    usersDisabled: number;
    usersOnline: number;
    importsFailed7d: number;
    importsFailed24h: number;
    duplicatesPending: number;
  };
  users: ItUser[];
  failedImports: { id: string; original_file_name: string; uploaded_by_name: string; status: string; total_rows: number; imported_count: number; error_count: number; summary: string; created_at: string }[];
  audit: { id: string; user_name: string; entity_type: string; action: string; description: string; created_at: string }[];
  me: string;
}

function ago(iso?: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function deviceLabel(ua?: string | null): string {
  if (!ua) return '';
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : '';
  const br = /edg/i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : /firefox/i.test(ua) ? 'Firefox' : /dart/i.test(ua) ? 'App' : '';
  return [br, os].filter(Boolean).join(' · ');
}

/** IT console: system health at the top, every account with a one-tap Close / Reopen, then what went wrong lately. */
export default function ITConsole() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'closed'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/it/overview', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load');
      setData(j);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), 60000);
    return () => clearInterval(t);
  }, [load]);

  const setActive = async (u: ItUser, active: boolean) => {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/it/users/${u.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success(active ? `${u.name} can sign in again` : `${u.name} is closed — signed out and blocked`);
      if (j.warning) toast.warning(`Account updated, but the login block gave a warning: ${j.warning}`);
      setConfirmId(null);
      await load(true);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  const users = useMemo(() => {
    const list = data?.users || [];
    const s = q.trim().toLowerCase();
    return list.filter((u) => {
      if (filter === 'online' && !u.online) return false;
      if (filter === 'closed' && u.active) return false;
      if (!s) return true;
      return `${u.name} ${u.email || ''} ${roleLabelOf(u.role)}`.toLowerCase().includes(s);
    });
  }, [data, q, filter]);

  if (loading && !data)
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={26} className="animate-spin text-primary" />
      </div>
    );
  if (error && !data)
    return (
      <div className="dash-card mx-auto max-w-md p-8 text-center">
        <p className="mb-4 text-sm text-destructive">{error}</p>
        <button onClick={() => load()} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  if (!data) return null;
  const h = data.health;

  const healthCards = [
    { label: 'Database', value: h.dbOk ? 'OK' : 'Problem', sub: `${h.dbMs} ms`, icon: Database, tone: h.dbOk ? 'text-emerald-600 bg-emerald-500/10' : 'text-red-600 bg-red-500/10' },
    { label: 'Online now', value: h.usersOnline, sub: `of ${h.usersActive} active`, icon: Wifi, tone: 'text-sky-600 bg-sky-500/10' },
    { label: 'Accounts', value: h.usersTotal, sub: `${h.usersActive} active`, icon: Users, tone: 'text-lime-600 bg-lime-500/10' },
    { label: 'Closed accounts', value: h.usersDisabled, sub: 'cannot sign in', icon: UserX, tone: h.usersDisabled ? 'text-amber-600 bg-amber-500/10' : 'text-slate-600 bg-slate-500/10' },
    { label: 'Failed imports', value: h.importsFailed7d, sub: `${h.importsFailed24h} in last 24h`, icon: AlertTriangle, tone: h.importsFailed7d ? 'text-red-600 bg-red-500/10' : 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Duplicates waiting', value: h.duplicatesPending, sub: 'for review', icon: Activity, tone: 'text-violet-600 bg-violet-500/10' },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-foreground">
            <ShieldCheck size={22} className="text-primary" /> IT Console
          </h1>
          <p className="text-sm text-muted-foreground">System health, accounts and problems. Refreshes every minute.</p>
        </div>
        <button onClick={() => load()} aria-label="Refresh" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* 1. Health */}
      <section aria-label="System health" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {healthCards.map((c) => (
          <div key={c.label} className="dash-card p-4">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.tone}`}>
              <c.icon size={18} />
            </span>
            <p className="mt-3 text-3xl font-extrabold tabular-nums text-foreground">{c.value}</p>
            <p className="text-sm font-semibold text-foreground">{c.label}</p>
            <p className="text-[11px] text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </section>

      {/* 2. Accounts: one tap to close or reopen */}
      <section aria-label="Accounts" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">Accounts</h2>
            <p className="text-sm text-muted-foreground">Close an account to sign that person out and block their login. Reopen it any time.</p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {(['all', 'online', 'closed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize [@media(pointer:coarse)]:min-h-[40px] ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="relative max-w-md">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, email or role…" className="input-base h-10 w-full ps-9 text-sm" />
        </div>
        <div className="dash-card overflow-hidden">
          {users.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No accounts match.</p>
          ) : (
            <ul className="divide-y divide-border">
              {users.map((u) => {
                const isMe = u.id === data.me;
                const isOwner = String(u.role).toLowerCase() === 'owner';
                const locked = isMe || isOwner;
                const busy = busyId === u.id;
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${u.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {u.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                        <span className="truncate" dir="auto">{u.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{roleLabelOf(u.role)}</span>
                        {isMe && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">You</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email || '—'}
                        {u.ip ? ` · ${u.ip}` : ''}
                        {deviceLabel(u.device) ? ` · ${deviceLabel(u.device)}` : ''}
                      </p>
                    </div>
                    <div className="flex w-40 flex-col items-start gap-0.5 text-xs">
                      {!u.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-600 dark:text-red-400"><Lock size={11} /> Closed</span>
                      ) : u.online ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300"><UserCheck size={11} /> Online</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">Offline</span>
                      )}
                      <span className="text-muted-foreground">Seen {ago(u.lastSeen)}</span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {locked ? (
                        <span className="text-xs text-muted-foreground">{isMe ? 'Your account' : 'Protected'}</span>
                      ) : u.active ? (
                        confirmId === u.id ? (
                          <>
                            <button onClick={() => setActive(u, false)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60 [@media(pointer:coarse)]:min-h-[44px]">
                              {busy ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Yes, close
                            </button>
                            <button onClick={() => setConfirmId(null)} className="btn-secondary px-3 py-2 text-xs [@media(pointer:coarse)]:min-h-[44px]">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmId(u.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10 dark:text-red-400 [@media(pointer:coarse)]:min-h-[44px]">
                            <Lock size={13} /> Close
                          </button>
                        )
                      ) : (
                        <button onClick={() => setActive(u, true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 [@media(pointer:coarse)]:min-h-[44px]">
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <LockOpen size={13} />} Reopen
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* 3. Problems: imports that failed or had errors in the last 7 days */}
      <section aria-label="Failed imports" className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Imports with problems <span className="text-sm font-normal text-muted-foreground">· last 7 days</span></h2>
          <p className="text-sm text-muted-foreground">Sheets that failed or had rows that could not be imported.</p>
        </div>
        <div className="dash-card overflow-hidden">
          {data.failedImports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No import problems. 🎉</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.failedImports.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground" dir="auto">{i.original_file_name}</p>
                    <p className="text-xs text-muted-foreground">{i.uploaded_by_name || 'User'} · {ago(i.created_at)}</p>
                    {i.summary ? <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{i.summary}</p> : null}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${i.status === 'Failed' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{i.status}</span>
                    <span className="text-muted-foreground">{i.imported_count}/{i.total_rows} imported · {i.error_count} errors</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 4. Recent changes */}
      <section aria-label="Recent changes" className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recent changes</h2>
          <p className="text-sm text-muted-foreground">Who changed what, newest first. Closing and reopening accounts shows up here too.</p>
        </div>
        <div className="dash-card overflow-hidden">
          {data.audit.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.audit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-foreground" dir="auto">
                    <strong className="font-semibold">{a.user_name || 'System'}</strong> · {a.description || `${a.action} ${a.entity_type}`}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{ago(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

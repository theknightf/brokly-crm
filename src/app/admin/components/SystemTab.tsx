'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  Gauge,
  Globe,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface HealthReport {
  ok: boolean;
  timestamp: string;
  actor?: { id: string; email: string | null; role: string };
  env: {
    supabaseUrlConfigured: boolean;
    supabaseHost: string | null;
    serviceRoleKeyConfigured: boolean;
    siteUrl: string | null;
  };
  db: { connected: boolean; latencyMs: number | null; error?: string };
  counts: Record<string, number | null>;
  sessions: { active: number | null };
  schema: { missingTables: string[]; missingColumns: string[] };
}

interface LogEntry {
  id: number;
  time: string;
  kind: 'error' | 'rejection' | 'fetch';
  message: string;
  detail?: string;
}

const REFRESH_MS = 15000;

function mask(value?: string | null, visible = 8): string {
  if (!value) return '— not set —';
  return value.length <= visible ? value : `${value.slice(0, visible)}…`;
}

function StatusDot({ ok, unknown }: { ok: boolean; unknown?: boolean }) {
  if (unknown) return <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />;
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
  );
}

export default function SystemTab() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pings, setPings] = useState<number[]>([]);
  const [pinging, setPinging] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runtime, setRuntime] = useState<Record<string, string>>({});
  const [swStatus, setSwStatus] = useState('checking…');
  const logIdRef = useRef(0);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/tech/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Health endpoint returned ${res.status}`);
      setReport(await res.json());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reach /api/tech/health');
    } finally {
      setLoading(false);
    }
  }, []);

  const collectRuntime = useCallback(async () => {
    const nav = navigator as any;
    let storage = '—';
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) {
        const fmt = (b?: number) => (b ? `${(b / 1024 / 1024).toFixed(1)} MB` : '?');
        storage = `${fmt(est.usage)} used / ${fmt(est.quota)} quota`;
      }
    } catch {}
    const conn = nav.connection;
    setRuntime({
      Platform: nav.userAgentData?.platform || navigator.platform || '—',
      Browser: nav.userAgent,
      Language: navigator.language,
      Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      'CPU threads': nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : '—',
      Memory: nav.deviceMemory ? `~${nav.deviceMemory} GB` : '—',
      Screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
      Network: conn ? `${conn.effectiveType || '?'} · rtt ${conn.rtt ?? '?'}ms` : '—',
      Online: navigator.onLine ? 'yes' : 'no',
      Cookies: navigator.cookieEnabled ? 'enabled' : 'blocked',
      Storage: storage,
    });
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        setSwStatus(reg ? `active (${reg.scope})` : 'not registered');
      } else {
        setSwStatus('unsupported');
      }
    } catch {
      setSwStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    collectRuntime();

    const push = (kind: LogEntry['kind'], message: string, detail?: string) => {
      setLogs((prev) =>
        [
          {
            id: ++logIdRef.current,
            time: new Date().toLocaleTimeString(),
            kind,
            message,
            detail,
          },
          ...prev,
        ].slice(0, 50)
      );
    };
    const onError = (e: ErrorEvent) => push('error', e.message, `${e.filename}:${e.lineno}`);
    const onRejection = (e: PromiseRejectionEvent) =>
      push('rejection', String(e.reason?.message || e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) timer = setInterval(fetchHealth, REFRESH_MS);
    const onlineChange = () => fetchHealth();
    window.addEventListener('online', onlineChange);
    window.addEventListener('offline', onlineChange);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('online', onlineChange);
      window.removeEventListener('offline', onlineChange);
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh, fetchHealth, collectRuntime]);

  const runPing = async () => {
    setPinging(true);
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        await fetch('/api/tech/health', { cache: 'no-store' });
        samples.push(Math.round(performance.now() - t0));
      } catch {}
    }
    setPings(samples);
    setPinging(false);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ report, runtime, logs }, null, 2));
      toast.success('Diagnostics copied to clipboard');
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  const authInfo = () => {
    const raw = typeof document !== 'undefined' ? document.cookie : '';
    const hasSbCookie = /sb-/i.test(raw);
    const hasLocalKeys =
      typeof localStorage !== 'undefined' &&
      Object.keys(localStorage).some((k) => k.startsWith('sb-'));
    return { hasSbCookie, hasLocalKeys };
  };

  const auth = authInfo();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Cpu size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">System Diagnostics</h2>
            <p className="text-xs text-muted-foreground">
              Live technical health of the CRM — database, schema, sessions &amp; runtime
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-[#84cc16]"
            />
            Auto ({REFRESH_MS / 1000}s)
          </label>
          <button onClick={copyReport} className="btn-secondary text-sm flex items-center gap-2">
            <Copy size={14} />
            Copy report
          </button>
          <button
            onClick={() => {
              setLoading(true);
              fetchHealth();
              collectRuntime();
            }}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {!report ? (
        <div className="flex items-center justify-center h-48 bg-card border border-border rounded-xl">
          <Loader2 size={26} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Status cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Database size={15} />}
              label="Database"
              value={report.db.connected ? `${report.db.latencyMs ?? '?'} ms` : 'Offline'}
              ok={report.db.connected}
            />
            <StatCard
              icon={<Server size={15} />}
              label="Service key"
              value={report.env.serviceRoleKeyConfigured ? 'Configured' : 'Missing'}
              ok={report.env.serviceRoleKeyConfigured}
            />
            <StatCard
              icon={<Activity size={15} />}
              label="Active sessions"
              value={report.sessions.active === null ? '?' : String(report.sessions.active)}
              ok={report.sessions.active !== null}
            />
            <StatCard
              icon={navigator.onLine ? <Wifi size={15} /> : <WifiOff size={15} />}
              label="Browser"
              value={navigator.onLine ? 'Online' : 'Offline'}
              ok={navigator.onLine}
            />
          </div>

          {/* Connectivity probe */}
          <Section title="Connectivity" icon={<Gauge size={13} />}>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={runPing} disabled={pinging} className="btn-secondary text-sm flex items-center gap-2">
                {pinging ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Ping API ×3
              </button>
              {pings.length > 0 && (
                <div className="text-sm font-mono text-muted-foreground">
                  {pings.join(' ms · ')} ms{' '}
                  <span className="text-foreground">
                    (avg {Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)} ms)
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <StatusDot ok={report.db.connected} />
                <span className="text-muted-foreground">Last DB round-trip:</span>
                <span className="font-mono">{report.db.latencyMs ?? '?'} ms</span>
              </div>
              {report.db.error && (
                <p className="text-xs text-destructive w-full">{report.db.error}</p>
              )}
            </div>
          </Section>

          {/* Configuration */}
          <Section title="Configuration" icon={<ShieldCheck size={13} />}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row k="Supabase host" v={report.env.supabaseHost || '— not set —'} mono />
              <Row k="Service-role key" v={report.env.serviceRoleKeyConfigured ? mask('configured', 10) : '— missing —'} mono />
              <Row k="Site URL" v={mask(report.env.siteUrl)} mono />
              <Row k="Session storage" v={`${auth.hasSbCookie ? 'cookie' : ''}${auth.hasSbCookie && auth.hasLocalKeys ? ' + ' : ''}${auth.hasLocalKeys ? 'localStorage' : ''}` || 'none found'} mono />
            </dl>
          </Section>

          {/* Database counts */}
          <Section title="Database tables" icon={<Database size={13} />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(report.counts).map(([table, count]) => (
                <div key={table} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground truncate">{table}</span>
                  <span className={`text-sm font-mono font-semibold ${count === null ? 'text-destructive' : 'text-foreground'}`}>
                    {count === null ? 'N/A' : count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Migration / schema checks */}
          <Section title="Schema & migrations" icon={<Terminal size={13} />}>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                {report.schema.missingTables.length === 0 ? (
                  <CheckCircle2 size={15} className="text-emerald-500" />
                ) : (
                  <XCircle size={15} className="text-red-500" />
                )}
                <span className="text-muted-foreground">
                  All expected tables present
                  {report.schema.missingTables.length > 0 && (
                    <> — missing: <span className="font-mono text-destructive">{report.schema.missingTables.join(', ')}</span></>
                  )}
                </span>
              </li>
              <li className="flex items-center gap-2">
                {report.schema.missingColumns.length === 0 ? (
                  <CheckCircle2 size={15} className="text-emerald-500" />
                ) : (
                  <AlertTriangle size={15} className="text-amber-500" />
                )}
                <span className="text-muted-foreground">
                  user_profiles columns complete
                  {report.schema.missingColumns.length > 0 && (
                    <> — missing: <span className="font-mono text-destructive">{report.schema.missingColumns.join(', ')}</span></>
                  )}
                </span>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Globe size={15} className="text-muted-foreground/60" />
                Service-worker: <span className="font-mono text-xs">{swStatus}</span>
              </li>
            </ul>
          </Section>

          {/* Runtime */}
          <Section title="Runtime environment" icon={<Cpu size={13} />}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {Object.entries(runtime).map(([k, v]) => (
                <Row key={k} k={k} v={v} mono small />
              ))}
            </dl>
          </Section>

          {/* Live error console */}
          <Section
            title={`Live error console${logs.length ? ` (${logs.length})` : ''}`}
            icon={<AlertTriangle size={13} />}
            action={
              logs.length > 0 ? (
                <button onClick={() => setLogs([])} className="btn-ghost text-xs text-muted-foreground">
                  Clear
                </button>
              ) : undefined
            }
          >
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-500" />
                No client errors captured in this session.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 font-mono text-xs">
                {logs.map((l) => (
                  <div key={l.id} className="bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground/70">{l.time}</span>{' '}
                    <span
                      className={
                        l.kind === 'error'
                          ? 'text-red-500'
                          : l.kind === 'rejection'
                          ? 'text-amber-500'
                          : 'text-sky-500'
                      }
                    >
                      [{l.kind}]
                    </span>{' '}
                    <span className="text-foreground break-all">{l.message}</span>
                    {l.detail && <div className="text-muted-foreground/70 mt-0.5 break-all">{l.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
            <Activity size={11} />
            Report generated {new Date(report.timestamp).toLocaleString()} · identity:{' '}
            <span className="font-mono">{report.actor?.role}</span>{' '}
            <span className="font-mono">{mask(report.actor?.id, 8)}</span>
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-foreground truncate">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  small,
}: {
  k: string;
  v: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd
        className={`${mono ? 'font-mono' : ''} ${small ? 'text-xs' : 'text-sm'} text-foreground break-all`}
      >
        {v}
      </dd>
    </>
  );
}

'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cairoDay, fmtDate, fmtDateTime } from '@/lib/cairoDate';
import { StatusPill } from '@/components/ui/StatusPill';

/**
 * Reports → Sales Performance (أداء المبيعات): one row per sales person for a date range.
 * Numbers come from the `sales_performance_v2` RPC (SECURITY DEFINER with its own visibility rule:
 * admin/owner everyone, team leaders their team, others themselves). Every number opens the leads
 * behind it (`sales_performance_leads`).
 */

type Row = {
  user_id: string;
  full_name: string;
  role: string;
  assigned: number;
  created: number;
  duplicates: number;
  calls: number;
  actions: number;
  late: number;
};
type Kind = 'assigned' | 'created' | 'duplicates' | 'calls' | 'actions' | 'late';
type SortKey = 'full_name' | Kind;

const COLUMNS: { key: SortKey; label: string; ar: string; hint?: string }[] = [
  { key: 'full_name', label: 'Sales name', ar: 'اسم السيلز' },
  { key: 'assigned', label: 'Assigned leads', ar: 'العملاء المتوزعة', hint: 'Leads assigned to them in the period' },
  { key: 'created', label: 'Created leads', ar: 'العملاء المضافة', hint: 'Leads they added themselves in the period (duplicates that were blocked are not counted)' },
  { key: 'duplicates', label: 'Duplicate', ar: 'المكرر', hint: 'Duplicate attempts in the period on leads they own' },
  { key: 'calls', label: 'Total calls', ar: 'المكالمات', hint: 'Calls they logged in the period' },
  { key: 'actions', label: 'Total actions', ar: 'الإجراءات', hint: 'Same as the leaderboard: written notes (calls for people set to count calls)' },
  { key: 'late', label: 'Late', ar: 'متأخر', hint: 'Open leads whose next-action date has passed (right now, not tied to the dates)' },
];

// Numeric columns, in table order.
const NUMBER_KINDS: Kind[] = ['assigned', 'created', 'duplicates', 'calls', 'actions', 'late'];

const DAY_MS = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

type Drill = { user: Row; kind: Kind } | null;
type DrillRow = { lead_id: string; name: string | null; phone: string | null; stage: string | null; owner: string | null; happened_at: string | null; detail: string | null };

export default function SalesPerformanceScreen() {
  const today = cairoDay();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'actions', dir: 'desc' });
  const [drill, setDrill] = useState<Drill>(null);

  const load = useCallback(async (f: string, t: string) => {
    if (!f || !t || f > t) {
      toast.error('Pick a valid date range');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await createClient().rpc('sales_performance_v2', { p_from: f, p_to: t });
      if (error) throw error;
      setRows((data || []) as Row[]);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load sales performance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preset = (days: number | 'month') => {
    const f = days === 'month' ? `${today.slice(0, 8)}01` : addDays(today, -(days - 1));
    setFrom(f);
    setTo(today);
    void load(f, today);
  };

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [rows, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          assigned: t.assigned + r.assigned,
          created: t.created + (r.created || 0),
          duplicates: t.duplicates + r.duplicates,
          calls: t.calls + r.calls,
          actions: t.actions + r.actions,
          late: t.late + r.late,
        }),
        { assigned: 0, created: 0, duplicates: 0, calls: 0, actions: 0, late: 0 }
      ),
    [rows]
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'full_name' ? 'asc' : 'desc' }));

  return (
    <div className="space-y-5">
      {/* Header + date filter */}
      <div className="flex flex-wrap items-end gap-3">
        <Link href="/reports" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground" aria-label="Back to reports">
          <ArrowLeft size={18} className="rtl:rotate-180" />
        </Link>
        <div className="me-auto">
          <h1 className="text-xl font-extrabold text-foreground">Sales Performance · أداء المبيعات</h1>
          <p className="text-xs text-muted-foreground">One row per sales person. Tap any number to see the leads behind it. Days are Cairo time.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
          <button type="button" onClick={() => preset(1)} className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-card">Today</button>
          <button type="button" onClick={() => preset(7)} className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-card">7 days</button>
          <button type="button" onClick={() => preset('month')} className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-card">This month</button>
        </div>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-base mt-1 block h-11" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input-base mt-1 block h-11" />
        </label>
        <button type="button" onClick={() => void load(from, to)} disabled={loading} className="btn-primary inline-flex h-11 items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Apply
        </button>
      </div>

      {/* Table */}
      <div className="card-base !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th key={c.key} className={`px-4 py-3 ${c.key === 'full_name' ? 'text-start' : 'text-end'}`} title={c.hint}>
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${active ? 'text-foreground' : 'text-muted-foreground'} ${c.key === 'full_name' ? '' : 'flex-row-reverse'}`}
                      >
                        <span className="text-start">
                          {c.label}
                          <span className="block text-[10px] font-semibold normal-case tracking-normal opacity-70">{c.ar}</span>
                        </span>
                        <Icon size={13} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-t border-border">
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-muted-foreground">No sales people to show.</td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.user_id} className={`border-t border-border ${loading ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {r.full_name}
                      <span className="block text-[11px] font-normal capitalize text-muted-foreground">{r.role.replace('_', ' ')}</span>
                    </td>
                    {NUMBER_KINDS.map((k) => (
                      <td key={k} className="px-4 py-3 text-end">
                        <NumberCell value={r[k] || 0} tone={k === 'late' ? 'red' : k === 'duplicates' ? 'amber' : undefined} onClick={() => setDrill({ user: r, kind: k })} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/40 font-bold">
                <tr>
                  <td className="px-4 py-3 text-foreground">Total · الإجمالي</td>
                  {NUMBER_KINDS.map((k) => (
                    <td key={k} className="px-4 py-3 text-end tabular-nums text-foreground">{totals[k].toLocaleString()}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Assigned = leads given to them in the period · Created = leads they added themselves in the period · Duplicate = duplicate attempts in the period on leads they own · Actions = same rule as the dashboard leaderboard · Late = overdue right now (not tied to the dates).
      </p>

      {drill && <DrillModal drill={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </div>
  );
}

function NumberCell({ value, onClick, tone }: { value: number; onClick: () => void; tone?: 'red' | 'amber' }) {
  if (!value) return <span className="tabular-nums text-muted-foreground">0</span>;
  const color = tone === 'red' ? 'text-red-600 dark:text-red-400' : tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-primary';
  return (
    <button type="button" onClick={onClick} className={`min-h-[36px] min-w-[44px] rounded-lg px-2 text-base font-bold tabular-nums hover:bg-muted hover:underline ${color}`}>
      {value.toLocaleString()}
    </button>
  );
}

const KIND_TITLE: Record<Kind, string> = {
  assigned: 'Assigned leads',
  created: 'Created leads',
  duplicates: 'Duplicates',
  calls: 'Leads called',
  actions: 'Leads with actions',
  late: 'Late (overdue) leads',
};

function DrillModal({ drill, from, to, onClose }: { drill: { user: Row; kind: Kind }; from: string; to: string; onClose: () => void }) {
  const [list, setList] = useState<DrillRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await createClient().rpc('sales_performance_leads', {
        p_user: drill.user.user_id,
        p_kind: drill.kind,
        p_from: from,
        p_to: to,
      });
      if (!alive) return;
      if (error) {
        toast.error(error.message);
        setList([]);
      } else setList((data || []) as DrillRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [drill, from, to]);

  // Leads page deep links that match the number where the Leads page supports it.
  const agent = encodeURIComponent(drill.user.full_name);
  const leadsLink =
    drill.kind === 'duplicates' ? '/duplicates' : drill.kind === 'late' ? `/leads-management?agent=${agent}&overdue=1` : `/leads-management?agent=${agent}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="me-auto">
            <h2 className="text-lg font-bold text-foreground">
              {KIND_TITLE[drill.kind]} · {drill.user.full_name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {drill.kind === 'late' ? 'Right now' : `${fmtDate(from)} – ${fmtDate(to)}`} · {list ? `${list.length} lead${list.length === 1 ? '' : 's'}` : 'Loading…'}
            </p>
          </div>
          {/* The Leads page filters by owner, which would not match "created by", so no shortcut for that column. */}
          {drill.kind !== 'created' && (
            <Link href={leadsLink} className="btn-secondary inline-flex h-10 items-center gap-1.5 text-sm">
              {drill.kind === 'duplicates' ? 'Open Duplicates' : 'Open in Leads'} <ExternalLink size={14} />
            </Link>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto">
          {list === null ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No leads.</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-start">Lead</th>
                  <th className="px-4 py-2 text-start">Stage</th>
                  <th className="px-4 py-2 text-start">Owner</th>
                  <th className="px-4 py-2 text-start">{drill.kind === 'late' ? 'Was due' : drill.kind === 'created' ? 'Created' : 'When'}</th>
                  <th className="px-4 py-2 text-start">Detail</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l, i) => (
                  <tr key={`${l.lead_id}-${i}`} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link href={`/leads/${l.lead_id}`} className="font-semibold text-foreground hover:text-primary hover:underline" dir="auto">
                        {l.name || 'No name'}
                      </Link>
                      <span className="block text-xs tabular-nums text-muted-foreground" dir="ltr">{l.phone}</span>
                    </td>
                    <td className="px-4 py-2">{l.stage ? <StatusPill status={l.stage} /> : '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{l.owner || '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {l.happened_at ? (drill.kind === 'late' ? fmtDate(l.happened_at) : fmtDateTime(l.happened_at)) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground" dir="auto">{l.detail || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, Loader2, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cairoDay, fmtDate, fmtDateTime } from '@/lib/cairoDate';

/**
 * Weekly agent report: one section per agent (actions per day, stages, overdue follow-ups, hot leads),
 * plus a team summary. Data comes from the `weekly_agents_report` RPC, which runs with the caller's RLS:
 * agents see themselves, team leaders their team, admins everyone.
 * Printing uses a print-only copy portalled to <body>, so the app shell never clips or shows in the printout.
 */

type Day = { day: string; stage: number; notes: number; nextAction: number; calls: number; leads: number };
type LeadRow = { id: string; name: string | null; stage: string; due: string | null; daysLate?: number; lastAction: string | null; priority?: string | null };
type Agent = {
  id: string;
  name: string | null;
  role: string;
  team: string | null;
  daily: Day[];
  leadsTouched: number;
  stagesNow: Record<string, number>;
  movedTo: Record<string, number>;
  totalLeads: number;
  openLeads: number;
  newAssigned: number;
  overdue: number;
  dueToday: number;
  dueNext7: number;
  noNextAction: number;
  untouched: number;
  overdueList: LeadRow[];
  hotList: LeadRow[];
};
type Report = { from: string; to: string; today: string; agents: Agent[] };

const DAY_MS = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** Work week starts Saturday. */
const weekStart = (ymd: string) => {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  return addDays(ymd, -((dow + 1) % 7));
};
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const dayLabel = (ymd: string) => `${weekday(ymd)} ${new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;

const sumDays = (d: Day[]) =>
  d.reduce(
    (a, x) => ({ stage: a.stage + x.stage, notes: a.notes + x.notes, nextAction: a.nextAction + x.nextAction, calls: a.calls + x.calls, leads: a.leads + x.leads }),
    { stage: 0, notes: 0, nextAction: 0, calls: 0, leads: 0 }
  );
const sortedEntries = (o: Record<string, number>) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);

export default function WeeklyReportScreen() {
  const today = cairoDay();
  const [from, setFrom] = useState(() => weekStart(today));
  const [to, setTo] = useState(() => today);
  const [agentId, setAgentId] = useState<string>('all');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async (f: string, t: string) => {
    if (!f || !t || f > t) {
      toast.error('Pick a valid date range');
      return;
    }
    setLoading(true);
    try {
      const { data: res, error } = await createClient().rpc('weekly_agents_report', { p_from: f, p_to: t });
      if (error) throw error;
      setData(res as Report);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load the weekly report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreset = (p: 'this' | 'last') => {
    const s = p === 'this' ? weekStart(today) : addDays(weekStart(today), -7);
    const e = p === 'this' ? today : addDays(s, 6);
    setFrom(s);
    setTo(e);
    void load(s, e);
  };

  const agents = useMemo(() => {
    const list = data?.agents || [];
    return agentId === 'all' ? list : list.filter((a) => a.id === agentId);
  }, [data, agentId]);

  const report = data ? <ReportBody data={data} agents={agents} showSummary={agentId === 'all'} /> : null;

  return (
    <div className="space-y-5">
      <style>{`
        #weekly-print { display: none; }
        @media print {
          @page { size: A4; margin: 12mm; }
          body > *:not(#weekly-print) { display: none !important; }
          #weekly-print { display: block !important; color: #000; background: #fff; }
          html, body { background: #fff !important; }
          .wr-page { break-after: page; }
          .wr-page:last-child { break-after: auto; }
          .wr-avoid { break-inside: avoid; }
          a { color: inherit; text-decoration: none; }
        }
      `}</style>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <Link href="/reports" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground" aria-label="Back to reports">
          <ArrowLeft size={18} className="rtl:rotate-180" />
        </Link>
        <div className="me-auto">
          <h1 className="text-xl font-extrabold text-foreground">Weekly agent report</h1>
          <p className="text-xs text-muted-foreground">Actions per day, stages, follow-ups and hot leads for each agent. Days are Cairo time.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
          <button type="button" onClick={() => setPreset('this')} className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-card">This week</button>
          <button type="button" onClick={() => setPreset('last')} className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-card">Last week</button>
        </div>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-base mt-1 block h-11" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input-base mt-1 block h-11" />
        </label>
        <button type="button" onClick={() => void load(from, to)} disabled={loading} className="btn-secondary inline-flex h-11 items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Load
        </button>
        <label className="text-xs text-muted-foreground">
          Agent
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input-base mt-1 block h-11 min-w-[160px]">
            <option value="all">All agents</option>
            {(data?.agents || []).map((a) => (
              <option key={a.id} value={a.id}>{a.name || 'Unnamed'}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => window.print()} disabled={!data || loading} className="btn-primary inline-flex h-11 items-center gap-2 disabled:opacity-40">
          <Printer size={16} /> Print
        </button>
      </div>

      {loading && !data ? (
        <div className="flex h-60 items-center justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents you can see for this range.</p>
      ) : (
        <div className={`rounded-2xl border border-border bg-white p-6 text-black ${loading ? 'opacity-60' : ''}`}>{report}</div>
      )}

      {mounted && report && agents.length > 0 && createPortal(<div id="weekly-print">{report}</div>, document.body)}
    </div>
  );
}

/* ───────────────────────── Report body (same markup on screen and on paper) ───────────────────────── */

const th = 'border border-neutral-300 bg-neutral-100 px-2 py-1 text-start text-[11px] font-bold uppercase tracking-wide';
const td = 'border border-neutral-300 px-2 py-1 text-[12px] align-top';
const tdNum = `${td} text-center tabular-nums`;

function ReportBody({ data, agents, showSummary }: { data: Report; agents: Agent[]; showSummary: boolean }) {
  const range = `${fmtDate(data.from)} – ${fmtDate(data.to)}`;
  const printedAt = fmtDateTime(new Date().toISOString());
  return (
    <div className="space-y-8 font-sans text-black" dir="ltr">
      {showSummary && agents.length > 1 && (
        <section className="wr-page space-y-3">
          <Header title="Team summary" range={range} printedAt={printedAt} />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Agent', 'Leads worked', 'Stage changes', 'Notes', 'Calls', 'New assigned', 'Open leads', 'Overdue', 'Due today', 'No next action', 'Not touched this week'].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const s = sumDays(a.daily || []);
                return (
                  <tr key={a.id}>
                    <td className={td}><b>{a.name || 'Unnamed'}</b>{a.team ? <span className="block text-[10px] text-neutral-500">{a.team}</span> : null}</td>
                    <td className={tdNum}>{a.leadsTouched}</td>
                    <td className={tdNum}>{s.stage}</td>
                    <td className={tdNum}>{s.notes}</td>
                    <td className={tdNum}>{s.calls}</td>
                    <td className={tdNum}>{a.newAssigned}</td>
                    <td className={tdNum}>{a.openLeads}</td>
                    <td className={`${tdNum} ${a.overdue > 0 ? 'font-bold text-red-700' : ''}`}>{a.overdue}</td>
                    <td className={tdNum}>{a.dueToday}</td>
                    <td className={`${tdNum} ${a.noNextAction > 0 ? 'text-amber-700' : ''}`}>{a.noNextAction}</td>
                    <td className={tdNum}>{a.untouched}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-neutral-500">
            Leads worked = different leads where the agent changed the stage, added a note or set a next action. Overdue = next action date before today on a lead that is still open.
          </p>
        </section>
      )}

      {agents.map((a) => (
        <AgentSection key={a.id} a={a} range={range} printedAt={printedAt} />
      ))}
    </div>
  );
}

function Header({ title, sub, range, printedAt }: { title: string; sub?: string | null; range: string; printedAt: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b-2 border-black pb-2">
      <div>
        <h2 className="text-lg font-extrabold">{title}</h2>
        {sub ? <p className="text-xs text-neutral-600">{sub}</p> : null}
      </div>
      <div className="text-end text-[11px] text-neutral-600">
        <p className="font-semibold text-black">{range}</p>
        <p>Printed {printedAt}</p>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-lg border border-neutral-300 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${tone === 'red' && value > 0 ? 'text-red-700' : tone === 'amber' && value > 0 ? 'text-amber-700' : ''}`}>{value}</p>
    </div>
  );
}

function LeadName({ r }: { r: LeadRow }) {
  return (
    <Link href={`/leads/${r.id}`} className="font-semibold hover:underline" dir="auto">
      {r.name || 'No name'}
    </Link>
  );
}

function AgentSection({ a, range, printedAt }: { a: Agent; range: string; printedAt: string }) {
  const s = sumDays(a.daily || []);
  const stages = sortedEntries(a.stagesNow);
  const moved = sortedEntries(a.movedTo);
  return (
    <section className="wr-page space-y-4">
      <Header title={a.name || 'Unnamed'} sub={[a.team, a.role?.replace('_', ' ')].filter(Boolean).join(' · ')} range={range} printedAt={printedAt} />

      <div className="wr-avoid grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Kpi label="Leads worked" value={a.leadsTouched} />
        <Kpi label="Stage changes" value={s.stage} />
        <Kpi label="Notes" value={s.notes} />
        <Kpi label="Calls" value={s.calls} />
        <Kpi label="New assigned" value={a.newAssigned} />
        <Kpi label="Open leads" value={a.openLeads} />
        <Kpi label="Overdue" value={a.overdue} tone="red" />
        <Kpi label="Due today" value={a.dueToday} />
        <Kpi label="Due next 7 days" value={a.dueNext7} />
        <Kpi label="No next action" value={a.noNextAction} tone="amber" />
        <Kpi label="Not touched this week" value={a.untouched} tone="amber" />
        <Kpi label="All leads" value={a.totalLeads} />
      </div>

      {/* Actions per day */}
      <div className="wr-avoid">
        <h3 className="mb-1 text-sm font-bold">Actions per day</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Day', 'Leads worked', 'Stage changes', 'Notes', 'Next action set', 'Calls'].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(a.daily || []).map((d) => {
              const idle = d.leads + d.calls === 0;
              return (
                <tr key={d.day} className={idle ? 'text-neutral-400' : ''}>
                  <td className={td}>{dayLabel(d.day)}</td>
                  <td className={tdNum}>{d.leads}</td>
                  <td className={tdNum}>{d.stage}</td>
                  <td className={tdNum}>{d.notes}</td>
                  <td className={tdNum}>{d.nextAction}</td>
                  <td className={tdNum}>{d.calls}</td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td className={td}>Total</td>
              <td className={tdNum}>{a.leadsTouched}</td>
              <td className={tdNum}>{s.stage}</td>
              <td className={tdNum}>{s.notes}</td>
              <td className={tdNum}>{s.nextAction}</td>
              <td className={tdNum}>{s.calls}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Stages */}
      <div className="wr-avoid grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-bold">Leads by stage now</h3>
          <StageTable rows={stages} empty="No leads assigned" />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">Moved to this week</h3>
          <StageTable rows={moved} empty="No stage changes this week" />
        </div>
      </div>

      {/* Hot leads */}
      <div>
        <h3 className="mb-1 text-sm font-bold">Hot leads (Meeting · Interested · Following Up) — {a.hotList.length}</h3>
        {a.hotList.length === 0 ? (
          <p className="text-[12px] text-neutral-500">None.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>{['Lead', 'Stage', 'Next action', 'Last action'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {a.hotList.map((r) => {
                const late = !!r.due && r.due < cairoDay();
                return (
                  <tr key={r.id} className="wr-avoid">
                    <td className={td}><LeadName r={r} /></td>
                    <td className={td}>{r.stage}</td>
                    <td className={`${td} ${late ? 'font-bold text-red-700' : ''}`}>{r.due ? fmtDate(r.due) : '—'}{late ? ' (late)' : ''}</td>
                    <td className={td}>{r.lastAction ? fmtDateTime(r.lastAction) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Overdue */}
      <div>
        <h3 className="mb-1 text-sm font-bold">
          Overdue follow-ups — {a.overdue}
          {a.overdue > a.overdueList.length ? ` (first ${a.overdueList.length} shown)` : ''}
        </h3>
        {a.overdueList.length === 0 ? (
          <p className="text-[12px] text-neutral-500">None. 👍</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>{['#', 'Lead', 'Stage', 'Was due', 'Days late', 'Last action'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {a.overdueList.map((r, i) => (
                <tr key={r.id} className="wr-avoid">
                  <td className={tdNum}>{i + 1}</td>
                  <td className={td}><LeadName r={r} /></td>
                  <td className={td}>{r.stage}</td>
                  <td className={td}>{r.due ? fmtDate(r.due) : '—'}</td>
                  <td className={`${tdNum} font-bold text-red-700`}>{r.daysLate ?? ''}</td>
                  <td className={td}>{r.lastAction ? fmtDateTime(r.lastAction) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function StageTable({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (!rows.length) return <p className="text-[12px] text-neutral-500">{empty}</p>;
  const total = rows.reduce((n, [, v]) => n + v, 0);
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className={td}>{k}</td>
            <td className={tdNum}>{v}</td>
          </tr>
        ))}
        <tr className="font-bold">
          <td className={td}>Total</td>
          <td className={tdNum}>{total}</td>
        </tr>
      </tbody>
    </table>
  );
}

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, useExercises, useSettings } from '../db';
import { Btn, Card, Chip, Empty, H, IconBtn, NumBox, Seg, useChartColors } from '../components/ui';
import { avg, e1rm, round, sumMacros } from '../lib/calc';
import { addDays, fmtShort, todayStr } from '../lib/date';
import { upsertMetric } from '../lib/data';
import { fromDisplay, lenFromDisplay, lenToDisplay, lenUnit, toDisplay } from '../lib/units';

type Range = '7' | '30' | '90' | 'all';

function useAxisProps() {
  const c = useChartColors();
  return {
    c,
    axis: { stroke: c.grid, tick: { fill: c.muted, fontSize: 11 } },
    tooltip: {
      contentStyle: { background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, color: c.ink },
      labelStyle: { color: c.muted },
    },
  };
}

/* ---------- log body metrics ---------- */

function LogMetrics() {
  const s = useSettings();
  const date = todayStr();
  const today = useLiveQuery(() => db.metrics.where('date').equals(date).first(), [date]);
  const latest = useLiveQuery(() => db.metrics.orderBy('date').filter((m) => m.weight != null).last(), []);
  const [d, setD] = useState(date);
  const [w, setW] = useState<number | null>(null);
  const [m, setM] = useState({ waist: 0, chest: 0, arm: 0 });
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(false);

  const weight = w ?? (latest?.weight != null ? toDisplay(latest.weight, s.unit) : 70);

  async function save() {
    const patch: Record<string, number> = { weight: fromDisplay(weight, s.unit) };
    for (const k of ['waist', 'chest', 'arm'] as const) if (m[k] > 0) patch[k] = lenFromDisplay(m[k], s.unit);
    await upsertMetric(d, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <Card className="space-y-3">
      <H>Log body metrics</H>
      <div className="grid grid-cols-2 gap-3">
        <NumBox label="Weight" unit={s.unit} value={weight} onChange={setW} />
        <label className="block rounded-xl border border-line bg-surface px-3 py-2">
          <span className="text-xs text-muted">Date</span>
          <input
            type="date"
            value={d}
            max={date}
            onChange={(e) => e.target.value && setD(e.target.value)}
            className="block w-full bg-transparent pt-1 text-lg font-bold outline-none"
          />
        </label>
      </div>
      {more && (
        <div className="grid grid-cols-3 gap-2">
          <NumBox label="Waist" unit={lenUnit(s.unit)} value={m.waist} onChange={(waist) => setM({ ...m, waist })} />
          <NumBox label="Chest" unit={lenUnit(s.unit)} value={m.chest} onChange={(chest) => setM({ ...m, chest })} />
          <NumBox label="Arm" unit={lenUnit(s.unit)} value={m.arm} onChange={(arm) => setM({ ...m, arm })} />
        </div>
      )}
      <div className="flex gap-2">
        <Btn variant="soft" onClick={() => setMore(!more)}>
          {more ? 'Hide measurements' : 'Measurements'}
        </Btn>
        <Btn className="flex-1" onClick={save}>
          {saved ? 'Saved' : today && d === date ? 'Update entry' : 'Save entry'}
        </Btn>
      </div>
    </Card>
  );
}

/* ---------- weight chart ---------- */

function WeightChart() {
  const s = useSettings();
  const { c, axis, tooltip } = useAxisProps();
  const [range, setRange] = useState<Range>('30');
  const metrics = useLiveQuery(() => db.metrics.orderBy('date').filter((m) => m.weight != null).toArray(), []) ?? [];

  const data = useMemo(() => {
    const all = metrics.map((m, i) => {
      const win = metrics.slice(Math.max(0, i - 6), i + 1).map((x) => x.weight as number);
      return {
        date: m.date,
        label: fmtShort(m.date),
        weight: toDisplay(m.weight as number, s.unit),
        avg: toDisplay(avg(win), s.unit),
      };
    });
    if (range === 'all') return all;
    const from = addDays(todayStr(), -(Number(range) - 1));
    return all.filter((p) => p.date >= from);
  }, [metrics, range, s.unit]);

  const recent = [...metrics].reverse().slice(0, 5);

  return (
    <Card className="space-y-3">
      <H>Body weight</H>
      <div className="flex gap-2 overflow-x-auto">
        {(['7', '30', '90', 'all'] as Range[]).map((r) => (
          <Chip key={r} active={range === r} onClick={() => setRange(r)}>
            {r === 'all' ? 'All' : `${r}d`}
          </Chip>
        ))}
      </div>
      {data.length < 2 ? (
        <Empty>Log at least two weigh-ins in this range to see the chart.</Empty>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
              <YAxis
                {...axis}
                domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
                width={44}
              />
              <Tooltip {...tooltip} formatter={(v: unknown) => `${round(Number(v), 1)} ${s.unit}`} />
              <Line type="monotone" dataKey="weight" name="Weight" stroke={c.muted} strokeWidth={1.5} dot={{ r: 2.5, fill: c.muted }} />
              <Line type="monotone" dataKey="avg" name="7-entry average" stroke={c.accent} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-muted">Grey: each weigh-in. Green: moving average of the last 7 entries.</p>

      {recent.length > 0 && (
        <ul className="divide-y divide-line">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span className="text-sm text-muted">{fmtShort(m.date)}</span>
              <span className="tnum font-semibold">
                {toDisplay(m.weight as number, s.unit)} {s.unit}
                {m.waist ? ` · waist ${lenToDisplay(m.waist, s.unit)}` : ''}
              </span>
              <IconBtn
                n="trash"
                label="Delete entry"
                onClick={() => {
                  if (window.confirm(`Delete the entry from ${fmtShort(m.date)}?`)) void db.metrics.delete(m.id!);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- strength chart ---------- */

function StrengthChart() {
  const s = useSettings();
  const { c, axis, tooltip } = useAxisProps();
  const exercises = useExercises();
  const sets = useLiveQuery(() => db.sets.filter((x) => x.done).toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const [pick, setPick] = useState<number | null>(null);
  const [mode, setMode] = useState<'e1rm' | 'top'>('e1rm');

  const withData = useMemo(() => {
    const ids = new Set(sets.map((x) => x.exerciseId));
    return exercises.filter((e) => ids.has(e.id!));
  }, [sets, exercises]);

  const exId = pick ?? withData[0]?.id ?? null;

  const data = useMemo(() => {
    if (exId == null) return [];
    const dateOf = new Map(sessions.map((x) => [x.id!, x.date]));
    const byDate = new Map<string, number>();
    for (const x of sets) {
      if (x.exerciseId !== exId) continue;
      const date = dateOf.get(x.sessionId);
      if (!date) continue;
      const v = mode === 'e1rm' ? e1rm(x.weight, x.reps) : x.weight;
      byDate.set(date, Math.max(byDate.get(date) ?? 0, v));
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ label: fmtShort(date), value: toDisplay(v, s.unit) }));
  }, [exId, sets, sessions, mode, s.unit]);

  return (
    <Card className="space-y-3">
      <H>Strength</H>
      {withData.length === 0 ? (
        <Empty>Finish a workout to see your strength over time.</Empty>
      ) : (
        <>
          <select
            value={exId ?? ''}
            onChange={(e) => setPick(Number(e.target.value))}
            className="min-h-[48px] w-full rounded-xl border border-line bg-surface px-3 font-semibold outline-none"
          >
            {withData.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { value: 'e1rm', label: 'Estimated 1RM' },
              { value: 'top', label: 'Top set weight' },
            ]}
          />
          {data.length < 2 ? (
            <Empty>Needs at least two sessions with this exercise.</Empty>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis {...axis} domain={['auto', 'auto']} width={44} />
                  <Tooltip {...tooltip} formatter={(v: unknown) => `${round(Number(v), 1)} ${s.unit}`} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={mode === 'e1rm' ? 'Est. 1RM' : 'Top set'}
                    stroke={c.accent}
                    strokeWidth={3}
                    dot={{ r: 3, fill: c.accent }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-muted">Estimated 1RM uses the Epley formula: weight × (1 + reps / 30).</p>
        </>
      )}
    </Card>
  );
}

/* ---------- weekly summary ---------- */

function WeeklySummary() {
  const s = useSettings();
  const from = addDays(todayStr(), -6);
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(from).toArray(), [from]) ?? [];
  const logs = useLiveQuery(() => db.foodLogs.where('date').aboveOrEqual(from).toArray(), [from]) ?? [];
  const metrics = useLiveQuery(() => db.metrics.orderBy('date').filter((m) => m.weight != null).toArray(), []) ?? [];

  const workouts = sessions.filter((x) => x.finishedAt).length;
  const byDay = new Map<string, typeof logs>();
  for (const l of logs) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  const dayTotals = [...byDay.values()].map((l) => sumMacros(l));
  const avgKcal = avg(dayTotals.map((t) => t.kcal));
  const avgProtein = avg(dayTotals.map((t) => t.protein));

  const inWeek = metrics.filter((m) => m.date >= from);
  const before = [...metrics].reverse().find((m) => m.date < from);
  let change: number | null = null;
  if (inWeek.length) {
    const start = inWeek.length > 1 ? inWeek[0] : before;
    if (start) change = (inWeek[inWeek.length - 1].weight as number) - (start.weight as number);
  }
  const changeTxt =
    change == null ? '—' : `${change > 0 ? '+' : ''}${round(toDisplay(Math.abs(change), s.unit) * Math.sign(change), 1)} ${s.unit}`;

  const Stat = ({ v, l }: { v: string; l: string }) => (
    <div className="rounded-xl bg-surface2 p-3">
      <p className="tnum text-2xl font-extrabold">{v}</p>
      <p className="text-xs text-muted">{l}</p>
    </div>
  );

  return (
    <Card className="space-y-3">
      <H>Last 7 days</H>
      <div className="grid grid-cols-2 gap-3">
        <Stat v={String(workouts)} l="workouts completed" />
        <Stat v={dayTotals.length ? `${Math.round(avgKcal)} kcal` : '—'} l="average calories" />
        <Stat v={dayTotals.length ? `${Math.round(avgProtein)} g` : '—'} l="average protein" />
        <Stat v={changeTxt} l="weight change" />
      </div>
      <p className="text-xs text-muted">
        Averages count only days with food logged ({dayTotals.length} of 7).
      </p>
    </Card>
  );
}

export default function Progress() {
  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Progress</h1>
      <WeeklySummary />
      <LogMetrics />
      <WeightChart />
      <StrengthChart />
    </div>
  );
}

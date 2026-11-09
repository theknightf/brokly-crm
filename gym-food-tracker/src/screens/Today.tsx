import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useExercises, useSettings } from '../db';
import { useApp } from '../ctx';
import { Bar, Btn, Card, H, I, Ring, Stepper } from '../components/ui';
import { sumMacros } from '../lib/calc';
import { fmtDay, todayStr } from '../lib/date';
import { setWater, startSession, upsertMetric } from '../lib/data';
import { fromDisplay, toDisplay } from '../lib/units';

export default function Today() {
  const { go, openSession } = useApp();
  const s = useSettings();
  const date = todayStr();

  const logs = useLiveQuery(() => db.foodLogs.where('date').equals(date).toArray(), [date]) ?? [];
  const plans = useLiveQuery(() => db.plans.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.where('date').equals(date).toArray(), [date]) ?? [];
  const running = useLiveQuery(() => db.sessions.filter((x) => !x.finishedAt).first(), []);
  const dayLog = useLiveQuery(() => db.days.get(date), [date]);
  const latest = useLiveQuery(() => db.metrics.orderBy('date').filter((m) => m.weight != null).last(), []);
  const todayMetric = useLiveQuery(() => db.metrics.where('date').equals(date).first(), [date]);
  const exercises = useExercises();
  const exName = (id: number) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  const tot = sumMacros(logs);
  const plan = plans.find((p) => p.active) ?? null;
  const day = plan?.days.find((d) => d.weekdays.includes(new Date().getDay())) ?? null;
  const doneToday = day ? sessions.some((x) => x.dayId === day.id && x.finishedAt) : false;
  const water = dayLog?.water ?? 0;

  const [weightInput, setWeightInput] = useState<number | null>(null);
  const shownWeight = weightInput ?? (latest?.weight != null ? toDisplay(latest.weight, s.unit) : 70);

  async function start(d: typeof day) {
    openSession(await startSession(plan, d));
  }

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <header>
        <p className="text-sm text-muted">{fmtDay(date)}</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Today</h1>
      </header>

      {/* Workout */}
      <Card>
        <H>Today's workout</H>
        {running ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">In progress: {running.name}</p>
            <Btn className="w-full" onClick={() => openSession(running.id!)}>
              <I n="play" className="h-5 w-5" /> Resume workout
            </Btn>
          </div>
        ) : day ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xl font-bold">{day.name}</p>
              {doneToday && <span className="text-sm font-semibold text-accent">Done today</span>}
            </div>
            <ul className="space-y-1 text-sm text-muted">
              {day.exercises.map((e, i) => (
                <li key={i} className="flex justify-between">
                  <span>{exName(e.exerciseId)}</span>
                  <span className="tnum">
                    {e.sets} × {e.reps}
                  </span>
                </li>
              ))}
            </ul>
            <Btn className="w-full" variant={doneToday ? 'soft' : 'primary'} onClick={() => start(day)}>
              <I n="play" className="h-5 w-5" /> {doneToday ? 'Train again' : 'Start workout'}
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {plan ? 'Rest day in your plan. Want to train anyway?' : 'No active plan. Create one in the Workout tab.'}
            </p>
            {plan?.days.map((d) => (
              <Btn key={d.id} variant="soft" className="w-full" onClick={() => start(d)}>
                {d.name}
              </Btn>
            ))}
            <Btn variant="ghost" className="w-full" onClick={() => start(null)}>
              Quick workout
            </Btn>
          </div>
        )}
      </Card>

      {/* Nutrition */}
      <Card>
        <H
          right={
            <button onClick={() => go('food')} className="min-h-[44px] px-2 text-sm font-semibold text-accent">
              Add food
            </button>
          }
        >
          Nutrition
        </H>
        <div className="flex items-center justify-around">
          <div className="flex flex-col items-center gap-2">
            <Ring value={tot.kcal} goal={s.calories} size={132}>
              <span className="tnum text-2xl font-extrabold">{Math.max(0, Math.round(s.calories - tot.kcal))}</span>
              <span className="text-xs text-muted">kcal left</span>
            </Ring>
            <span className="tnum text-xs text-muted">
              {Math.round(tot.kcal)} / {s.calories}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Ring value={tot.protein} goal={s.protein} size={132}>
              <span className="tnum text-2xl font-extrabold">{Math.round(tot.protein)}</span>
              <span className="text-xs text-muted">g protein</span>
            </Ring>
            <span className="tnum text-xs text-muted">
              {Math.round(tot.protein)} / {s.protein} g
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Bar label="Carbs" value={tot.carbs} goal={s.carbs} unit="g" />
          <Bar label="Fat" value={tot.fat} goal={s.fat} unit="g" />
        </div>
      </Card>

      {/* Water */}
      <Card>
        <H>Water</H>
        <div className="flex items-center justify-between">
          <div>
            <p className="tnum text-3xl font-extrabold">
              {water}
              <span className="text-base font-semibold text-muted"> / {s.waterGoal} glasses</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1 text-accent">
              {Array.from({ length: Math.max(s.waterGoal, water) }).map((_, i) => (
                <I key={i} n="drop" className={`h-4 w-4 ${i < water ? '' : 'opacity-25'}`} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              aria-label="Remove a glass"
              onClick={() => setWater(date, water - 1)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 active:opacity-60"
            >
              <I n="minus" />
            </button>
            <button
              aria-label="Add a glass"
              onClick={() => setWater(date, water + 1)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-onaccent active:opacity-70"
            >
              <I n="plus" />
            </button>
          </div>
        </div>
      </Card>

      {/* Body weight */}
      <Card>
        <H
          right={
            todayMetric?.weight != null ? (
              <span className="text-sm font-semibold text-accent">Logged today</span>
            ) : undefined
          }
        >
          Body weight
        </H>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-1">
            <Stepper
              value={shownWeight}
              onChange={setWeightInput}
              step={s.unit === 'kg' ? 0.1 : 0.2}
              inputClass="w-24 text-3xl"
              label="Body weight"
            />
            <span className="text-sm text-muted">{s.unit}</span>
          </div>
          <Btn
            onClick={async () => {
              await upsertMetric(date, { weight: fromDisplay(shownWeight, s.unit) });
              setWeightInput(null);
            }}
          >
            {todayMetric?.weight != null ? 'Update' : 'Log'}
          </Btn>
        </div>
        {latest?.weight != null && (
          <p className="mt-2 text-xs text-muted">
            Last entry: {toDisplay(latest.weight, s.unit)} {s.unit} on {fmtDay(latest.date)}
          </p>
        )}
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useExercises } from '../../db';
import { useApp } from '../../ctx';
import { Btn, Card, I, IconBtn, Sheet } from '../../components/ui';
import PlanEditor from './PlanEditor';
import { startSession } from '../../lib/data';
import { WEEKDAYS } from '../../lib/date';
import type { PlanDay, WorkoutPlan } from '../../types';

const day = (name: string, weekdays: number[]): PlanDay => ({
  id: crypto.randomUUID(),
  name,
  weekdays,
  exercises: [],
});

const PRESETS: { label: string; build: () => PlanDay[] }[] = [
  { label: 'Push / Pull / Legs', build: () => [day('Push', [1]), day('Pull', [3]), day('Legs', [5])] },
  { label: 'Upper / Lower', build: () => [day('Upper', [1, 4]), day('Lower', [2, 5])] },
  { label: 'Full body x3', build: () => [day('Full body A', [1]), day('Full body B', [3]), day('Full body C', [5])] },
  { label: 'Blank plan', build: () => [day('Day 1', [])] },
];

export default function Plans() {
  const { openSession } = useApp();
  const plans = useLiveQuery(() => db.plans.toArray(), []) ?? [];
  const running = useLiveQuery(() => db.sessions.filter((x) => !x.finishedAt).first(), []);
  const exercises = useExercises();
  const [editing, setEditing] = useState<WorkoutPlan | null>(null);
  const [creating, setCreating] = useState(false);

  const exName = (id: number) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  async function create(build: () => PlanDay[], label: string) {
    const hasActive = plans.some((p) => p.active);
    const days = build();
    const id = (await db.plans.add({ name: label === 'Blank plan' ? 'My plan' : label, active: !hasActive, days })) as number;
    setCreating(false);
    setEditing((await db.plans.get(id)) ?? null);
  }

  async function setActive(id: number) {
    await db.transaction('rw', db.plans, async () => {
      for (const p of await db.plans.toArray()) await db.plans.update(p.id!, { active: p.id === id });
    });
  }

  async function remove(p: WorkoutPlan) {
    if (window.confirm(`Delete plan "${p.name}"? Logged workouts are kept.`)) await db.plans.delete(p.id!);
  }

  async function start(plan: WorkoutPlan | null, d: PlanDay | null) {
    openSession(await startSession(plan, d));
  }

  return (
    <div className="space-y-4">
      {running ? (
        <Btn className="w-full" onClick={() => openSession(running.id!)}>
          <I n="play" className="h-5 w-5" /> Resume: {running.name}
        </Btn>
      ) : (
        <Btn className="w-full" variant="soft" onClick={() => start(null, null)}>
          <I n="plus" className="h-5 w-5" /> Quick workout (no plan)
        </Btn>
      )}

      {plans.map((p) => (
        <Card key={p.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{p.name}</h3>
              {p.active && <span className="text-xs font-semibold text-accent">Active plan</span>}
            </div>
            <div className="flex">
              <IconBtn n="edit" label={`Edit ${p.name}`} onClick={() => setEditing(p)} />
              <IconBtn n="trash" label={`Delete ${p.name}`} onClick={() => remove(p)} />
            </div>
          </div>
          {p.days.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface2 p-3">
              <div className="min-w-0">
                <p className="font-semibold">{d.name}</p>
                <p className="truncate text-xs text-muted">
                  {d.weekdays.length ? [...d.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((w) => WEEKDAYS[w]).join(', ') + ' · ' : ''}
                  {d.exercises.length
                    ? d.exercises.map((e) => exName(e.exerciseId)).join(', ')
                    : 'No exercises yet'}
                </p>
              </div>
              <Btn disabled={!d.exercises.length || !!running} onClick={() => start(p, d)} className="!min-h-[44px] shrink-0">
                Start
              </Btn>
            </div>
          ))}
          {!p.active && (
            <Btn variant="ghost" className="w-full" onClick={() => setActive(p.id!)}>
              Make this the active plan
            </Btn>
          )}
        </Card>
      ))}

      <Btn variant="soft" className="w-full" onClick={() => setCreating(true)}>
        + New plan
      </Btn>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New plan">
        <p className="text-sm text-muted">Pick a starting split. You can rename days and add exercises next.</p>
        {PRESETS.map((pr) => (
          <Btn key={pr.label} variant="soft" className="w-full" onClick={() => create(pr.build, pr.label)}>
            {pr.label}
          </Btn>
        ))}
      </Sheet>

      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

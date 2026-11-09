import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useExercises, useSettings } from '../../db';
import { Btn, Card, H, IconBtn, Sheet } from '../../components/ui';
import { NewExercise } from './ExercisePicker';
import { e1rm } from '../../lib/calc';
import { toDisplay } from '../../lib/units';
import { MUSCLES } from '../../types';

export default function Library() {
  const s = useSettings();
  const exercises = useExercises();
  const doneSets = useLiveQuery(() => db.sets.filter((x) => x.done).toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const best = useMemo(() => {
    const m = new Map<number, { weight: number; reps: number; e: number }>();
    for (const x of doneSets) {
      const e = e1rm(x.weight, x.reps);
      const cur = m.get(x.exerciseId);
      if (!cur || e > cur.e) m.set(x.exerciseId, { weight: x.weight, reps: x.reps, e });
    }
    return m;
  }, [doneSets]);

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [...MUSCLES, ...new Set(filtered.map((e) => e.muscle).filter((m) => !MUSCLES.includes(m)))]
    .map((m) => ({ muscle: m, items: filtered.filter((e) => e.muscle === m) }))
    .filter((g) => g.items.length);

  async function remove(id: number, name: string) {
    const used = await db.sets.where('exerciseId').equals(id).count();
    const msg = used
      ? `Delete "${name}"? Its logged sets stay in your history but lose their name.`
      : `Delete "${name}"?`;
    if (window.confirm(msg)) await db.exercises.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises"
          className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base outline-none"
        />
        <Btn onClick={() => setAdding(true)}>Add</Btn>
      </div>

      {groups.map((g) => (
        <Card key={g.muscle} className="!p-0">
          <div className="px-4 pt-3">
            <H>{g.muscle}</H>
          </div>
          <ul className="divide-y divide-line">
            {g.items.map((e) => {
              const b = best.get(e.id!);
              return (
                <li key={e.id} className="flex min-h-[52px] items-center justify-between px-4">
                  <div>
                    <p className="font-semibold">
                      {e.name}
                      {e.custom && <span className="ml-2 text-xs font-normal text-muted">custom</span>}
                    </p>
                    {b && (
                      <p className="tnum text-xs text-muted">
                        Best: {toDisplay(b.weight, s.unit)} {s.unit} × {b.reps}
                      </p>
                    )}
                  </div>
                  {e.custom && <IconBtn n="trash" label={`Delete ${e.name}`} onClick={() => remove(e.id!, e.name)} />}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New exercise">
        <NewExercise onCreated={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}

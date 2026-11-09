import { useState } from 'react';
import { db, useExercises, useSettings } from '../../db';
import { Btn, Card, Chip, IconBtn, Sheet, Stepper, TextBox } from '../../components/ui';
import ExercisePicker from './ExercisePicker';
import { WEEKDAYS } from '../../lib/date';
import { fromDisplay, toDisplay, weightStep } from '../../lib/units';
import type { PlanDay, WorkoutPlan } from '../../types';

export default function PlanEditor({ plan: initial, onClose }: { plan: WorkoutPlan; onClose: () => void }) {
  const s = useSettings();
  const exercises = useExercises();
  const [plan, setPlan] = useState(initial);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const exName = (id: number) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  // Every change is saved immediately.
  function update(next: WorkoutPlan) {
    setPlan(next);
    void db.plans.put(next);
  }
  const patchDay = (id: string, patch: Partial<PlanDay>) =>
    update({ ...plan, days: plan.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  function addDay() {
    const day: PlanDay = { id: crypto.randomUUID(), name: `Day ${plan.days.length + 1}`, weekdays: [], exercises: [] };
    update({ ...plan, days: [...plan.days, day] });
  }

  return (
    <Sheet open onClose={onClose} title="Edit plan" tall>
      <TextBox label="Plan name" value={plan.name} onChange={(name) => update({ ...plan, name })} />

      {plan.days.map((d) => (
        <Card key={d.id} className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextBox label="Day name" value={d.name} onChange={(name) => patchDay(d.id, { name })} />
            </div>
            <IconBtn
              n="trash"
              label={`Delete ${d.name}`}
              onClick={() => {
                if (window.confirm(`Delete "${d.name}" from this plan?`))
                  update({ ...plan, days: plan.days.filter((x) => x.id !== d.id) });
              }}
              className="mb-1"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto">
            {[1, 2, 3, 4, 5, 6, 0].map((w) => (
              <Chip
                key={w}
                active={d.weekdays.includes(w)}
                onClick={() =>
                  patchDay(d.id, {
                    weekdays: d.weekdays.includes(w) ? d.weekdays.filter((x) => x !== w) : [...d.weekdays, w],
                  })
                }
              >
                {WEEKDAYS[w]}
              </Chip>
            ))}
          </div>

          {d.exercises.map((ex, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-surface2 p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{exName(ex.exerciseId)}</p>
                <IconBtn
                  n="x"
                  label="Remove exercise"
                  onClick={() => patchDay(d.id, { exercises: d.exercises.filter((_, j) => j !== i) })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted">
                <div>
                  Sets
                  <Stepper
                    value={ex.sets}
                    min={1}
                    max={20}
                    inputClass="w-8 text-lg"
                    label="Sets"
                    onChange={(v) =>
                      patchDay(d.id, { exercises: d.exercises.map((x, j) => (j === i ? { ...x, sets: v } : x)) })
                    }
                  />
                </div>
                <div>
                  Reps
                  <Stepper
                    value={ex.reps}
                    min={1}
                    max={100}
                    inputClass="w-8 text-lg"
                    label="Reps"
                    onChange={(v) =>
                      patchDay(d.id, { exercises: d.exercises.map((x, j) => (j === i ? { ...x, reps: v } : x)) })
                    }
                  />
                </div>
                <div>
                  Weight ({s.unit})
                  <Stepper
                    value={toDisplay(ex.targetWeight, s.unit)}
                    step={weightStep(s.unit)}
                    inputClass="w-10 text-lg"
                    label="Target weight"
                    onChange={(v) =>
                      patchDay(d.id, {
                        exercises: d.exercises.map((x, j) =>
                          j === i ? { ...x, targetWeight: fromDisplay(v, s.unit) } : x,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <Btn variant="soft" className="w-full" onClick={() => setPickFor(d.id)}>
            + Add exercise
          </Btn>
        </Card>
      ))}

      <Btn variant="soft" className="w-full" onClick={addDay}>
        + Add day
      </Btn>
      <Btn className="w-full" onClick={onClose}>
        Done
      </Btn>

      <ExercisePicker
        open={pickFor !== null}
        onClose={() => setPickFor(null)}
        onPick={(exerciseId) => {
          const day = plan.days.find((d) => d.id === pickFor);
          if (day)
            patchDay(day.id, { exercises: [...day.exercises, { exerciseId, sets: 3, reps: 8, targetWeight: 0 }] });
        }}
      />
    </Sheet>
  );
}

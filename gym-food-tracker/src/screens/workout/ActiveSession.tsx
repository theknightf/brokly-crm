import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useSettings } from '../../db';
import { alertDone, Btn, Card, I, IconBtn, Stepper, unlockAudio, useTick } from '../../components/ui';
import ExercisePicker from './ExercisePicker';
import { addSets, discardSession, finishSession, lastSetsFor, updateSet } from '../../lib/data';
import { fmtDuration } from '../../lib/date';
import { fromDisplay, toDisplay, weightStep } from '../../lib/units';
import type { SetLog, Unit } from '../../types';

interface Summary {
  sets: number;
  volume: number;
  prs: number;
  ms: number;
}

function ExerciseCard({
  sessionId,
  exerciseId,
  sets,
  unit,
  onToggle,
}: {
  sessionId: number;
  exerciseId: number;
  sets: SetLog[];
  unit: Unit;
  onToggle: (s: SetLog) => void;
}) {
  const ex = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId]);
  const prev = useLiveQuery(() => lastSetsFor(exerciseId, sessionId), [exerciseId, sessionId, sets.length]) ?? [];
  const hasPR = sets.some((s) => s.isPR);

  async function remove() {
    if (window.confirm(`Remove ${ex?.name ?? 'this exercise'} from the workout?`)) {
      await db.sets
        .where('sessionId')
        .equals(sessionId)
        .filter((s) => s.exerciseId === exerciseId)
        .delete();
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">{ex?.name ?? 'Exercise'}</h3>
          {hasPR && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-onaccent">
              <I n="trophy" className="h-3.5 w-3.5" /> PR
            </span>
          )}
        </div>
        <IconBtn n="trash" label="Remove exercise" onClick={remove} />
      </div>

      {sets.map((s, i) => {
        const p = prev[i] ?? prev[prev.length - 1];
        return (
          <div
            key={s.id}
            className={`rounded-xl p-2 ${s.done ? 'bg-accent/15' : 'bg-surface2'}`}
          >
            <div className="mb-1 flex items-center justify-between px-1 text-xs text-muted">
              <span className="font-semibold">Set {s.setNo}</span>
              <span className="tnum">
                {p ? `Last: ${toDisplay(p.weight, unit)} ${unit} × ${p.reps}` : 'No history'}
              </span>
              {s.isPR && <span className="font-bold text-accent">PR</span>}
            </div>
            <div className="flex items-center justify-between gap-1">
              <Stepper
                label="Weight"
                value={toDisplay(s.weight, unit)}
                step={weightStep(unit)}
                inputClass="w-[52px] text-xl"
                onChange={(v) => updateSet(s, { weight: fromDisplay(v, unit) })}
              />
              <Stepper
                label="Reps"
                value={s.reps}
                min={0}
                max={200}
                inputClass="w-9 text-xl"
                onChange={(v) => updateSet(s, { reps: v })}
              />
              <button
                aria-label={s.done ? `Undo set ${s.setNo}` : `Complete set ${s.setNo}`}
                aria-pressed={s.done}
                onClick={() => onToggle(s)}
                className={`flex h-12 w-11 shrink-0 items-center justify-center rounded-xl ${
                  s.done ? 'bg-accent text-onaccent' : 'border-2 border-line text-muted'
                }`}
              >
                <I n="check" />
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <Btn
          variant="soft"
          className="flex-1 !min-h-[44px]"
          onClick={() => addSets(sessionId, exerciseId, 1, sets[sets.length - 1]?.reps ?? 8, 0)}
        >
          + Add set
        </Btn>
        {sets.length > 1 && !sets[sets.length - 1].done && (
          <Btn
            variant="soft"
            className="!min-h-[44px]"
            onClick={() => db.sets.delete(sets[sets.length - 1].id!)}
          >
            Remove last
          </Btn>
        )}
      </div>
    </Card>
  );
}

export default function ActiveSession({ id, onClose }: { id: number; onClose: () => void }) {
  const s = useSettings();
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(id).sortBy('id'), [id]) ?? [];
  const now = useTick(1000);
  const [rest, setRest] = useState<{ end: number; total: number } | null>(null);
  const [restOver, setRestOver] = useState(false);
  const [picking, setPicking] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [empty, setEmpty] = useState(false);

  const groups = useMemo(() => {
    const order: number[] = [];
    const m = new Map<number, SetLog[]>();
    for (const x of sets) {
      if (!m.has(x.exerciseId)) {
        m.set(x.exerciseId, []);
        order.push(x.exerciseId);
      }
      m.get(x.exerciseId)!.push(x);
    }
    return order.map((eid) => ({ exerciseId: eid, sets: m.get(eid)!.sort((a, b) => a.setNo - b.setNo) }));
  }, [sets]);

  // Keep the screen awake during the workout (where supported).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      void lock?.release();
    };
  }, []);

  // Rest timer
  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => {
      if (Date.now() >= rest.end) {
        alertDone();
        setRest(null);
        setRestOver(true);
      }
    }, 250);
    return () => clearInterval(t);
  }, [rest]);
  useEffect(() => {
    if (!restOver) return;
    const t = setTimeout(() => setRestOver(false), 4000);
    return () => clearTimeout(t);
  }, [restOver]);

  function toggle(set: SetLog) {
    unlockAudio();
    void updateSet(set, { done: !set.done });
    if (!set.done && s.restSeconds > 0) {
      setRestOver(false);
      setRest({ end: Date.now() + s.restSeconds * 1000, total: s.restSeconds });
    } else if (set.done) {
      setRest(null);
    }
  }

  async function finish() {
    const result = await finishSession(id);
    if (result) setSummary(result);
    else setEmpty(true);
  }

  async function discard() {
    if (window.confirm('Discard this workout? Everything logged in it will be deleted.')) {
      await discardSession(id);
      onClose();
    }
  }

  const doneCount = sets.filter((x) => x.done).length;
  const left = rest ? Math.max(0, Math.ceil((rest.end - now) / 1000)) : 0;

  if (summary || empty) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        {summary ? (
          <>
            <h1 className="text-3xl font-extrabold">Workout saved</h1>
            <div className="grid w-full max-w-sm grid-cols-2 gap-3">
              <Card>
                <p className="tnum text-2xl font-extrabold">{summary.sets}</p>
                <p className="text-xs text-muted">sets done</p>
              </Card>
              <Card>
                <p className="tnum text-2xl font-extrabold">{fmtDuration(summary.ms)}</p>
                <p className="text-xs text-muted">duration</p>
              </Card>
              <Card>
                <p className="tnum text-2xl font-extrabold">
                  {Math.round(toDisplay(summary.volume, s.unit)).toLocaleString()}
                </p>
                <p className="text-xs text-muted">volume ({s.unit})</p>
              </Card>
              <Card>
                <p className="tnum text-2xl font-extrabold">{summary.prs}</p>
                <p className="text-xs text-muted">new PRs</p>
              </Card>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold">No sets were completed</h1>
            <p className="text-muted">Nothing was saved for this workout.</p>
          </>
        )}
        <Btn className="w-full max-w-sm" onClick={onClose}>
          Done
        </Btn>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between gap-2 border-b border-line px-2 py-2">
        <IconBtn n="left" label="Back to app (workout keeps running)" onClick={onClose} />
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-bold">{session?.name ?? 'Workout'}</p>
          <p className="tnum text-xs text-muted">
            {fmtDuration(now - (session?.startedAt ?? now))} · {doneCount}/{sets.length} sets
          </p>
        </div>
        <Btn className="!min-h-[44px]" onClick={finish}>
          Finish
        </Btn>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-32 pt-3">
        {groups.map((g) => (
          <ExerciseCard
            key={g.exerciseId}
            sessionId={id}
            exerciseId={g.exerciseId}
            sets={g.sets}
            unit={s.unit}
            onToggle={toggle}
          />
        ))}
        <Btn variant="soft" className="w-full" onClick={() => setPicking(true)}>
          + Add exercise
        </Btn>
        <Btn variant="danger" className="w-full" onClick={discard}>
          Discard workout
        </Btn>
      </div>

      {(rest || restOver) && (
        <div className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          {rest ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">Rest</p>
                  <p className="tnum text-3xl font-extrabold">{fmtDuration(left * 1000)}</p>
                </div>
                <div className="flex gap-2">
                  <Btn variant="soft" className="!min-h-[44px]" onClick={() => setRest({ ...rest, end: rest.end - 15000 })}>
                    -15s
                  </Btn>
                  <Btn variant="soft" className="!min-h-[44px]" onClick={() => setRest({ ...rest, end: rest.end + 15000 })}>
                    +15s
                  </Btn>
                  <Btn className="!min-h-[44px]" onClick={() => setRest(null)}>
                    Skip
                  </Btn>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full bg-accent transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (left / Math.max(1, rest.total)) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="py-2 text-center text-lg font-bold text-accent">Rest over. Next set!</p>
          )}
        </div>
      )}

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => void addSets(id, exerciseId, 3, 8, 0)}
      />
    </div>
  );
}

import { useState } from 'react';
import { db, useExercises } from '../../db';
import { Btn, Chip, Empty, Sheet, TextBox } from '../../components/ui';
import { MUSCLES } from '../../types';

export function NewExercise({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState(MUSCLES[0]);

  async function create() {
    const n = name.trim();
    if (!n) return;
    const id = (await db.exercises.add({ name: n, muscle, custom: true })) as number;
    setName('');
    onCreated(id);
  }

  return (
    <div className="space-y-3">
      <TextBox label="Exercise name" value={name} onChange={setName} placeholder="e.g. Cable crunch" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {MUSCLES.map((m) => (
          <Chip key={m} active={m === muscle} onClick={() => setMuscle(m)}>
            {m}
          </Chip>
        ))}
      </div>
      <Btn className="w-full" onClick={create} disabled={!name.trim()}>
        Save exercise
      </Btn>
    </div>
  );
}

export default function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseId: number) => void;
}) {
  const exercises = useExercises();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));

  const pick = (id: number) => {
    onPick(id);
    setQ('');
    setAdding(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Choose exercise" tall>
      {adding ? (
        <>
          <NewExercise onCreated={pick} />
          <Btn variant="soft" className="w-full" onClick={() => setAdding(false)}>
            Back to list
          </Btn>
        </>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search exercises"
            className="min-h-[48px] w-full rounded-xl border border-line bg-surface px-3 text-base outline-none"
          />
          <Btn variant="soft" className="w-full" onClick={() => setAdding(true)}>
            + New custom exercise
          </Btn>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => pick(e.id!)}
                  className="flex min-h-[52px] w-full items-center justify-between px-4 text-left active:bg-surface2"
                >
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-xs text-muted">{e.muscle}</span>
                </button>
              </li>
            ))}
          </ul>
          {!list.length && <Empty>No match. Add it as a custom exercise.</Empty>}
        </>
      )}
    </Sheet>
  );
}

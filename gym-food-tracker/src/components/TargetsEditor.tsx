import { db, useSettings } from '../db';
import { NumBox } from './ui';

export default function TargetsEditor() {
  const s = useSettings();
  const set = (patch: Partial<typeof s>) => void db.settings.update(1, patch);
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumBox label="Calories" unit="kcal" value={s.calories} onChange={(v) => set({ calories: v })} />
      <NumBox label="Protein" unit="g" value={s.protein} onChange={(v) => set({ protein: v })} />
      <NumBox label="Carbs" unit="g" value={s.carbs} onChange={(v) => set({ carbs: v })} />
      <NumBox label="Fat" unit="g" value={s.fat} onChange={(v) => set({ fat: v })} />
    </div>
  );
}

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useFoods, useSettings } from '../db';
import {
  Bar,
  Btn,
  Card,
  Chip,
  Empty,
  H,
  I,
  IconBtn,
  NumBox,
  Seg,
  Sheet,
  Stepper,
  TextBox,
} from '../components/ui';
import TargetsEditor from '../components/TargetsEditor';
import { sumMacros } from '../lib/calc';
import { addDays, fmtDay, todayStr } from '../lib/date';
import { logFood, logMeal } from '../lib/data';
import { MEAL_SLOTS, type Food as FoodT, type Meal, type MealSlot } from '../types';

const mac = (f: { kcal: number; protein: number; carbs: number; fat: number }) =>
  `${Math.round(f.kcal)} kcal · P ${Math.round(f.protein)} · C ${Math.round(f.carbs)} · F ${Math.round(f.fat)}`;

/* ---------------- add food sheet ---------------- */

function AddFoodSheet({
  open,
  onClose,
  date,
  slot,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  slot: MealSlot;
}) {
  const foods = useFoods();
  const meals = useLiveQuery(() => db.meals.toArray(), []) ?? [];
  const [mode, setMode] = useState<'foods' | 'meals' | 'quick'>('foods');
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const [quick, setQuick] = useState({ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0, save: false });

  const flash = (t: string) => {
    setAdded(t);
    setTimeout(() => setAdded(null), 1200);
  };

  async function addQuick() {
    const name = quick.name.trim() || 'Quick add';
    const food: FoodT = {
      name,
      serving: '1 serving',
      kcal: quick.kcal,
      protein: quick.protein,
      carbs: quick.carbs,
      fat: quick.fat,
    };
    if (quick.save) food.id = (await db.foods.add(food)) as number;
    await logFood(date, slot, food, 1);
    setQuick({ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0, save: false });
    flash(`Added ${name}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Add to ${slot.toLowerCase()}`} tall>
      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { value: 'foods', label: 'Saved foods' },
          { value: 'meals', label: 'Meals' },
          { value: 'quick', label: 'Quick add' },
        ]}
      />
      {added && <p className="text-center text-sm font-semibold text-accent">{added}</p>}

      {mode === 'foods' && (
        <>
          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search foods"
              className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 outline-none"
            />
            <div className="text-center text-xs text-muted">
              Servings
              <Stepper value={qty} step={0.5} min={0.5} max={50} inputClass="w-10 text-lg" label="Servings" onChange={setQty} />
            </div>
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {foods
              .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
              .map((f) => (
                <li key={f.id}>
                  <button
                    onClick={async () => {
                      await logFood(date, slot, f, qty);
                      flash(`Added ${qty} × ${f.name}`);
                    }}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-surface2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{f.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {f.serving} · {mac(f)}
                      </span>
                    </span>
                    <I n="plus" className="h-5 w-5 shrink-0 text-accent" />
                  </button>
                </li>
              ))}
          </ul>
          {!foods.length && <Empty>No saved foods yet. Use Quick add.</Empty>}
        </>
      )}

      {mode === 'meals' && (
        <>
          {meals.map((m) => (
            <MealRow
              key={m.id}
              meal={m}
              foods={foods}
              action="Add all"
              onAction={async () => {
                await logMeal(date, m.id!, slot);
                flash(`Added ${m.name}`);
              }}
            />
          ))}
          {!meals.length && <Empty>No meals yet. Create one in the Meals tab.</Empty>}
        </>
      )}

      {mode === 'quick' && (
        <div className="space-y-3">
          <TextBox label="Name (optional)" value={quick.name} onChange={(name) => setQuick({ ...quick, name })} placeholder="e.g. Restaurant lunch" />
          <NumBox label="Calories" unit="kcal" value={quick.kcal} onChange={(kcal) => setQuick({ ...quick, kcal })} />
          <div className="grid grid-cols-3 gap-2">
            <NumBox label="Protein" unit="g" value={quick.protein} onChange={(protein) => setQuick({ ...quick, protein })} />
            <NumBox label="Carbs" unit="g" value={quick.carbs} onChange={(carbs) => setQuick({ ...quick, carbs })} />
            <NumBox label="Fat" unit="g" value={quick.fat} onChange={(fat) => setQuick({ ...quick, fat })} />
          </div>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={quick.save}
              onChange={(e) => setQuick({ ...quick, save: e.target.checked })}
              className="h-5 w-5 accent-[rgb(var(--accent))]"
            />
            Also save to my foods
          </label>
          <Btn className="w-full" onClick={addQuick} disabled={quick.kcal <= 0 && quick.protein <= 0}>
            Add to {slot.toLowerCase()}
          </Btn>
        </div>
      )}
    </Sheet>
  );
}

function MealRow({
  meal,
  foods,
  action,
  onAction,
  onEdit,
  onDelete,
}: {
  meal: Meal;
  foods: FoodT[];
  action: string;
  onAction: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const items = meal.items.map((i) => ({ food: foods.find((f) => f.id === i.foodId), qty: i.qty }));
  const total = sumMacros(
    items.flatMap((i) =>
      i.food
        ? [{ kcal: i.food.kcal * i.qty, protein: i.food.protein * i.qty, carbs: i.food.carbs * i.qty, fat: i.food.fat * i.qty }]
        : [],
    ),
  );
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{meal.name}</p>
          <p className="text-xs text-muted">{meal.slot}</p>
        </div>
        <div className="flex">
          {onEdit && <IconBtn n="edit" label={`Edit ${meal.name}`} onClick={onEdit} />}
          {onDelete && <IconBtn n="trash" label={`Delete ${meal.name}`} onClick={onDelete} />}
        </div>
      </div>
      <p className="text-xs text-muted">
        {items.map((i) => `${i.qty !== 1 ? i.qty + ' × ' : ''}${i.food?.name ?? '(deleted food)'}`).join(', ')}
      </p>
      <p className="tnum text-xs font-semibold">{mac(total)}</p>
      <Btn className="w-full !min-h-[44px]" onClick={onAction}>
        {action}
      </Btn>
    </Card>
  );
}

/* ---------------- daily log ---------------- */

function Log() {
  const s = useSettings();
  const [date, setDate] = useState(todayStr());
  const [slot, setSlot] = useState<MealSlot | null>(null);
  const [targets, setTargets] = useState(false);
  const logs = useLiveQuery(() => db.foodLogs.where('date').equals(date).toArray(), [date]) ?? [];
  const tot = sumMacros(logs);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <IconBtn n="left" label="Previous day" onClick={() => setDate(addDays(date, -1))} />
        <button onClick={() => setDate(todayStr())} className="min-h-[44px] font-bold">
          {date === todayStr() ? 'Today' : fmtDay(date)}
        </button>
        <IconBtn n="right" label="Next day" onClick={() => setDate(addDays(date, 1))} />
      </div>

      <Card className="space-y-3">
        <H
          right={
            <button onClick={() => setTargets(true)} className="min-h-[44px] px-2 text-sm font-semibold text-accent">
              Set targets
            </button>
          }
        >
          Totals vs targets
        </H>
        <Bar label="Calories" value={tot.kcal} goal={s.calories} unit="kcal" />
        <Bar label="Protein" value={tot.protein} goal={s.protein} unit="g" />
        <Bar label="Carbs" value={tot.carbs} goal={s.carbs} unit="g" />
        <Bar label="Fat" value={tot.fat} goal={s.fat} unit="g" />
      </Card>

      {MEAL_SLOTS.map((m) => {
        const items = logs.filter((l) => l.slot === m);
        const t = sumMacros(items);
        return (
          <Card key={m} className="space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">{m}</h3>
                <p className="tnum text-xs text-muted">{Math.round(t.kcal)} kcal · P {Math.round(t.protein)} g</p>
              </div>
              <button
                aria-label={`Add food to ${m}`}
                onClick={() => setSlot(m)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-onaccent active:opacity-70"
              >
                <I n="plus" />
              </button>
            </div>
            {items.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 border-t border-line pt-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {l.qty !== 1 && <span className="text-muted">{l.qty} × </span>}
                    {l.name}
                  </p>
                  <p className="tnum text-xs text-muted">{mac(l)}</p>
                </div>
                <IconBtn
                  n="trash"
                  label={`Delete ${l.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${l.name}" from ${m.toLowerCase()}?`)) void db.foodLogs.delete(l.id!);
                  }}
                />
              </div>
            ))}
          </Card>
        );
      })}

      <AddFoodSheet open={slot !== null} onClose={() => setSlot(null)} date={date} slot={slot ?? 'Breakfast'} />
      <Sheet open={targets} onClose={() => setTargets(false)} title="Daily targets">
        <TargetsEditor />
        <Btn className="w-full" onClick={() => setTargets(false)}>
          Done
        </Btn>
      </Sheet>
    </div>
  );
}

/* ---------------- saved foods ---------------- */

const EMPTY_FOOD: Omit<FoodT, 'id'> = { name: '', serving: '100 g', kcal: 0, protein: 0, carbs: 0, fat: 0 };

function Foods() {
  const foods = useFoods();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<FoodT | null>(null);

  async function save() {
    if (!edit || !edit.name.trim()) return;
    await db.foods.put({ ...edit, name: edit.name.trim() });
    setEdit(null);
  }

  async function remove(f: FoodT) {
    if (window.confirm(`Delete "${f.name}"? Meals using it will skip it. Past logs stay.`)) {
      await db.foods.delete(f.id!);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods"
          className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 outline-none"
        />
        <Btn onClick={() => setEdit({ ...EMPTY_FOOD })}>Add</Btn>
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {foods
          .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
          .map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 pl-4">
              <button onClick={() => setEdit(f)} className="min-h-[56px] min-w-0 flex-1 py-2 text-left">
                <span className="block truncate font-semibold">{f.name}</span>
                <span className="block truncate text-xs text-muted">
                  {f.serving} · {mac(f)}
                </span>
              </button>
              <IconBtn n="trash" label={`Delete ${f.name}`} onClick={() => remove(f)} />
            </li>
          ))}
      </ul>
      {!foods.length && <Empty>No saved foods yet.</Empty>}

      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit food' : 'New food'}>
        {edit && (
          <>
            <TextBox label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} />
            <TextBox label="Serving size" value={edit.serving} onChange={(serving) => setEdit({ ...edit, serving })} placeholder="e.g. 100 g, 1 cup" />
            <NumBox label="Calories per serving" unit="kcal" value={edit.kcal} onChange={(kcal) => setEdit({ ...edit, kcal })} />
            <div className="grid grid-cols-3 gap-2">
              <NumBox label="Protein" unit="g" value={edit.protein} onChange={(protein) => setEdit({ ...edit, protein })} />
              <NumBox label="Carbs" unit="g" value={edit.carbs} onChange={(carbs) => setEdit({ ...edit, carbs })} />
              <NumBox label="Fat" unit="g" value={edit.fat} onChange={(fat) => setEdit({ ...edit, fat })} />
            </div>
            <Btn className="w-full" onClick={save} disabled={!edit.name.trim()}>
              Save
            </Btn>
          </>
        )}
      </Sheet>
    </div>
  );
}

/* ---------------- meals ---------------- */

function Meals() {
  const foods = useFoods();
  const meals = useLiveQuery(() => db.meals.toArray(), []) ?? [];
  const [edit, setEdit] = useState<Meal | null>(null);
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function save() {
    if (!edit || !edit.name.trim() || !edit.items.length) return;
    await db.meals.put({ ...edit, name: edit.name.trim() });
    setEdit(null);
  }

  return (
    <div className="space-y-4">
      <Btn className="w-full" onClick={() => setEdit({ name: '', slot: 'Breakfast', items: [] })}>
        + New meal
      </Btn>
      {done && <p className="text-center text-sm font-semibold text-accent">{done}</p>}
      {meals.map((m) => (
        <MealRow
          key={m.id}
          meal={m}
          foods={foods}
          action="Add to today"
          onAction={async () => {
            await logMeal(todayStr(), m.id!);
            setDone(`Added ${m.name} to today's ${m.slot.toLowerCase()}`);
            setTimeout(() => setDone(null), 2000);
          }}
          onEdit={() => setEdit(m)}
          onDelete={() => {
            if (window.confirm(`Delete meal "${m.name}"?`)) void db.meals.delete(m.id!);
          }}
        />
      ))}
      {!meals.length && <Empty>Meals are reusable combos of foods. Create one to add it in a single tap.</Empty>}

      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit meal' : 'New meal'} tall>
        {edit && (
          <>
            <TextBox label="Meal name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} />
            <div className="flex gap-2 overflow-x-auto">
              {MEAL_SLOTS.map((m) => (
                <Chip key={m} active={edit.slot === m} onClick={() => setEdit({ ...edit, slot: m })}>
                  {m}
                </Chip>
              ))}
            </div>
            {edit.items.map((it, i) => {
              const f = foods.find((x) => x.id === it.foodId);
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-surface2 p-2 pl-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{f?.name ?? '(deleted food)'}</p>
                    <p className="text-xs text-muted">{f?.serving}</p>
                  </div>
                  <div className="flex items-center">
                    <Stepper
                      value={it.qty}
                      step={0.5}
                      min={0.5}
                      inputClass="w-9 text-lg"
                      label="Servings"
                      onChange={(qty) =>
                        setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, qty } : x)) })
                      }
                    />
                    <IconBtn
                      n="x"
                      label="Remove food"
                      onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}
                    />
                  </div>
                </div>
              );
            })}
            <Btn variant="soft" className="w-full" onClick={() => setAdding(true)}>
              + Add food
            </Btn>
            <Btn className="w-full" onClick={save} disabled={!edit.name.trim() || !edit.items.length}>
              Save meal
            </Btn>

            <Sheet open={adding} onClose={() => setAdding(false)} title="Add food to meal" tall>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {foods.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => {
                        setEdit({ ...edit, items: [...edit.items, { foodId: f.id!, qty: 1 }] });
                        setAdding(false);
                      }}
                      className="flex min-h-[52px] w-full items-center justify-between px-4 text-left active:bg-surface2"
                    >
                      <span className="font-semibold">{f.name}</span>
                      <span className="text-xs text-muted">{f.serving}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Sheet>
          </>
        )}
      </Sheet>
    </div>
  );
}

/* ---------------- screen ---------------- */

export default function Food() {
  const [view, setView] = useState<'log' | 'foods' | 'meals'>('log');
  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Food</h1>
      <Seg
        value={view}
        onChange={setView}
        options={[
          { value: 'log', label: 'Daily log' },
          { value: 'foods', label: 'Foods' },
          { value: 'meals', label: 'Meals' },
        ]}
      />
      {view === 'log' && <Log />}
      {view === 'foods' && <Foods />}
      {view === 'meals' && <Meals />}
    </div>
  );
}

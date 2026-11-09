import { db } from '../db';
import { e1rm } from './calc';
import { todayStr } from './date';
import type { BodyMetric, Food, MealSlot, PlanDay, SetLog, WorkoutPlan } from '../types';

/* ---------- workouts ---------- */

/** The sets of the most recent finished-or-running other session for this exercise. */
export async function lastSetsFor(exerciseId: number, excludeSessionId: number): Promise<SetLog[]> {
  const all = await db.sets
    .where('exerciseId')
    .equals(exerciseId)
    .filter((s) => s.done && s.sessionId !== excludeSessionId)
    .toArray();
  if (!all.length) return [];
  const last = Math.max(...all.map((s) => s.sessionId));
  return all.filter((s) => s.sessionId === last).sort((a, b) => a.setNo - b.setNo);
}

export async function addSets(
  sessionId: number,
  exerciseId: number,
  count: number,
  reps: number,
  weightKg: number,
): Promise<void> {
  const prev = await lastSetsFor(exerciseId, sessionId);
  const existing = await db.sets
    .where('sessionId')
    .equals(sessionId)
    .filter((s) => s.exerciseId === exerciseId)
    .toArray();
  const last = existing.sort((a, b) => a.setNo - b.setNo)[existing.length - 1];
  const rows: SetLog[] = [];
  for (let i = 0; i < count; i++) {
    const n = existing.length + i;
    const p = prev[n] ?? prev[prev.length - 1];
    rows.push({
      sessionId,
      exerciseId,
      setNo: n + 1,
      weight: last ? last.weight : weightKg || p?.weight || 0,
      reps: last ? last.reps : reps,
      done: false,
      isPR: false,
    });
  }
  await db.sets.bulkAdd(rows);
}

export async function startSession(plan: WorkoutPlan | null, day: PlanDay | null): Promise<number> {
  const id = (await db.sessions.add({
    planId: plan?.id,
    dayId: day?.id,
    name: day ? day.name : 'Quick workout',
    date: todayStr(),
    startedAt: Date.now(),
  })) as number;
  if (day) {
    for (const ex of day.exercises) await addSets(id, ex.exerciseId, ex.sets, ex.reps, ex.targetWeight);
  }
  return id;
}

/** A set is a PR when it is the session's best estimated 1RM and beats everything from earlier sessions. */
export async function recomputePRs(sessionId: number, exerciseId: number): Promise<void> {
  const all = await db.sets.where('exerciseId').equals(exerciseId).filter((s) => s.done).toArray();
  const prior = Math.max(
    0,
    ...all.filter((s) => s.sessionId !== sessionId).map((s) => e1rm(s.weight, s.reps)),
  );
  const mine = all.filter((s) => s.sessionId === sessionId);
  const best = Math.max(0, ...mine.map((s) => e1rm(s.weight, s.reps)));
  const mineAll = await db.sets
    .where('sessionId')
    .equals(sessionId)
    .filter((s) => s.exerciseId === exerciseId)
    .toArray();
  for (const s of mineAll) {
    const isPR = s.done && prior > 0 && best > prior && e1rm(s.weight, s.reps) === best;
    if (isPR !== s.isPR) await db.sets.update(s.id!, { isPR });
  }
}

export async function updateSet(set: SetLog, patch: Partial<SetLog>): Promise<void> {
  await db.sets.update(set.id!, patch);
  await recomputePRs(set.sessionId, set.exerciseId);
}

export async function discardSession(id: number): Promise<void> {
  await db.sets.where('sessionId').equals(id).delete();
  await db.sessions.delete(id);
}

export async function finishSession(id: number) {
  await db.sets
    .where('sessionId')
    .equals(id)
    .filter((s) => !s.done)
    .delete();
  const sets = await db.sets.where('sessionId').equals(id).toArray();
  const session = await db.sessions.get(id);
  if (!sets.length) {
    await db.sessions.delete(id);
    return null;
  }
  await db.sessions.update(id, { finishedAt: Date.now() });
  return {
    sets: sets.length,
    volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
    prs: sets.filter((s) => s.isPR).length,
    ms: Date.now() - (session?.startedAt ?? Date.now()),
  };
}

/* ---------- body metrics / water ---------- */

export async function upsertMetric(date: string, patch: Partial<BodyMetric>): Promise<void> {
  const existing = await db.metrics.where('date').equals(date).first();
  if (existing) await db.metrics.update(existing.id!, patch);
  else await db.metrics.add({ date, ...patch });
}

export async function setWater(date: string, glasses: number): Promise<void> {
  await db.days.put({ date, water: Math.max(0, glasses) });
}

/* ---------- food ---------- */

export async function logFood(date: string, slot: MealSlot, food: Food, qty: number): Promise<void> {
  const r = (n: number) => Math.round(n * qty * 10) / 10;
  await db.foodLogs.add({
    date,
    slot,
    name: food.name,
    qty,
    kcal: Math.round(food.kcal * qty),
    protein: r(food.protein),
    carbs: r(food.carbs),
    fat: r(food.fat),
    foodId: food.id,
  });
}

export async function logMeal(date: string, mealId: number, slotOverride?: MealSlot): Promise<void> {
  const meal = await db.meals.get(mealId);
  if (!meal) return;
  for (const item of meal.items) {
    const food = await db.foods.get(item.foodId);
    if (food) await logFood(date, slotOverride ?? meal.slot, food, item.qty);
  }
}

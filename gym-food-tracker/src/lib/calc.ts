import type { FoodLog } from '../types';

/** Epley estimated one-rep max */
export const e1rm = (weight: number, reps: number) => (reps <= 1 ? weight * Math.max(reps, 0) : weight * (1 + reps / 30));

export const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const sumMacros = (items: Pick<FoodLog, 'kcal' | 'protein' | 'carbs' | 'fat'>[]): Macros =>
  items.reduce(
    (a, i) => ({
      kcal: a.kcal + i.kcal,
      protein: a.protein + i.protein,
      carbs: a.carbs + i.carbs,
      fat: a.fat + i.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

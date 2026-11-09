import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  BodyMetric,
  DayLog,
  Exercise,
  Food,
  FoodLog,
  Meal,
  SetLog,
  Settings,
  WorkoutPlan,
  WorkoutSession,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  unit: 'kg',
  calories: 2500,
  protein: 150,
  carbs: 280,
  fat: 70,
  waterGoal: 8,
  restSeconds: 90,
};

export class AppDB extends Dexie {
  exercises!: Table<Exercise, number>;
  plans!: Table<WorkoutPlan, number>;
  sessions!: Table<WorkoutSession, number>;
  sets!: Table<SetLog, number>;
  foods!: Table<Food, number>;
  meals!: Table<Meal, number>;
  foodLogs!: Table<FoodLog, number>;
  metrics!: Table<BodyMetric, number>;
  days!: Table<DayLog, string>;
  settings!: Table<Settings, number>;

  constructor() {
    super('gym-food-tracker');
    this.version(1).stores({
      exercises: '++id, name',
      plans: '++id',
      sessions: '++id, date',
      sets: '++id, sessionId, exerciseId',
      foods: '++id, name',
      meals: '++id',
      foodLogs: '++id, date',
      metrics: '++id, date',
      days: 'date',
      settings: 'id',
    });
  }
}

export const db = new AppDB();

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get(1));
  return s ?? DEFAULT_SETTINGS;
}

export function useExercises(): Exercise[] {
  return useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? [];
}

export function useFoods(): Food[] {
  return useLiveQuery(() => db.foods.orderBy('name').toArray(), []) ?? [];
}

export type Unit = 'kg' | 'lb';
export type MealSlot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
export const MEAL_SLOTS: MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
export const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Glutes', 'Core', 'Other'];

export interface Exercise {
  id?: number;
  name: string;
  muscle: string;
  custom: boolean;
}

/** targetWeight is stored in kg */
export interface PlanExercise {
  exerciseId: number;
  sets: number;
  reps: number;
  targetWeight: number;
}

/** weekdays use JS numbering: 0 = Sunday ... 6 = Saturday */
export interface PlanDay {
  id: string;
  name: string;
  weekdays: number[];
  exercises: PlanExercise[];
}

export interface WorkoutPlan {
  id?: number;
  name: string;
  active: boolean;
  days: PlanDay[];
}

export interface WorkoutSession {
  id?: number;
  planId?: number;
  dayId?: string;
  name: string;
  date: string; // YYYY-MM-DD (local)
  startedAt: number;
  finishedAt?: number;
}

/** weight is stored in kg */
export interface SetLog {
  id?: number;
  sessionId: number;
  exerciseId: number;
  setNo: number;
  weight: number;
  reps: number;
  done: boolean;
  isPR: boolean;
}

/** Macros are per one serving */
export interface Food {
  id?: number;
  name: string;
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealItem {
  foodId: number;
  qty: number;
}

export interface Meal {
  id?: number;
  name: string;
  slot: MealSlot;
  items: MealItem[];
}

/** Macros are the totals for the entry (already multiplied by qty) */
export interface FoodLog {
  id?: number;
  date: string;
  slot: MealSlot;
  name: string;
  qty: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  foodId?: number;
}

/** weight in kg, circumferences in cm */
export interface BodyMetric {
  id?: number;
  date: string;
  weight?: number;
  waist?: number;
  chest?: number;
  arm?: number;
}

export interface DayLog {
  date: string;
  water: number;
}

export interface Settings {
  id: 1;
  unit: Unit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterGoal: number;
  restSeconds: number;
  lastBackup?: number;
}

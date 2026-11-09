import { db, DEFAULT_SETTINGS } from './db';
import type { Food, Meal, PlanDay } from './types';

const EXERCISES: [string, string][] = [
  ['Back squat', 'Legs'],
  ['Front squat', 'Legs'],
  ['Leg press', 'Legs'],
  ['Romanian deadlift', 'Legs'],
  ['Walking lunge', 'Legs'],
  ['Leg curl', 'Legs'],
  ['Leg extension', 'Legs'],
  ['Calf raise', 'Legs'],
  ['Hip thrust', 'Glutes'],
  ['Deadlift', 'Back'],
  ['Barbell row', 'Back'],
  ['Pull-up', 'Back'],
  ['Lat pulldown', 'Back'],
  ['Seated cable row', 'Back'],
  ['Dumbbell row', 'Back'],
  ['Bench press', 'Chest'],
  ['Incline dumbbell press', 'Chest'],
  ['Chest fly', 'Chest'],
  ['Push-up', 'Chest'],
  ['Dip', 'Chest'],
  ['Overhead press', 'Shoulders'],
  ['Lateral raise', 'Shoulders'],
  ['Face pull', 'Shoulders'],
  ['Barbell curl', 'Arms'],
  ['Dumbbell curl', 'Arms'],
  ['Triceps pushdown', 'Arms'],
  ['Skull crusher', 'Arms'],
  ['Plank', 'Core'],
  ['Hanging leg raise', 'Core'],
];

// Approximate values per serving (rounded). Edit them to match your own labels.
const FOODS: Omit<Food, 'id'>[] = [
  { name: 'Chicken breast, cooked', serving: '100 g', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: 'White rice, cooked', serving: '100 g', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { name: 'Egg', serving: '1 large', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
  { name: 'Oats, dry', serving: '40 g', kcal: 150, protein: 5, carbs: 27, fat: 2.6 },
  { name: 'Banana', serving: '1 medium', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: 'Whole milk', serving: '250 ml', kcal: 150, protein: 8, carbs: 12, fat: 8 },
  { name: 'Greek yogurt, plain', serving: '170 g', kcal: 100, protein: 17, carbs: 6, fat: 0.7 },
  { name: 'Whey protein', serving: '1 scoop (30 g)', kcal: 120, protein: 24, carbs: 3, fat: 1.5 },
  { name: 'Peanut butter', serving: '1 tbsp', kcal: 95, protein: 4, carbs: 3, fat: 8 },
  { name: 'Olive oil', serving: '1 tbsp', kcal: 119, protein: 0, carbs: 0, fat: 13.5 },
  { name: 'Bread, whole wheat', serving: '1 slice', kcal: 80, protein: 4, carbs: 14, fat: 1 },
  { name: 'Tuna, canned', serving: '1 can (100 g)', kcal: 120, protein: 26, carbs: 0, fat: 1 },
  { name: 'Salmon, cooked', serving: '100 g', kcal: 208, protein: 20, carbs: 0, fat: 13 },
  { name: 'Ground beef 90% lean', serving: '100 g', kcal: 176, protein: 20, carbs: 0, fat: 10 },
  { name: 'Potato, boiled', serving: '150 g', kcal: 130, protein: 3, carbs: 30, fat: 0.2 },
  { name: 'Pasta, cooked', serving: '100 g', kcal: 158, protein: 5.8, carbs: 31, fat: 0.9 },
  { name: 'Apple', serving: '1 medium', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { name: 'Broccoli', serving: '100 g', kcal: 34, protein: 2.8, carbs: 7, fat: 0.4 },
  { name: 'Almonds', serving: '28 g', kcal: 164, protein: 6, carbs: 6, fat: 14 },
  { name: 'Cheddar cheese', serving: '30 g', kcal: 120, protein: 7, carbs: 0.4, fat: 10 },
  { name: 'Avocado', serving: '1/2 fruit', kcal: 120, protein: 1.5, carbs: 6, fat: 11 },
  { name: 'Lentils, cooked', serving: '100 g', kcal: 116, protein: 9, carbs: 20, fat: 0.4 },
];

export async function seed(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS });

    const exId = new Map<string, number>();
    for (const [name, muscle] of EXERCISES) {
      exId.set(name, (await db.exercises.add({ name, muscle, custom: false })) as number);
    }

    const foodId = new Map<string, number>();
    for (const f of FOODS) foodId.set(f.name, (await db.foods.add(f)) as number);

    const meals: Omit<Meal, 'id'>[] = [
      {
        name: 'Oats, banana and milk',
        slot: 'Breakfast',
        items: [
          { foodId: foodId.get('Oats, dry')!, qty: 1 },
          { foodId: foodId.get('Banana')!, qty: 1 },
          { foodId: foodId.get('Whole milk')!, qty: 1 },
        ],
      },
      {
        name: 'Chicken, rice and broccoli',
        slot: 'Lunch',
        items: [
          { foodId: foodId.get('Chicken breast, cooked')!, qty: 1.5 },
          { foodId: foodId.get('White rice, cooked')!, qty: 2 },
          { foodId: foodId.get('Broccoli')!, qty: 1 },
        ],
      },
    ];
    await db.meals.bulkAdd(meals);

    const ex = (name: string, sets: number, reps: number, kg: number) => ({
      exerciseId: exId.get(name)!,
      sets,
      reps,
      targetWeight: kg,
    });
    const days: PlanDay[] = [
      {
        id: 'd1',
        name: 'Full body A',
        weekdays: [1],
        exercises: [
          ex('Back squat', 3, 5, 40),
          ex('Bench press', 3, 5, 30),
          ex('Barbell row', 3, 8, 30),
          ex('Overhead press', 2, 8, 20),
          ex('Plank', 2, 1, 0),
        ],
      },
      {
        id: 'd2',
        name: 'Full body B',
        weekdays: [3],
        exercises: [
          ex('Deadlift', 3, 5, 50),
          ex('Incline dumbbell press', 3, 8, 12),
          ex('Lat pulldown', 3, 10, 35),
          ex('Walking lunge', 2, 10, 10),
          ex('Dumbbell curl', 2, 12, 8),
        ],
      },
      {
        id: 'd3',
        name: 'Full body C',
        weekdays: [5],
        exercises: [
          ex('Leg press', 3, 10, 80),
          ex('Push-up', 3, 10, 0),
          ex('Seated cable row', 3, 10, 35),
          ex('Lateral raise', 3, 12, 6),
          ex('Triceps pushdown', 2, 12, 20),
        ],
      },
    ];
    await db.plans.add({ name: '3-day full body', active: true, days });
  });
}

export async function initDb(): Promise<void> {
  if ((await db.settings.count()) === 0) await seed();
}

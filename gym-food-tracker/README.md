# Gym & Food Tracker

Offline-first PWA for logging workouts, meals and body weight. All data is stored on the device in IndexedDB (Dexie). No account, no backend.

Stack: React + TypeScript + Vite + Tailwind, `vite-plugin-pwa`, Dexie, Recharts.

## Run

```bash
npm install
npm run dev        # generates icons, then starts Vite (reachable on your LAN)
npm run build      # production build + service worker
npm run preview    # serve the build, then install it from the browser menu
npm run typecheck
```

The service worker only runs in the production build (`build` + `preview`), so test installability and offline mode there. Deploy `dist/` to any HTTPS static host (Netlify, Vercel, GitHub Pages at the domain root). PWAs need HTTPS except on `localhost`.

## Structure

```
src/
  types.ts            data models (Exercise, WorkoutPlan, WorkoutSession, SetLog, Food, Meal, FoodLog, BodyMetric, Settings)
  db.ts               Dexie schema and settings hooks
  seed.ts             first-run sample plan, exercises, foods, meals
  lib/                calc (1RM, macros), data (workout/food operations, PR detection), units, date, backup
  components/         shared UI (steppers, sheets, rings) and the targets editor
  screens/            Today, Workout (+ workout/), Food, Progress, Settings
scripts/gen-icons.mjs dependency-free PNG icon generator (runs before dev/build)
```

## Notes

- Weights are stored in kg and body measurements in cm; the kg/lb setting only changes display.
- A set is flagged as a PR when its estimated 1RM (Epley) beats every earlier session for that exercise. The first time you do an exercise has nothing to beat, so it is not flagged.
- Seed food macros are approximate; edit them to match your labels.

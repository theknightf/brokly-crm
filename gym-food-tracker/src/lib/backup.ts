import { db, DEFAULT_SETTINGS } from '../db';
import { seed } from '../seed';
import { todayStr } from './date';

export async function exportData(): Promise<void> {
  const data: Record<string, unknown[]> = {};
  for (const t of db.tables) data[t.name] = await t.toArray();
  const payload = { app: 'gym-food-tracker', version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-food-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  await db.settings.update(1, { lastBackup: Date.now() });
}

export async function importData(file: File): Promise<void> {
  const json = JSON.parse(await file.text());
  if (json?.app !== 'gym-food-tracker' || typeof json.data !== 'object' || !json.data) {
    throw new Error('This is not a Gym & Food Tracker backup file.');
  }
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear();
      const rows = json.data[t.name];
      if (Array.isArray(rows) && rows.length) await t.bulkPut(rows);
    }
  });
  if ((await db.settings.count()) === 0) await db.settings.put({ ...DEFAULT_SETTINGS });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await seed();
}

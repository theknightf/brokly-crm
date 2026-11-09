import { useEffect, useRef, useState } from 'react';
import { db, useSettings } from '../db';
import { Btn, Card, H, NumBox, Seg } from '../components/ui';
import TargetsEditor from '../components/TargetsEditor';
import { exportData, importData, resetAll } from '../lib/backup';
import { fmtDay, dateStr } from '../lib/date';
import type { Unit } from '../types';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

export default function SettingsScreen() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const set = (patch: Partial<typeof s>) => void db.settings.update(1, patch);
  const note = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 3500);
  };

  const daysSince = s.lastBackup ? Math.floor((Date.now() - s.lastBackup) / 86400000) : null;
  const stale = daysSince === null || daysSince >= 7;

  async function onImport(file: File | undefined) {
    if (!file) return;
    if (!window.confirm('Importing replaces ALL data on this device with the backup. Continue?')) return;
    try {
      await importData(file);
      note('Backup imported.');
    } catch (e) {
      note(e instanceof Error ? e.message : 'Could not read that file.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
      {msg && <p className="rounded-xl bg-accent/15 p-3 text-center text-sm font-semibold text-accent">{msg}</p>}

      <Card className={stale ? 'border-accent' : ''}>
        <H>Backup</H>
        <p className="mb-3 text-sm text-muted">
          Your data lives only on this device. If you clear browser data or lose the phone, it is gone. Export a
          backup regularly and keep the file somewhere safe.
        </p>
        <p className="mb-3 text-sm font-semibold">
          {s.lastBackup
            ? `Last backup: ${fmtDay(dateStr(new Date(s.lastBackup)))} (${daysSince === 0 ? 'today' : `${daysSince} days ago`})`
            : 'You have never exported a backup.'}
        </p>
        <div className="space-y-2">
          <Btn className="w-full" onClick={async () => { await exportData(); note('Backup file downloaded.'); }}>
            Export data (JSON)
          </Btn>
          <Btn variant="soft" className="w-full" onClick={() => fileRef.current?.click()}>
            Import backup
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <H>Units</H>
        <Seg<Unit>
          value={s.unit}
          onChange={(unit) => set({ unit })}
          options={[
            { value: 'kg', label: 'Kilograms (kg)' },
            { value: 'lb', label: 'Pounds (lb)' },
          ]}
        />
        <p className="text-xs text-muted">Existing data is converted for display. Nothing is lost when you switch.</p>
      </Card>

      <Card className="space-y-3">
        <H>Daily targets</H>
        <TargetsEditor />
        <div className="grid grid-cols-2 gap-3">
          <NumBox label="Water goal" unit="glasses" value={s.waterGoal} onChange={(waterGoal) => set({ waterGoal })} />
          <NumBox label="Rest timer" unit="sec" value={s.restSeconds} onChange={(restSeconds) => set({ restSeconds })} />
        </div>
        <p className="text-xs text-muted">Set the rest timer to 0 to turn it off. Vibration is not supported on iPhone.</p>
      </Card>

      <Card className="space-y-2">
        <H>Install</H>
        {install ? (
          <Btn className="w-full" onClick={() => install.prompt()}>
            Install app
          </Btn>
        ) : (
          <p className="text-sm text-muted">
            Android/Chrome: menu → Install app. iPhone/Safari: Share → Add to Home Screen. After installing it works
            fully offline.
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <H>Danger zone</H>
        <Btn
          variant="danger"
          className="w-full"
          onClick={async () => {
            if (window.confirm('Reset ALL data? This deletes every workout, meal and measurement and restores the sample plan. This cannot be undone.')) {
              await resetAll();
              note('All data was reset.');
            }
          }}
        >
          Reset all data
        </Btn>
      </Card>
    </div>
  );
}

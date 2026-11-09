import { useMemo, useState } from 'react';
import { Ctx, type Tab } from './ctx';
import { I } from './components/ui';
import Today from './screens/Today';
import Workout from './screens/Workout';
import Food from './screens/Food';
import Progress from './screens/Progress';
import SettingsScreen from './screens/Settings';
import ActiveSession from './screens/workout/ActiveSession';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'workout', label: 'Workout' },
  { id: 'food', label: 'Food' },
  { id: 'progress', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const ctx = useMemo(() => ({ go: setTab, openSession: setSessionId }), []);

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex h-full flex-col">
        <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
          {tab === 'today' && <Today />}
          {tab === 'workout' && <Workout />}
          {tab === 'food' && <Food />}
          {tab === 'progress' && <Progress />}
          {tab === 'settings' && <SettingsScreen />}
        </main>
        <nav
          className="grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
          aria-label="Main"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                tab === t.id ? 'text-accent' : 'text-muted'
              }`}
            >
              <I n={t.id} className="h-6 w-6" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {sessionId !== null && <ActiveSession id={sessionId} onClose={() => setSessionId(null)} />}
    </Ctx.Provider>
  );
}

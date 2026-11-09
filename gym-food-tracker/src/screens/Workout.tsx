import { useState } from 'react';
import { Seg } from '../components/ui';
import Plans from './workout/Plans';
import Library from './workout/Library';

export default function Workout() {
  const [view, setView] = useState<'plans' | 'library'>('plans');
  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Workout</h1>
      <Seg
        value={view}
        onChange={setView}
        options={[
          { value: 'plans', label: 'Plans' },
          { value: 'library', label: 'Exercise library' },
        ]}
      />
      {view === 'plans' ? <Plans /> : <Library />}
    </div>
  );
}

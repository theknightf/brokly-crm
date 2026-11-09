import { createContext, useContext } from 'react';

export type Tab = 'today' | 'workout' | 'food' | 'progress' | 'settings';

export interface AppCtx {
  go: (tab: Tab) => void;
  openSession: (id: number) => void;
}

export const Ctx = createContext<AppCtx>({ go: () => {}, openSession: () => {} });
export const useApp = () => useContext(Ctx);

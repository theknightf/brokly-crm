'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DUPLICATES_CHANGED_EVENT } from '@/app/duplicates/duplicateFields';

/**
 * Number of pending duplicate attempts the signed-in user may review
 * (their own leads; everything for owner / admin / manager).
 *
 * One shared request for the whole tab (Sidebar and the mobile bottom bar used to poll separately),
 * refreshed every 5 minutes while the tab is visible, when it regains focus, and when the Duplicates
 * page resolves one. Each check costs a sign-in check plus a counted query on the server.
 */
const REFRESH_MS = 5 * 60_000;

let shared = 0;
let inFlight: Promise<void> | null = null;
let lastLoad = 0;
const listeners = new Set<(n: number) => void>();

async function loadShared(force = false) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!force && Date.now() - lastLoad < 30_000) return; // focus + mount bursts
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/duplicates/count', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      shared = Number(j.count || 0);
      lastLoad = Date.now();
      listeners.forEach((fn) => fn(shared));
    } catch {
      // badge is best-effort
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function usePendingDuplicates(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(shared);

  useEffect(() => {
    if (!user?.id) return;
    listeners.add(setCount);
    void loadShared();
    const timer = window.setInterval(() => void loadShared(true), REFRESH_MS);
    const onFocus = () => void loadShared();
    const onChanged = () => void loadShared(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener(DUPLICATES_CHANGED_EVENT, onChanged);
    return () => {
      listeners.delete(setCount);
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(DUPLICATES_CHANGED_EVENT, onChanged);
    };
  }, [user?.id]);

  return count;
}

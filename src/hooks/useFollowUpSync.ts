'use client';
import { useCallback, useEffect, useRef } from 'react';
import { subscribeToFollowUps } from '@/lib/followUpEvents';

/**
 * Keeps a dashboard follow-up surface in sync with scheduling.
 * Refetches when:
 *   1. any followUpsService mutation emits (create/update/delete/status),
 *   2. the window regains focus (tab switch / PWA resume),
 *   3. the document becomes visible again (home-button resume on Android).
 *
 * Usage: useFollowUpSync(load) where load() re-runs the widget's fetch.
 */
export function useFollowUpSync(refetch: () => void): void {
  // Keep the latest refetch in a ref so the mount-time subscription
  // never goes stale when the callback captures new state (e.g. filters).
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  }, [refetch]);
  const stable = useCallback(() => ref.current(), []);
  useEffect(() => {
    const unsub = subscribeToFollowUps(stable);
    const onFocus = () => ref.current();
    const onVis = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [stable]);
}

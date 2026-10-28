'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DUPLICATES_CHANGED_EVENT } from '@/app/duplicates/duplicateFields';

/**
 * Number of pending duplicate attempts the signed-in user may review
 * (their own leads; everything for owner / admin / manager). Refreshes every
 * minute, when the tab regains focus, and when the Duplicates page resolves one.
 */
export function usePendingDuplicates(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/duplicates/count', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      setCount(Number(j.count || 0));
    } catch {
      // badge is best-effort
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    window.addEventListener(DUPLICATES_CHANGED_EVENT, onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(DUPLICATES_CHANGED_EVENT, onFocus);
    };
  }, [load]);

  return count;
}

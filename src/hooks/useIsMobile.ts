'use client';
import { useEffect, useState } from 'react';

/**
 * True below 640px: the same breakpoint as Tailwind's `sm:`, which the rest of the app uses to switch to the
 * phone layout. `null` until the browser has been measured, so callers can show a neutral skeleton instead of
 * flashing the wrong layout.
 */
export function useIsMobile(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return mobile;
}

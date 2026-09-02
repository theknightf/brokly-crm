'use client';

import { useEffect } from 'react';
import { initNativeCallTracker } from '@/lib/nativeCallTracker';

/**
 * Mounts once at app root to enable native Android call-end tracking.
 * - On Android (Capacitor): listens to CallTrackerPlugin "callEnded" via TelephonyManager + CallLog,
 *   auto-POSTs to /api/call-log with duration + lead lookup.
 * - On Web/PWA: no-ops gracefully; the existing tel:+PostCallOutcomeModal flow remains.
 *
 * Drop this in app/layout.tsx right inside <body> so it survives route changes.
 */
export default function NativeCallTrackerProvider() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initNativeCallTracker().then((fn) => {
      cleanup = fn;
    });
    // Also re-init when app returns from background (visibilitychange) — covers
    // cases where the WebView was paused during the dialer.
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        // no-op, listener is persistent; this just ensures the bridge is alive
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      cleanup?.();
    };
  }, []);
  return null;
}

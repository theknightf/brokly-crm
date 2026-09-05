'use client';

// ─── Staged geolocation with graceful fallback ─────────────────────────────
// Stage 1: high accuracy (GPS) with an 8s hard timeout.
// Stage 2: low accuracy (network) with an 8s hard timeout.
// Stage 3: give up — return null + a human reason so the caller can proceed
//          without GPS (location_verified: false) instead of hanging forever.
//
// The manual setTimeout race matters: on some browsers / insecure contexts /
// devices without GPS, getCurrentPosition may NEVER settle (neither success
// nor error), which used to leave the check-in button spinning forever.

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** 'gps' | 'network' — which stage produced the fix. */
  via: 'gps' | 'network';
}

export interface GeoOutcome {
  fix: GeoFix | null;
  /** verified = a real GPS/network fix was captured. */
  verified: boolean;
  /** Human-readable reason when no fix (for banners/toasts). */
  reason: string | null;
  /** Short phase label for loading spinners. */
  phase: 'gps' | 'network' | 'done';
}

const STAGE_TIMEOUT_MS = 8000;

function describeGeoError(err: any): string {
  const code = typeof err?.code === 'number' ? err.code : null;
  // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  if (code === 1) return 'Location permission denied — enable GPS for this site or continue without it.';
  if (code === 3) return 'Location request timed out — weak GPS signal. Continuing without it.';
  if (code === 2) return 'Location unavailable on this device — continuing without GPS.';
  const msg = String(err?.message || '').trim();
  if (msg) return `${msg} — continuing without GPS.`;
  return 'Location unavailable — continuing without GPS.';
}

function attemptOnce(highAccuracy: boolean, timeoutMs: number): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported on this device/browser.'));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const e: any = new Error('Location request timed out.');
      e.code = 3;
      reject(e);
    }, timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
            via: highAccuracy ? 'gps' : 'network',
          });
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        },
        { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    }
  });
}

/**
 * Capture a position with staged fallback. NEVER throws and NEVER hangs —
 * worst case resolves { fix: null, verified: false, reason } after ~16s.
 * `onPhase` lets the UI show "Getting GPS…" → "Trying network location…".
 */
export async function getPositionWithFallback(
  onPhase?: (phase: 'gps' | 'network') => void
): Promise<GeoOutcome> {
  onPhase?.('gps');
  try {
    const fix = await attemptOnce(true, STAGE_TIMEOUT_MS);
    return { fix, verified: true, reason: null, phase: 'done' };
  } catch (firstErr) {
    onPhase?.('network');
    try {
      const fix = await attemptOnce(false, STAGE_TIMEOUT_MS);
      return { fix, verified: true, reason: null, phase: 'done' };
    } catch (secondErr) {
      return { fix: null, verified: false, reason: describeGeoError(secondErr || firstErr), phase: 'done' };
    }
  }
}

/** Safely parse a JSON response body — returns {} instead of throwing on HTML/empty bodies. */
export async function readJsonSafe(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text.slice(0, 200) };
    }
  } catch {
    return {};
  }
}

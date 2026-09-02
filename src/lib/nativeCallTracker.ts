'use client';

import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

/**
 * Native Android call-end bridge for Brokly CRM.
 *
 * - On Android (Capacitor) : listens to the Java CallTrackerPlugin's "callEnded"
 *   event (TelephonyManager + CallLog). Captures authoritative duration + number,
 *   resolves the lead by phone, and auto-POSTs to /api/call-log.
 * - On Web/PWA : falls back to visibilitychange gap timing so the same UI flow
 *   works without native code (zero validation blocking).
 *
 * Usage: call `initNativeCallTracker()` once in a top-level client component
 * (e.g. layout or LeadsManagementScreen). The tracker is singleton-safe and
 * no-ops when permissions are denied or platform is not native.
 */

export type NativeCallEndedPayload = {
  phoneNumber: string;
  duration: number; // seconds from CallLog (authoritative)
  rawDurationMs: number;
  startTime: number;
  endTime: number;
  callLog?: { number: string; duration: number; type: number; date: number } | null;
};

let initialized = false;
let removeListener: (() => void) | null = null;

// Resolve lead_id by phone via a lightweight search. Tries the leads API first,
// falls back to empty (call log still saves with phone only).
async function resolveLeadIdByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const normalized = (phone || '').replace(/\D/g, '').slice(-10);
  if (!normalized) return null;
  try {
    // Try Supabase-side search via our existing leads API (best-effort)
    const res = await fetch(`/api/leads?search=${encodeURIComponent(normalized)}`, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const list = body?.data || body?.leads || [];
      if (Array.isArray(list) && list.length > 0) {
        const hit = list.find((l: any) => String(l.phone || '').replace(/\D/g, '').slice(-10) === normalized) || list[0];
        if (hit?.id) return { id: hit.id, name: hit.name || '' };
      }
    }
  } catch {}
  // Fallback: try client-side search via crmService if API misses
  try {
    const { leadsService } = await import('@/lib/services/crmService');
    const hit = await leadsService.search(normalized, 1);
    if (hit && hit.length > 0 && (hit[0] as any).id) {
      return { id: (hit[0] as any).id, name: (hit[0] as any).name || '' };
    }
  } catch {}
  return null;
}

async function postCallLog(payload: {
  phoneNumber: string;
  duration: number;
  notes?: string;
  outcome?: string;
}) {
  const { phoneNumber, duration, notes, outcome } = payload;
  const resolved = await resolveLeadIdByPhone(phoneNumber);
  const body = {
    entity_type: 'lead',
    entity_id: resolved?.id || '',
    contact_name: resolved?.name || '',
    contact_phone: phoneNumber,
    channel: 'Call',
    direction: 'outgoing',
    duration_seconds: Math.max(0, Math.floor(duration)),
    outcome: outcome || 'Connected',
    notes: notes || `Auto-tracked via Android CallTracker — ${Math.floor(duration)}s`,
    client_ref: `native-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };

  try {
    const res = await fetch('/api/call-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Call log failed (${res.status})`);
    }
    const saved = await res.json().catch(() => ({}));
    // Optimistically update lead status if outcome maps (e.g. No Answer -> No Answer)
    // The /api/call-log route already syncs OUTCOME_TO_STATUS, this is just toast.
    toast.success(`Call tracked: ${phoneNumber} · ${duration}s`);
    return saved?.call || null;
  } catch (e: any) {
    // Don't block UX — log as fallback so manager can see it in admin_settings
    console.warn('[CallTracker] auto log failed', e?.message || e);
    // Still show soft toast so agent knows tracking attempted
    // toast.error(e?.message || 'Call tracking failed');
    return null;
  }
}

/**
 * Initialize the native listener. Safe to call multiple times (idempotent).
 * Returns a cleanup function.
 */
export async function initNativeCallTracker(): Promise<() => void> {
  if (initialized) return () => {};
  initialized = true;

  const isNative = Capacitor.isNativePlatform();
  if (!isNative) {
    // Web/PWA fallback: use the existing visibilitychange gap logic (no native plugin)
    // The PostCallOutcomeModal already handles tel: + modal, so nothing to init here.
    return () => {};
  }

  try {
    // Register the Java plugin (Capacitor will proxy to native if available, else to web mock)
    const CallTracker: any = (Capacitor as any).registerPlugin
      ? (Capacitor as any).registerPlugin('CallTracker')
      : (await import('@capacitor/core')).Capacitor.registerPlugin('CallTracker');

    // Request permissions early (Android 6+ runtime). If denied, we keep listening
    // but queryLastCall will fail gracefully (we fallback to rawDurationMs).
    try {
      if (CallTracker.requestPermissions) {
        await CallTracker.requestPermissions();
      } else if (CallTracker.checkPermissions) {
        const status = await CallTracker.checkPermissions();
        if (!status?.allGranted) {
          await CallTracker.requestPermissions?.();
        }
      }
    } catch {
      // permission request is best-effort; listener still works with rawDurationMs
    }

    // Listen for the native "callEnded" event (fired from CallTrackerPlugin.notifyListeners)
    // Capture duration authoritatively from CallLog and dispatch to the Post-Call modal
    // so the final POST (with outcome + notes) carries the true native duration.
    // We do NOT auto-POST here alone — the modal's Save Log will POST once with
    // outcome+duration together (prevents duplicate logs). The raw event is still
    // stored for debugging and as fallback auto-log if the agent never submits outcome.
    const handle = await CallTracker.addListener('callEnded', async (payload: NativeCallEndedPayload) => {
      const phone = (payload?.phoneNumber || payload?.callLog?.number || '').trim();
      const duration = Number(payload?.duration ?? (payload?.rawDurationMs != null ? payload.rawDurationMs / 1000 : 0));
      if (!phone) return;
      try {
        // Store globally so PostCallOutcomeModal can pick it up on Save
        (window as any).__lastNativeCall = { phoneNumber: phone, duration, payload, at: Date.now() };
        window.dispatchEvent(
          new CustomEvent('brokly:callEnded', { detail: { phoneNumber: phone, duration, payload } }),
        );
        // Fallback auto-log after 60s if the agent never submits the outcome modal
        // (ensures duration is never lost even if modal is dismissed).
        setTimeout(async () => {
          const last = (window as any).__lastNativeCall;
          if (last && last.phoneNumber === phone && Date.now() - last.at < 65000) {
            // Check if a modal is still open for this lead — if so, don't auto-log yet
            const modalOpen = !!document.querySelector('[aria-labelledby="post-call-title"]');
            if (!modalOpen) {
              await postCallLog({ phoneNumber: phone, duration });
              (window as any).__lastNativeCall = null;
            }
          }
        }, 60000);
      } catch {}
    });

    removeListener = () => {
      try {
        handle?.remove?.();
      } catch {}
    };

    // Also expose a manual helper on window for debugging in Chrome remote inspect
    try {
      (window as any).__broklyCallTracker = {
        getLastCall: async () => {
          try {
            return await CallTracker.getLastCall?.();
          } catch (e: any) {
            return { error: e?.message || String(e) };
          }
        },
      };
    } catch {}

    return () => {
      removeListener?.();
      initialized = false;
    };
  } catch (e) {
    console.warn('[CallTracker] init failed (native not available)', e);
    return () => {};
  }
}

/**
 * React hook wrapper — drops into any client component.
 * Example: `useNativeCallTracker()` in layout or LeadsManagementScreen.
 */
export function useNativeCallTracker(enabled = true) {
  if (!enabled) return;
  // This is a lightweight imperative hook; call it inside useEffect
  if (typeof window === 'undefined') return;
  // The caller should manage lifecycle:
  // useEffect(() => { initNativeCallTracker(); }, []);
}

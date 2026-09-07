/**
 * Follow-up change bus (client-only).
 *
 * Problem it solves: the dashboard widgets (KPI counts, overdue list,
 * Today & Pending, delay list) each fetched once on mount, so a follow-up
 * scheduled from a lead card never appeared until a hard reload — the queue
 * looked "decoupled" from scheduling.
 *
 * Every followUpsService mutation emits; every widget subscribes and
 * refetches. No new dependencies, no polling, backward compatible.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToFollowUps(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Called by followUpsService after every successful create/update/delete. */
export function emitFollowUpsChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A broken widget listener must never break scheduling.
    }
  });
}

/**
 * fetch with a hard timeout and retry-with-backoff for transient failures.
 *
 * Used as the Supabase client's global fetch so every PostgREST call gets:
 *  - a timeout (AbortController) instead of hanging until the browser gives up with "TypeError: Load failed";
 *  - up to 2 retries (400ms, 1200ms) for idempotent reads on network errors / 502-504;
 *  - no retries and no timeout for writes, auth, realtime or storage calls (retrying a write could duplicate it,
 *    and token refresh must be allowed to finish).
 */
const READ_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [400, 1200];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET') || 'GET').toUpperCase();
}

export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input);
  const isRest = url.includes('/rest/v1/');
  if (!isRest) return fetch(input, init);

  const method = methodOf(input, init);
  // RPCs are POST but the ones this app calls are read-only counts/aggregates; plain POSTs are writes.
  const idempotent = method === 'GET' || method === 'HEAD' || (method === 'POST' && url.includes('/rest/v1/rpc/'));
  const attempts = idempotent ? RETRY_DELAYS_MS.length + 1 : 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const caller = init?.signal;
    const onCallerAbort = () => controller.abort();
    if (caller) {
      if (caller.aborted) controller.abort();
      else caller.addEventListener('abort', onCallerAbort, { once: true });
    }
    const timer = idempotent ? setTimeout(() => controller.abort(), READ_TIMEOUT_MS) : null;

    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      if (idempotent && [502, 503, 504].includes(res.status) && attempt < attempts - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      // The caller itself cancelled (navigation, unmount): never retry that.
      if (caller?.aborted) throw err;
      if (attempt < attempts - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      caller?.removeEventListener('abort', onCallerAbort);
    }
  }
  throw lastError;
}

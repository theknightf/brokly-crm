/**
 * In-memory sliding window rate limiter
 * Allows up to 20 requests per minute per user.
 */
const rateLimitMap = new Map<string, number[]>();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

export function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];

  // Filter timestamps within the current window
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS) {
    rateLimitMap.set(userId, validTimestamps);
    return { allowed: false, remaining: 0 };
  }

  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);

  // Periodically cleanup stale entries
  if (rateLimitMap.size > 500) {
    for (const [key, times] of rateLimitMap.entries()) {
      const active = times.filter((t) => now - t < WINDOW_MS);
      if (active.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, active);
    }
  }

  return { allowed: true, remaining: MAX_REQUESTS - validTimestamps.length };
}

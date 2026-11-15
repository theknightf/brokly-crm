/**
 * Read the Supabase session stored in the auth cookie (possibly split into `.0`, `.1` … chunks and
 * prefixed with `base64-`) WITHOUT any network call, to learn whether its access token is still valid.
 *
 * Why: when several server requests (middleware + API routes) see an expired access token at the same
 * time, each one tries to refresh it with the same refresh token. Supabase answers 409 "too many
 * concurrent refresh requests" / 429 rate-limit, the session is dropped and the user is logged out.
 * The server therefore never refreshes; only the browser does (one at a time, with a cross-tab lock).
 */
type Cookie = { name: string; value: string };

function b64urlToString(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  if (typeof atob === 'function') {
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

/** Join the auth-token cookie (and its chunks) into the raw stored value. */
function rawAuthValue(cookies: Cookie[]): string | null {
  const auth = cookies.filter((c) => /-auth-token(\.\d+)?$/.test(c.name));
  if (!auth.length) return null;
  const whole = auth.find((c) => /-auth-token$/.test(c.name));
  if (whole) return whole.value;
  return auth
    .sort((a, b) => Number(a.name.split('.').pop()) - Number(b.name.split('.').pop()))
    .map((c) => c.value)
    .join('');
}

/** Seconds-since-epoch expiry of the stored access token, or null if it cannot be read. */
export function sessionExpiry(cookies: Cookie[]): number | null {
  const raw = rawAuthValue(cookies);
  if (!raw) return null;
  try {
    let value = raw;
    try {
      value = decodeURIComponent(value);
    } catch {
      /* already decoded */
    }
    const json = value.startsWith('base64-') ? b64urlToString(value.slice(7)) : value;
    const parsed = JSON.parse(json);
    const session = Array.isArray(parsed) ? { access_token: parsed[0], expires_at: undefined } : parsed;
    if (typeof session?.expires_at === 'number') return session.expires_at;
    // Fall back to the JWT's own `exp`.
    const token: string | undefined = session?.access_token;
    if (token && token.split('.').length === 3) {
      const payload = JSON.parse(b64urlToString(token.split('.')[1]));
      if (typeof payload?.exp === 'number') return payload.exp;
    }
  } catch {
    /* unreadable */
  }
  return null;
}

/** True when there is a stored session whose access token is expired (or about to, within `skewSec`). */
export function hasExpiredSession(cookies: Cookie[], skewSec = 10): boolean {
  const exp = sessionExpiry(cookies);
  return exp !== null && exp <= Math.floor(Date.now() / 1000) + skewSec;
}

/** True when an auth cookie exists at all (signed in, even if the access token needs renewing). */
export function hasSessionCookie(cookies: Cookie[]): boolean {
  return rawAuthValue(cookies) !== null;
}

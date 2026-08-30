import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

/** True when the app is served over HTTPS (Vercel prod or explicit https site url). */
function isSecureApp(): boolean {
  if (process.env.VERCEL === '1') return true;
  return !!process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https');
}

function getProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return url.match(/https:\/\/([^.]+)\./)?.[1] ?? '';
}

export async function createClient() {
  const cookieStore = await cookies();

  // In contexts where cookies are blocked (in-app webviews, Safari ITP,
  // preview iframes) the client falls back to localStorage and sends the
  // session token via the `x-sb-token` header on every same-origin fetch.
  // The middleware already injects this for page routes, but API routes are
  // excluded from the middleware matcher — mirror that here so server-side
  // fetches (reports, admin, etc.) still authenticate in those contexts.
  const headerToken = (await headers()).get('x-sb-token');
  const hasAuthCookie = cookieStore.getAll().some((c) => c.name.includes('auth-token'));
  if (headerToken && !hasAuthCookie) {
    try {
      cookieStore.set(`sb-${getProjectRef()}-auth-token`, headerToken);
    } catch {
      // Read-only cookie context (e.g. some server components) — ignore.
    }
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // Only mark auth cookies Secure when served over HTTPS. On plain
                // HTTP (localhost dev, LAN WebView builds) Secure cookies are
                // silently dropped, which breaks session persistence and shows
                // up as repeated auth failures ("Failed to fetch").
                secure: isSecureApp() ? true : false,
                sameSite: 'lax',
              })
            );
          } catch {
            // Server Component read-only context — expected
          }
        },
      },
    }
  );
}

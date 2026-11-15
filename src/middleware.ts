import { hasSessionCookie } from '@/lib/supabase/sessionCookie';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';

function getProjectRef(): string {
  const url = SUPABASE_URL;
  return url.match(/https:\/\/([^.]+)\./)?.[1] ?? '';
}

function injectTokenFromHeader(request: NextRequest): void {
  const token = request.headers.get('x-sb-token');
  if (!token) return;
  const hasCookie = request.cookies.getAll().some((c) => c.name.includes('auth-token'));
  if (hasCookie) return;
  request.cookies.set(`sb-${getProjectRef()}-auth-token`, token);
}

const PUBLIC_PATHS = ['/sign-up-login', '/auth/callback'];

export async function middleware(request: NextRequest) {
  injectTokenFromHeader(request);
  const supabaseResponse = NextResponse.next({ request });

  const isPublicPath = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  // Avoid a round-trip to the auth server on every request: only validate the
  // session when a token is actually present (cookie or injected header).
  const hasAuthToken =
    !!request.headers.get('x-sb-token') ||
    request.cookies.getAll().some((c) => c.name.includes('auth-token'));

  // Page gate only: a stored session (even with an expired access token) counts as signed in.
  // The middleware must NOT refresh the token — server-side refreshes racing the browser's own
  // refresh got 409/429 from Supabase and logged people out. The browser renews the token, and
  // every API route still validates the user with getUser().
  const user = hasAuthToken && hasSessionCookie(request.cookies.getAll()) ? { signedIn: true } : null;

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-up-login';
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith('/sign-up-login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclude next internals, API routes, favicon, and all static assets
    // (images, fonts, icons, PWA manifest and service worker) from middleware.
    '/((?!_next/static|_next/image|api|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|webmanifest|json|js)$).*)',
  ],
};

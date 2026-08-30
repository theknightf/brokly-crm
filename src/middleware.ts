import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function getProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
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

  let user = null;
  if (hasAuthToken) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              supabaseResponse.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // Use getSession() (local JWT decode from the cookie) instead of getUser()
    // (a network round-trip to the auth server) on every navigation. This
    // removes the biggest per-request latency cost. Actual session ownership
    // is still validated with getUser() inside the API routes and AuthProvider.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  }

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

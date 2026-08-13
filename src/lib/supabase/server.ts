import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** True when the app is served over HTTPS (Vercel prod or explicit https site url). */
function isSecureApp(): boolean {
  if (process.env.VERCEL === '1') return true;
  return !!process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https');
}

export async function createClient() {
  const cookieStore = await cookies();

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

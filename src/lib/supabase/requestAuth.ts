import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient as createCookieClient } from '@/lib/supabase/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

/**
 * Supabase client + user for an API request.
 *
 * - Browser/PWA: the session cookie (same as before).
 * - Native mobile app: `Authorization: Bearer <supabase access token>`. The client is created with that token,
 *   so every query still runs as that user and row-level security applies exactly as it does on the web.
 *
 * No AI/provider keys ever reach a client; the app only sends its own login token.
 */
export async function getRequestSupabase(request: Request): Promise<{ supabase: any; user: any | null }> {
  const auth = request.headers.get('authorization') || '';
  if (/^bearer /i.test(auth)) {
    const token = auth.slice(7).trim();
    const supabase = createSupabaseJsClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return { supabase, user: user ?? null };
  }

  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user ?? null };
}

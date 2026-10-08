import { createBrowserClient } from '@supabase/ssr';

const PFX = 'sb_';

const canUseCookies = (() => {
  let cache: boolean | null = null;
  return () => {
    if (typeof document === 'undefined') return false;
    if (cache !== null) return cache;
    const k = '__sb_test__';
    try {
      document.cookie = `${k}=1; Path=/; SameSite=None; Secure; Partitioned`;
      cache = document.cookie.includes(k);
      document.cookie = `${k}=; Path=/; Max-Age=0; SameSite=None; Secure`;
    } catch {
      // Cookie access can throw on non-secure contexts or when third-party
      // cookies are blocked (preview iframes, webviews, Safari ITP). Never
      // crash the app at module load — fall back to storage.
      cache = false;
    }
    return cache;
  };
})();

const fromCookies = () =>
  typeof document === 'undefined'
    ? []
    : document.cookie
        .split(';')
        .filter(Boolean)
        .map((c) => {
          const [name, ...parts] = c.trim().split('=');
          return { name: name.trim(), value: decodeURIComponent(parts.join('=')) };
        })
        .filter((c) => c.name);

const fromStorage = () => {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PFX))
      .map((k) => ({ name: k.slice(PFX.length), value: localStorage.getItem(k) || '' }));
  } catch {
    return [];
  }
};

const setCookie = (name: string, value: string, options?: any) => {
  try {
    // Only force Secure on HTTPS. Plain HTTP (localhost / LAN WebView) drops
    // Secure cookies silently, breaking session persistence.
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    let s = `${name}=${encodeURIComponent(value)}; Path=${options?.path || '/'}; SameSite=Lax${secure ? '; Secure' : ''}${secure ? '; Partitioned' : ''}`;
    if (options?.maxAge) s += `; Max-Age=${options.maxAge}`;
    if (options?.domain) s += `; Domain=${options.domain}`;
    if (options?.expires) s += `; Expires=${new Date(options.expires).toUTCString()}`;
    document.cookie = s;
  } catch {
    // Ignore — cookie writes can throw when third-party cookies are blocked.
  }
};

const deleteCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const domains = ['', host, host ? `.${host}` : ''].filter(Boolean);
  const variants = [
    'Path=/; SameSite=Lax',
    'Path=/; SameSite=None; Secure',
    'Path=/; SameSite=None; Secure; Partitioned',
  ];
  variants.forEach((attrs) => {
    document.cookie = `${name}=; Max-Age=0; ${attrs}`;
    domains.forEach((domain) => {
      document.cookie = `${name}=; Max-Age=0; Domain=${domain}; ${attrs}`;
    });
  });
};

const getToken = () =>
  (canUseCookies() ? fromCookies() : fromStorage()).find((c) => c.name.includes('auth-token'))
    ?.value ?? null;

export const clearAuthStorage = () => {
  if (typeof document !== 'undefined') {
    fromCookies().forEach((c) => {
      if (c.name.includes('auth-token') || c.name.includes('sb-')) {
        deleteCookie(c.name);
      }
    });
  }
  if (typeof localStorage !== 'undefined') {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(PFX) || k.includes('auth-token') || k.includes('brokly_session')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
  }
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

let browserClientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClientInstance) return browserClientInstance;

  const client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    cookies: {
      getAll: () => (canUseCookies() ? fromCookies() : fromStorage()),
      setAll(cookiesToSet) {
        if (typeof document === 'undefined') return;
        if (canUseCookies()) {
          cookiesToSet.forEach(({ name, value, options }) =>
            value ? setCookie(name, value, options) : deleteCookie(name)
          );
        } else {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              if (value) {
                localStorage.setItem(`${PFX}${name}`, value);
              } else {
                localStorage.removeItem(`${PFX}${name}`);
              }
            } catch {
              // localStorage unavailable — fall back to cookie below
            }
            if (value) setCookie(name, value, options);
          });
        }
      },
    },
  });

  browserClientInstance = client;
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Automatic Silent Token Refresh Interceptor for Fetch
// ─────────────────────────────────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const client = createClient();
      const { data, error } = await client.auth.refreshSession();
      if (error || !data?.session) {
        // Refresh token invalid or expired
        return null;
      }
      return data.session.access_token || null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

if (typeof window !== 'undefined' && !(window as any).__sb_patched__) {
  (window as any).__sb_patched__ = true;
  const orig = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    let token = getToken();
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    const isSameOriginOrApi =
      url.startsWith('/') ||
      url.startsWith(window.location.origin) ||
      (SUPABASE_URL && url.startsWith(SUPABASE_URL));

    let modifiedInit = init ? { ...init } : {};
    if (token && isSameOriginOrApi) {
      modifiedInit.headers = {
        ...(modifiedInit.headers || {}),
        'x-sb-token': token,
      };
    }

    let response = await orig(input, modifiedInit);

    // If 401 Unauthorized received on an authenticated same-origin API endpoint
    if (response.status === 401 && isSameOriginOrApi && !url.includes('/api/auth/session') && !url.includes('/auth/v1/token')) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Retry the request transparently with the freshly minted token
        const retryHeaders = {
          ...(modifiedInit.headers || {}),
          'x-sb-token': getToken() || newToken,
          Authorization: `Bearer ${newToken}`,
        };
        response = await orig(input, { ...modifiedInit, headers: retryHeaders });
      } else {
        // Fallback: refresh genuinely failed or token was revoked
        // Only redirect if user was previously authenticated and is not on auth pages
        if (token && !window.location.pathname.startsWith('/sign-up-login')) {
          clearAuthStorage();
          window.location.href = '/sign-up-login';
        }
      }
    }

    return response;
  };
}

'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { normalizeAuthError } from '@/lib/authErrors';

const AuthContext = createContext<any>({});

const sleep = (ms: number) => new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));

/** Remove every Supabase auth artefact from the browser (sb-* storage keys and cookies). */
function clearAuthStorage() {
  if (typeof window === 'undefined') return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => k.startsWith('sb-') || k === 'brokly_session_id')
        .forEach((k) => store.removeItem(k));
    } catch {
      /* storage blocked */
    }
  }
  try {
    document.cookie
      .split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((n) => n.startsWith('sb-'))
      .forEach((n) => {
        document.cookie = `${n}=; Max-Age=0; path=/`;
        document.cookie = `${n}=; Max-Age=0; path=/; domain=${window.location.hostname}`;
      });
  } catch {
    /* ignore */
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = () => (supabaseRef.current ??= createClient());
  const router = useRouter();
  const profileRequestRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const userRef = useRef<any>(null);
  userRef.current = user;

  // Activity tracking — automatically tracks login/session/heartbeat/logout
  useActivityTracker(user?.id || null);

  // Sign-out that can never hang: every network step has a short timeout, and the browser state is
  // always wiped and the page hard-navigated to the login screen in `finally`.
  const hardSignOut = async (closeActivitySession = true) => {
    try {
      if (closeActivitySession) {
        const sid = typeof window !== 'undefined' ? localStorage.getItem('brokly_session_id') : null;
        const uid = userRef.current?.id;
        if (sid && uid) {
          await Promise.race([
            fetch(`/api/auth/session?session_id=${sid}&user_id=${uid}`, { method: 'DELETE', keepalive: true }).catch(() => {}),
            sleep(1000),
          ]);
        }
      }
      await Promise.race([getSupabase().auth.signOut({ scope: 'local' }), sleep(2000)]);
    } catch (e) {
      console.error('[AuthContext] signOut failed, clearing local session anyway', e);
    } finally {
      clearAuthStorage();
      setProfile(null);
      setUser(null);
      setSession(null);
      if (typeof window !== 'undefined') window.location.replace('/sign-up-login');
    }
  };

  const fetchProfile = async (userId: string) => {
    // getSession() and onAuthStateChange() both fire on mount; skip the
    // duplicate in-flight request for the same user.
    if (profileRequestRef.current?.userId === userId) return profileRequestRef.current.promise;

    const promise = (async () => {
      try {
        const { data } = await getSupabase().from('user_profiles').select('*').eq('id', userId).single();
        // Deactivated accounts are signed out immediately so deactivation takes
        // effect on the very next profile fetch (mount, login, or session change).
        if (data && data.is_active === false) {
          await hardSignOut(false);
          return;
        }
        setProfile(data);
      } catch {
        setProfile(null);
      } finally {
        if (profileRequestRef.current?.userId === userId) profileRequestRef.current = null;
      }
    })();

    profileRequestRef.current = { userId, promise };
    return promise;
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      // Never let the UI wait forever for the first session: after 8s render with whatever we have.
      const guard = setTimeout(() => {
        if (mounted) setLoading(false);
      }, 8000);
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (e) {
        console.error('[AuthContext] initial session load failed', e);
      } finally {
        clearTimeout(guard);
        if (mounted) setLoading(false);
      }
    };
    init();

    // IMPORTANT: this callback must stay synchronous. supabase-js holds its auth lock while the
    // callback runs, and any supabase call awaited inside it (like the profile query) waits for
    // that same lock — a deadlock that freezes sign-out, token refresh and every later request.
    // Heavy work is deferred with setTimeout so the lock is released first.
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // Token refreshes do not change the profile; only (re)load it on sign-in / initial session.
      if (event === 'TOKEN_REFRESHED') return;
      setLoading(true);
      setTimeout(() => {
        if (!mounted) return;
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Names/roles can be edited elsewhere (an admin renaming you, another tab): re-read the profile
  // whenever the app becomes visible again so a stale name never lingers.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && userRef.current?.id) {
        void fetchProfile(userRef.current.id);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async (email: string, password: string, metadata: Record<string, any> = {}) => {
    // Self-signup can never claim a privileged role (backed by the
    // handle_new_user trigger which also downgrades unknown/privileged roles).
    const requestedRole = String(metadata?.role || 'agent');
    const safeRole = ['agent', 'broker', 'branch_manager', 'team_leader', 'senior_agent', 'telecaller'].includes(
      requestedRole
    )
      ? requestedRole
      : 'agent';
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata?.fullName || '',
          avatar_url: metadata?.avatarUrl || '',
          role: safeRole,
          brokerage_name: metadata?.brokerageName || '',
          phone: metadata?.phone || '',
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`,
      },
    });
    if (error) throw new Error(normalizeAuthError(error));
    return data;
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        // Preserve the full technical detail for debugging (browser console /
        // network tab), but only surface a safe message to the user.
        console.error('[AuthContext] signInWithPassword failed', {
          status: error.status,
          code: error.code,
          message: error.message,
        });
        throw new Error(normalizeAuthError(error));
      }
      if (!data.user) throw new Error('Sign in failed. Please try again.');
      // Do not navigate until the profile (including the user's role) is ready.
      // This prevents the dashboard from rendering as an anonymous user until
      // a manual browser refresh.
      setSession(data.session);
      setUser(data.user);
      await fetchProfile(data.user.id);
      // Activity session is started automatically by useActivityTracker when
      // `user` is set by onAuthStateChange. Avoid refreshing the current route
      // here; the login screen performs the navigation immediately after this
      // promise resolves.
      return data;
    } catch (err: any) {
      // Already normalized above — propagate the user-safe message as-is.
      if (err instanceof Error && /^(Invalid email|Unable to connect|Please confirm|Too many|Password does not|Sign in failed|Authentication is not configured)/.test(err.message)) {
        throw err;
      }
      throw new Error(normalizeAuthError(err));
    }
  };

  const signOut = async () => {
    await hardSignOut(true);
  };

  /**
   * Re-read the signed-in user's row from user_profiles (the single source of truth for name, role,
   * phone…) and refresh the session so the JWT / user_metadata cannot lag behind it. Call this after
   * any profile edit.
   */
  const refreshProfile = async () => {
    const uid = userRef.current?.id;
    if (!uid) return null;
    try {
      await Promise.race([getSupabase().auth.refreshSession(), sleep(4000)]);
    } catch {
      /* the profile re-read below is what matters */
    }
    profileRequestRef.current = null;
    await fetchProfile(uid);
    router.refresh();
    return true;
  };

  const resetPassword = async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) throw new Error(normalizeAuthError(error));
  };

  const getCurrentUser = async () => {
    const {
      data: { user },
      error,
    } = await getSupabase().auth.getUser();
    if (error) throw error;
    return user;
  };

  const getUserProfile = async () => {
    if (!user) return null;
    const { data, error } = await getSupabase()
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  };

  const isEmailVerified = () => user?.email_confirmed_at !== null;

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    resetPassword,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { normalizeAuthError } from '@/lib/authErrors';

const AuthContext = createContext<any>({});

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
  const profileRequestRef = useRef<string | null>(null);

  // Activity tracking — automatically tracks login/session/heartbeat/logout
  useActivityTracker(user?.id || null);

  const fetchProfile = async (userId: string) => {
    // getSession() and onAuthStateChange() both fire on mount; skip the
    // duplicate in-flight request for the same user.
    if (profileRequestRef.current === userId) return;
    profileRequestRef.current = userId;
    try {
      const { data } = await getSupabase().from('user_profiles').select('*').eq('id', userId).single();
      // Deactivated accounts are signed out immediately so deactivation takes
      // effect on the very next profile fetch (mount, login, or session change).
      if (data && data.is_active === false) {
        setProfile(null);
        const { error } = await getSupabase().auth.signOut();
        if (error) console.error('[AuthContext] signOut (disabled account) failed', error);
        router.push('/sign-up-login');
        router.refresh();
        return;
      }
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      profileRequestRef.current = null;
    }
  };

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, metadata: Record<string, any> = {}) => {
    // Self-signup can never claim a privileged role (backed by the
    // handle_new_user trigger which also downgrades unknown/privileged roles).
    const requestedRole = String(metadata?.role || 'agent');
    const safeRole = ['agent', 'broker', 'branch_manager', 'senior_agent', 'telecaller'].includes(
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
    // Close activity session before signing out
    try {
      const sid = typeof window !== 'undefined' ? localStorage.getItem('brokly_session_id') : null;
      if (sid && user?.id) {
        await fetch(`/api/auth/session?session_id=${sid}&user_id=${user.id}`, { method: 'DELETE' });
        localStorage.removeItem('brokly_session_id');
      }
    } catch {
      /* best effort */
    }
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    setProfile(null);
    router.push('/sign-up-login');
    router.refresh();
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
    resetPassword,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

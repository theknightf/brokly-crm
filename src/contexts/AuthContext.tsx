'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useActivityTracker } from '@/hooks/useActivityTracker';

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
  const supabase = createClient();
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
      const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      profileRequestRef.current = null;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, metadata: Record<string, any> = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata?.fullName || '',
          avatar_url: metadata?.avatarUrl || '',
          role: metadata?.role || 'agent',
          brokerage_name: metadata?.brokerageName || '',
          phone: metadata?.phone || '',
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Activity session is started automatically by useActivityTracker when
    // `user` is set by onAuthStateChange. No manual POST needed here.
    router.refresh();
    return data;
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
    router.push('/sign-up-login');
    router.refresh();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) throw error;
  };

  const getCurrentUser = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  };

  const getUserProfile = async () => {
    if (!user) return null;
    const { data, error } = await supabase
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

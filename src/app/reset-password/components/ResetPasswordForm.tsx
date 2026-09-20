'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Check, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';

function validate(password: string, confirm: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (password.length < 8) e.password = 'Password must be at least 8 characters';
  else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(password))
    e.password = 'Password must include uppercase, lowercase, and a number';
  if (password !== confirm) e.confirm = 'Passwords do not match';
  return e;
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);

  // Recovery link lands here via /auth/callback?next=/reset-password which
  // exchanges the code for a session. Wait for that session before allowing update.
  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (session?.user) setReady(true);
      else {
        // Give the callback a moment (email client may open before exchange finishes)
        const t = setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (!alive) return;
            if (s2?.user) setReady(true);
            else setNoSession(true);
          });
        }, 1500);
        return () => clearTimeout(t);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        setReady(true);
        setNoSession(false);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    const e = validate(password, confirm);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated — please sign in with your new password');
      await supabase.auth.signOut();
      router.replace('/sign-up-login');
    } catch (err: any) {
      setErrors({ form: err?.message || 'Failed to update password' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-modal p-6 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <AppLogo size={36} />
          <div>
            <h1 className="text-base font-semibold text-foreground">Set new password</h1>
            <p className="text-sm text-muted-foreground">Choose a strong password for your account</p>
          </div>
        </div>

        {noSession ? (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium flex items-center gap-2"><Shield size={14} /> Reset link expired or already used</p>
            <p className="text-xs mt-1">Request a new link from the login page → Forgot password.</p>
            <button onClick={() => router.replace('/sign-up-login')} className="btn-secondary w-full mt-3">
              Back to log in
            </button>
          </div>
        ) : !ready ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={22} className="animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Verifying reset link…</span>
          </div>
        ) : (
          <>
            {errors.form && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-3 py-2 mb-4">
                {errors.form}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">New Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((p) => ({ ...p, password: '', form: '' }));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                    placeholder="Min 8 chars, upper, lower, number"
                    className="input-base w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Confirm New Password *</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    autoComplete="new-password"
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setErrors((p) => ({ ...p, confirm: '', form: '' }));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                    placeholder="Repeat the new password"
                    className="input-base w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
              </div>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Save new password
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

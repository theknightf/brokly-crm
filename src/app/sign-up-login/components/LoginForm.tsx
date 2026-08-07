'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface ForgotPasswordData {
  email: string;
}

interface LoginFormProps {
  onSwitchToSignup?: () => void;
}

export default function LoginForm(_props?: LoginFormProps) {
  const router = useRouter();
  const { signIn, resetPassword } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ defaultValues: { rememberMe: false } });

  const {
    register: registerForgot,
    handleSubmit: handleForgotSubmit,
    formState: { errors: forgotErrors, isSubmitting: forgotSubmitting },
  } = useForm<ForgotPasswordData>();

  const onSubmit = async (data: LoginFormData) => {
    try {
      await signIn(data.email, data.password);
      toast.success('Signed in successfully');
      router.push('/');
    } catch (err: any) {
      setError('root', {
        message: err?.message || 'Invalid email or password',
      });
    }
  };

  const onForgotSubmit = async (data: ForgotPasswordData) => {
    try {
      await resetPassword(data.email);
      setResetSent(true);
      toast.success('Password reset email sent');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset email');
    }
  };

  if (forgotMode) {
    return (
      <div className="fade-in">
        <div className="mb-7">
          <h2 className="text-2xl font-bold text-foreground">Reset password</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your email and we will send you a reset link
          </p>
        </div>

        {resetSent ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-center">
            <p className="text-sm text-emerald-700 font-medium">Reset link sent!</p>
            <p className="text-xs text-emerald-600 mt-1">
              Check your inbox and follow the link to reset your password.
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit(onForgotSubmit)} className="space-y-5" noValidate>
            <div>
              <label htmlFor="forgot-email" className="label-base">
                Email address
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                className={`input-base ${forgotErrors.email ? 'border-red-400' : ''}`}
                placeholder="you@brokerage.com"
                {...registerForgot('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
                })}
              />
              {forgotErrors.email && (
                <p className="mt-1 text-xs text-red-500">{forgotErrors.email.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={forgotSubmitting}
              className="btn-primary w-full h-11 flex items-center justify-center gap-2"
            >
              {forgotSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-muted-foreground mt-6">
          <button
            onClick={() => {
              setForgotMode(false);
              setResetSent(false);
            }}
            className="text-primary font-semibold hover:underline"
          >
            Back to Sign In
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-sm text-muted-foreground mt-1">Sign in to your Brokly workspace</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {errors.root && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600">{errors.root.message}</p>
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="label-base">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className={`input-base ${errors.email ? 'border-red-400 focus:ring-red-300' : ''}`}
            placeholder="you@brokerage.com"
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
            })}
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="login-password" className="label-base mb-0">
              Password
            </label>
            <button
              type="button"
              onClick={() => setForgotMode(true)}
              className="text-xs text-primary hover:underline font-medium"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={`input-base pr-10 ${errors.password ? 'border-red-400 focus:ring-red-300' : ''}`}
              placeholder="Enter your password"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'Password must be at least 6 characters' },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="remember-me"
            type="checkbox"
            className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
            {...register('rememberMe')}
          />
          <label htmlFor="remember-me" className="text-sm text-muted-foreground cursor-pointer">
            Remember me for 30 days
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full h-11 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Signing in…</span>
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-6">
        Need an account? Contact your administrator.
      </p>
    </div>
  );
}

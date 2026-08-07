'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface SignUpFormData {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  brokerageName: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

const roleOptions = [
  { value: 'broker', label: 'Broker / Owner' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'senior_agent', label: 'Senior Agent' },
  { value: 'agent', label: 'Sales Agent' },
  { value: 'telecaller', label: 'Telecaller' },
];

interface SignUpFormProps {
  onSwitchToLogin: () => void;
}

export default function SignUpForm({ onSwitchToLogin }: SignUpFormProps) {
  const router = useRouter();
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>();

  const password = watch('password');

  const onSubmit = async (data: SignUpFormData) => {
    try {
      await signUp(data.email, data.password, {
        fullName: data.fullName,
        role: data.role,
        brokerageName: data.brokerageName,
        phone: data.phone,
      });
      toast.success(`Welcome to Brokly, ${data.fullName.split(' ')[0]}!`);
      router.push('/');
    } catch (err: any) {
      setError('root', {
        message: err?.message || 'Failed to create account. Please try again.',
      });
    }
  };

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Create your account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set up your brokerage workspace in under 2 minutes
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {errors.root && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600">{errors.root.message}</p>
          </div>
        )}

        <div>
          <label htmlFor="signup-name" className="label-base">
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            className={`input-base ${errors.fullName ? 'border-red-400' : ''}`}
            placeholder="Sarah Reynolds"
            {...register('fullName', {
              required: 'Full name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.fullName && (
            <p className="mt-1 text-xs text-red-500">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="signup-email" className="label-base">
            Work email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            className={`input-base ${errors.email ? 'border-red-400' : ''}`}
            placeholder="you@yourbrokerage.com"
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
            })}
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-phone" className="label-base">
              Phone
            </label>
            <input
              id="signup-phone"
              type="tel"
              autoComplete="tel"
              className={`input-base ${errors.phone ? 'border-red-400' : ''}`}
              placeholder="+91 98765 43210"
              {...register('phone', {
                required: 'Phone is required',
                minLength: { value: 7, message: 'Enter a valid phone number' },
              })}
            />
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
          </div>
          <div>
            <label htmlFor="signup-role" className="label-base">
              Your role
            </label>
            <div className="relative">
              <select
                id="signup-role"
                className={`input-base appearance-none pr-8 ${errors.role ? 'border-red-400' : ''}`}
                {...register('role', { required: 'Select your role' })}
              >
                <option value="">Select role</option>
                {roleOptions.map((r) => (
                  <option key={`role-${r.value}`} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
            {errors.role && <p className="mt-1 text-xs text-red-500">{errors.role.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="signup-brokerage" className="label-base">
            Brokerage / Company name
          </label>
          <p className="text-xs text-muted-foreground mb-1">This will be your workspace name</p>
          <input
            id="signup-brokerage"
            type="text"
            className={`input-base ${errors.brokerageName ? 'border-red-400' : ''}`}
            placeholder="Horizon Realty Partners"
            {...register('brokerageName', {
              required: 'Brokerage name is required',
              minLength: { value: 2, message: 'Must be at least 2 characters' },
            })}
          />
          {errors.brokerageName && (
            <p className="mt-1 text-xs text-red-500">{errors.brokerageName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="signup-password" className="label-base">
            Password
          </label>
          <p className="text-xs text-muted-foreground mb-1">Minimum 8 characters with a number</p>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={`input-base pr-10 ${errors.password ? 'border-red-400' : ''}`}
              placeholder="Create a strong password"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
                pattern: {
                  value: /^(?=.*[0-9])/,
                  message: 'Password must contain at least one number',
                },
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

        <div>
          <label htmlFor="signup-confirm" className="label-base">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="signup-confirm"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              className={`input-base pr-10 ${errors.confirmPassword ? 'border-red-400' : ''}`}
              placeholder="Repeat your password"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (val) => val === password || 'Passwords do not match',
              })}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-start gap-2">
            <input
              id="agree-terms"
              type="checkbox"
              className="w-4 h-4 mt-0.5 rounded border-input accent-primary cursor-pointer flex-shrink-0"
              {...register('agreeTerms', { required: 'You must agree to the terms' })}
            />
            <label
              htmlFor="agree-terms"
              className="text-sm text-muted-foreground cursor-pointer leading-snug"
            >
              I agree to Brokly&apos;s{' '}
              <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>{' '}
              and{' '}
              <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>
            </label>
          </div>
          {errors.agreeTerms && (
            <p className="mt-1 text-xs text-red-500">{errors.agreeTerms.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full h-11 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Creating workspace…</span>
            </>
          ) : (
            'Create Free Account'
          )}
        </button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-5">
        Already have an account?{' '}
        <button onClick={onSwitchToLogin} className="text-primary font-semibold hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}

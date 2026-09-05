'use client';
import React, { useEffect } from 'react';

/**
 * Route-level error boundary — catches render/data crashes anywhere under
 * src/app and offers recovery instead of a frozen white screen.
 * Auth/session failures redirect to login; everything else offers retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app:error-boundary]', error?.message, error?.digest || '');
  }, [error]);

  const msg = String(error?.message || '');
  const isAuth =
    /unauthorized|forbidden|401|403|session|expired|jwt|token|auth/i.test(msg);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#181b22] p-6 text-center shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)]">
        <p className="text-lg font-black text-zinc-50" dir="rtl">
          {isAuth ? 'انتهت الجلسة — يلزم تسجيل الدخول' : 'حدث خطأ غير متوقع'}
        </p>
        <p className="text-xs text-zinc-500 mt-1" dir="ltr">
          {isAuth ? 'Session expired — please sign in again' : 'Something went wrong'}
        </p>
        {!isAuth && msg ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-[#12141a] px-3 py-2 text-[11px] text-zinc-400 break-words" dir="ltr">
            {msg.slice(0, 220)}
          </p>
        ) : null}
        <div className="flex items-center gap-2 mt-5">
          {isAuth ? (
            <a
              href="/sign-up-login"
              className="flex-1 min-h-[44px] rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-sm font-black flex items-center justify-center transition-colors"
            >
              Sign in again
            </a>
          ) : (
            <button
              onClick={() => reset()}
              className="flex-1 min-h-[44px] rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-sm font-black transition-colors"
            >
              Try again
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="flex-1 min-h-[44px] rounded-xl border border-white/15 text-sm font-bold text-zinc-200 hover:bg-white/5 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

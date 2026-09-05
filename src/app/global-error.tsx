'use client';
import React from 'react';

/**
 * Root-layout error boundary. Must be fully self-contained (no app layout,
 * no theme CSS dependency) — plain inline styles so it renders even when
 * the root layout itself crashes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f1115', color: '#e7e9ee', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', background: '#181b22', padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>Brokly ran into a problem</p>
            <p style={{ fontSize: 12, color: '#8a8f9c', margin: 0 }}>The app shell failed to load. Your data is safe.</p>
            {error?.message ? (
              <p style={{ fontSize: 11, color: '#8a8f9c', background: '#12141a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', wordBreak: 'break-word' }}>
                {String(error.message).slice(0, 200)}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => reset()}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 0, background: '#84cc16', color: '#09090b', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
              >
                Try again
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#e7e9ee', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

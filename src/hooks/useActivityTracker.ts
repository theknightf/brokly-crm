'use client';
import { useEffect, useRef, useCallback } from 'react';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const SESSION_STORAGE_KEY = 'brokly_session_id';
const ACTIVITY_API = '/api/auth/session';
const HEARTBEAT_API = '/api/auth/heartbeat';

export function useActivityTracker(userId: string | null) {
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(false);

  const startSession = useCallback(async () => {
    if (!userId) return;

    // Check existing session in storage
    const existingSessionId =
      typeof window !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null;

    if (existingSessionId) {
      sessionIdRef.current = existingSessionId;
      // Send heartbeat immediately to verify session is still active
      try {
        const res = await fetch(HEARTBEAT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: existingSessionId, user_id: userId }),
        });
        const data = await res.json();
        if (data.action === 're_register' || !res.ok) {
          // Session expired or not found, create new one
          sessionIdRef.current = null;
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return startSession();
        }
      } catch {
        // Network error — keep existing session
      }
      return;
    }

    // Create new session
    try {
      const res = await fetch(ACTIVITY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_agent: navigator.userAgent,
        }),
      });
      const data = await res.json();
      if (data.session_id) {
        sessionIdRef.current = data.session_id;
        if (typeof window !== 'undefined') {
          localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
        }
      }
    } catch {
      // Best effort — don't block app
    }
  }, [userId]);

  const sendHeartbeat = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!userId || !sessionId) return;

    try {
      const res = await fetch(HEARTBEAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, user_id: userId }),
      });
      const data = await res.json();
      if (data.action === 're_register') {
        sessionIdRef.current = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
        startSession();
      }
    } catch {
      // Best effort
    }
  }, [userId, startSession]);

  const endSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!userId || !sessionId) return;

    try {
      await fetch(`${ACTIVITY_API}?session_id=${sessionId}&user_id=${userId}`, {
        method: 'DELETE',
      });
    } catch {
      // Best effort
    }

    sessionIdRef.current = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || mountedRef.current) return;
    mountedRef.current = true;

    startSession();

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleBeforeUnload = () => {
      if (sessionIdRef.current && userId) {
        // sendBeacon can only POST — the heartbeat endpoint accepts a `close`
        // flag to finalize the session on tab close.
        const payload = JSON.stringify({
          session_id: sessionIdRef.current,
          user_id: userId,
          close: true,
        });
        navigator.sendBeacon(HEARTBEAT_API, new Blob([payload], { type: 'application/json' }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      endSession();
      mountedRef.current = false;
    };
  }, [userId, startSession, sendHeartbeat, endSession]);

  return { sessionId: sessionIdRef.current };
}

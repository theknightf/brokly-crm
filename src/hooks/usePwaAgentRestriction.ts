'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Same rule as the phone app: a plain sales agent using the INSTALLED app (PWA, standalone window) only gets the
 * Leads and Follow-ups pages. Everyone else, and agents in a normal browser tab, keep the full site.
 * This only shapes the UI; data access is still enforced by the database.
 */
export const PWA_AGENT_ALLOWED_PATHS = ['/leads-management', '/leads', '/follow-ups'];
export const PWA_AGENT_HOME = '/leads-management';

export function isPwaAgentAllowedPath(path: string): boolean {
  const p = (path || '').split('?')[0].split('#')[0];
  return PWA_AGENT_ALLOWED_PATHS.some((a) => p === a || p.startsWith(a + '/'));
}

function isPlainSalesAgent(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return r === 'agent' || r === 'sales';
}

export function usePwaAgentRestriction(): boolean {
  const { profile } = useAuth();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(display-mode: standalone)');
      const read = () => setStandalone(mq.matches || (navigator as { standalone?: boolean }).standalone === true);
      read();
      mq.addEventListener?.('change', read);
      return () => mq.removeEventListener?.('change', read);
    } catch {
      setStandalone(false);
    }
  }, []);

  return standalone && isPlainSalesAgent(profile?.role);
}

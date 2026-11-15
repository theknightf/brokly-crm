'use client';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Instant notification dispatcher for rows in `notifications`:
 *  - payroll deductions → deduction toast (title, amount, reason, link to payroll)
 *  - duplicate-lead notices (reference_link starts with /duplicates) → one duplicate toast, link to Duplicates
 * Every notice pops up ONE time only: shown ids are remembered per user in localStorage, so a reload,
 * a new tab or the 60 s poll never shows the same alert again. It stays in the bell until read.
 */
const MAX_REMEMBERED = 500;

const storageKey = (userId: string) => `brokly:shown-alerts:${userId}`;

function loadShown(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveShown(userId: string, ids: Set<string>) {
  try {
    const list = Array.from(ids).slice(-MAX_REMEMBERED);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch {
    /* storage unavailable: falls back to once per page load */
  }
}

const isDuplicateNotice = (n: any) => String(n?.reference_link || '').startsWith('/duplicates');

export default function DeductionAlertProvider() {
  const { user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    seenRef.current = loadShown(user.id);
    const client = createClient();
    let channel: ReturnType<typeof client.channel> | null = null;

    const markShown = (ids: string[]) => {
      ids.forEach((id) => seenRef.current.add(id));
      saveShown(user.id, seenRef.current);
    };

    const showDeduction = (n: any) => {
      toast.error(`${n.title || 'Deduction Alert'}: ${n.reason || n.message} — ${n.amount} EGP`, {
        description: `${n.message || n.reason || ''} • ${new Date(n.created_at).toLocaleString()} • Tap to view payroll`,
        duration: 8000,
        action: {
          label: 'View payroll',
          onClick: () => { window.location.href = n.reference_link || '/admin?tab=payroll'; },
        },
      });
    };

    // Several duplicates at once (e.g. an import) give one toast, not one per lead.
    const showDuplicates = (rows: any[]) => {
      const one = rows.length === 1 ? rows[0] : null;
      toast.warning(one ? one.title || 'Duplicate lead added' : `${rows.length} duplicate leads added`, {
        description: one ? one.message || '' : 'Leads that already exist were added again.',
        duration: 8000,
        action: {
          label: 'Review',
          onClick: () => { window.location.href = '/duplicates'; },
        },
      });
    };

    const handle = (rows: any[]) => {
      const fresh = rows.filter((n) => n?.id && !seenRef.current.has(String(n.id)));
      if (!fresh.length) return;
      markShown(fresh.map((n) => String(n.id)));
      const dups = fresh.filter(isDuplicateNotice);
      const others = fresh.filter((n) => !isDuplicateNotice(n));
      if (dups.length) showDuplicates(dups);
      for (const n of others.slice(0, 3)) showDeduction(n);
    };

    // Poll fallback + initial unread check
    const poll = async () => {
      // Realtime already delivers new alerts; this is only a fallback, so skip it in background tabs.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/notifications/my-alerts?unread=true&limit=10', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        handle(j.notifications || []);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 300000); // realtime delivers new alerts; this is only a fallback

    // Realtime via Supabase (when publication enabled)
    try {
      channel = client.channel('deduction-alerts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
          const row = payload.new;
          if (row && row.user_id === user.id) handle([row]);
        })
        .subscribe();
    } catch {}

    return () => {
      clearInterval(interval);
      if (channel) try { client.removeChannel(channel); } catch {}
    };
  }, [user]);

  return null;
}

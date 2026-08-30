'use client';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Instant Deduction Notification Dispatcher
 * Listens for new payroll_deductions → notifications and pushes an instant toast/alert
 * per spec 4.B: Title, Deducted Amount, Clear Reason & KPI source, Timestamp, dashboard link
 */
export default function DeductionAlertProvider() {
  const { user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const client = createClient();
    let channel: ReturnType<typeof client.channel> | null = null;

    const showToast = (n: any) => {
      if (seenRef.current.has(n.id)) return;
      seenRef.current.add(n.id);
      toast.error(`${n.title || 'Deduction Alert'}: ${n.reason || n.message} — ${n.amount} EGP`, {
        description: `${n.message || n.reason || ''} • ${new Date(n.created_at).toLocaleString()} • Tap to view payroll`,
        duration: 8000,
        action: {
          label: 'View payroll',
          onClick: () => { window.location.href = n.reference_link || '/admin?tab=payroll'; },
        },
      });
    };

    // Poll fallback + initial unread check
    const poll = async () => {
      try {
        const res = await fetch('/api/notifications/my-alerts?unread=true&limit=10', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        for (const n of j.notifications || []) showToast(n);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 15000);

    // Realtime via Supabase (when publication enabled)
    try {
      channel = client.channel('deduction-alerts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
          const row = payload.new;
          if (row && row.user_id === user.id) showToast(row);
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

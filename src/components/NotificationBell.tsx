'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, UserPlus, AlarmClockOff, BellRing } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import type { AppNotification } from '@/app/api/notifications/route';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function timeAgo(iso: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<'unsupported' | 'denied' | 'granted' | 'idle'>('idle');
  const [pushBusy, setPushBusy] = useState(false);
  const lastReadRef = useRef<string>('');

  useEffect(() => {
    try {
      lastReadRef.current = localStorage.getItem('brokly:notif-lastread') || '';
    } catch {
      // ignore — storage unavailable (SSR / privacy mode)
    }
  }, []);

  // Detect the current browser push permission (phone PWA or desktop).
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setPushState('unsupported');
      return;
    }
    const readPerm = () =>
      setPushState(
        typeof Notification !== 'undefined' && Notification.permission === 'granted'
          ? 'granted'
          : 'denied'
      );
    readPerm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enablePush = async () => {
    if (pushBusy || pushState === 'unsupported') return;
    setPushBusy(true);
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setPushState('denied');
          return;
        }
      }
      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) return;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setPushState('granted');
    } catch {
      setPushState('denied');
    } finally {
      setPushBusy(false);
    }
  };

  // Send ourselves a phone push for newly-due follow-ups, throttled to once a
  // day so the 30s poll can't spam the device.
  const pushDueReminders = useCallback(
    async (list: AppNotification[]) => {
      const due = list.filter((n) => n.type === 'reminder');
      if (due.length === 0) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const key = `brokly:push-remind-${today}`;
        if (localStorage.getItem(key)) return;
        const res = await fetch(`/api/push/send?target=${encodeURIComponent(user?.id || '')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${due.length} follow-up${due.length > 1 ? 's' : ''} need attention`,
            body: due[0].text || 'You have a follow-up due today.',
            url: '/',
            tag: 'brokly-reminders',
          }),
        });
        const json = await res.json();
        if (json && json.reason !== 'no_subscription') localStorage.setItem(key, '1');
      } catch {
        // ignore
      }
    },
    [user?.id]
  );

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const json = await res.json();
      const list = Array.isArray(json.notifications) ? json.notifications : [];
      setItems(list);
      if (pushState === 'granted') pushDueReminders(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, pushState, pushDueReminders]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Realtime refresh (graceful fallback to 30s polling when publication is off).
  useEffect(() => {
    if (!user) return;
    const client = createClient();
    let channel: ReturnType<typeof client.channel> | null = null;
    try {
      channel = client
        .channel('notif-bell')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () =>
          load()
        )
        .subscribe();
    } catch {
      // realtime unavailable — polling covers updates
    }
    const poll = setInterval(load, 30000);
    return () => {
      clearInterval(poll);
      if (channel) client.removeChannel(channel);
    };
  }, [user, load]);

  const unreadCount = items.filter((n) => n.createdAt > lastReadRef.current).length;

  const openPanel = () => {
    setOpen((o) => !o);
    lastReadRef.current = new Date().toISOString();
    localStorage.setItem('brokly:notif-lastread', lastReadRef.current);
  };

  const iconFor = (type: string) =>
    type === 'assignment' ? (
      <UserPlus size={16} className="text-primary flex-shrink-0" />
    ) : (
      <AlarmClockOff size={16} className="text-amber-500 flex-shrink-0" />
    );

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      <button
        onClick={openPanel}
        className="btn-ghost p-2 rounded-lg relative"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {hasUnread && (
          <span className="absolute top-1 right-1 flex h-2 min-w-2 items-center justify-center rounded-full bg-accent px-0.5 text-[8px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={openPanel} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] bg-card border border-border rounded-xl shadow-modal z-50 fade-in overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <h3 className="text-sm font-semibold text-foreground">{t('common.notifications')}</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  lastReadRef.current = new Date().toISOString();
                  localStorage.setItem('brokly:notif-lastread', lastReadRef.current);
                }}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                <CheckCheck size={12} />
                {t('common.markAllRead')}
              </button>
            </div>
            <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
              {pushState === 'unsupported' ? (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <BellRing size={12} />
                  Phone notifications aren&apos;t supported in this browser.
                </p>
              ) : pushState === 'granted' ? (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1.5 font-medium">
                  <BellRing size={12} />
                  Phone notifications are ON.
                </p>
              ) : (
                <button
                  onClick={enablePush}
                  disabled={pushBusy}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary/10 text-primary text-xs font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {pushBusy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <BellRing size={12} />
                  )}
                  {pushState === 'denied'
                    ? 'Notifications blocked — allow in browser settings'
                    : 'Enable phone notifications'}
                </button>
              )}
            </div>
            <ul className="overflow-y-auto flex-1">
              {loading ? (
                <li className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Loading…
                </li>
              ) : items.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  You&apos;re all caught up
                </li>
              ) : (
                items.map((n) => {
                  const unread = n.createdAt > lastReadRef.current;
                  return (
                    <li
                      key={n.id}
                      className={`px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${unread ? 'bg-secondary/30' : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        {iconFor(n.type)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">{n.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{n.text}</p>
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

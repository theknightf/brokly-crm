'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, UserPlus, AlarmClockOff, BellRing, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';

export interface AppNotification {
  id: string;
  type: 'assignment' | 'reminder' | 'task' | 'action';
  title: string;
  text: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

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
  const [pushState, setPushState] = useState<
    'unsupported' | 'default' | 'denied' | 'granted' | 'idle'
  >('idle');
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
        typeof Notification === 'undefined'
          ? 'unsupported'
          : Notification.permission === 'granted'
            ? 'granted'
            : Notification.permission === 'denied'
              ? 'denied'
              : 'default'
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
      // Read the feed directly with the same browser client used everywhere in
      // the app (RLS still scopes rows to the signed-in user). Reading via the
      // server API route is unreliable here because that route authenticates
      // with cookies while this app stores its session in localStorage.
      const client = createClient();
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const list: AppNotification[] = [];

      // 1) Leads directly assigned to this user — query the leads table directly
      //    (the activity_log 'Lead Assigned' trigger doesn't exist in the DB so
      //     the old query always returned zero rows).
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: assignedLeads } = await client
        .from('leads')
        .select('id, name, crm_status, lead_status, updated_at, created_at, assigned_to')
        .eq('assigned_to', user.id)
        .gte('updated_at', sevenDaysAgo)
        .order('updated_at', { ascending: false })
        .limit(15);

      for (const lead of assignedLeads || []) {
        list.push({
          id: `ass-lead-${lead.id}`,
          type: 'assignment',
          title: 'Lead assigned to you',
          text: (lead.name as string) || 'A lead has been assigned to you',
          entityType: 'lead',
          entityId: lead.id as string,
          createdAt:
            (lead.updated_at as string) || (lead.created_at as string) || new Date().toISOString(),
        });
      }

      // 2) Reminders from follow-ups that are actionable & due today/overdue.
      const { data: profile } = await client
        .from('user_profiles')
        .select('id, full_name, email')
        .eq('id', user.id)
        .single();
      const { data: dueFollowUps } = await client
        .from('follow_ups')
        .select('id, title, contact_name, due_date, due_time, follow_up_status, agent, created_by')
        .lte('due_date', tomorrow)
        .not('follow_up_status', 'in', '("Completed","Cancelled")')
        .order('due_date', { ascending: true })
        .limit(100);

      for (const f of dueFollowUps || []) {
        const mine =
          f.created_by === user.id ||
          (profile && f.agent && profile.full_name && f.agent === profile.full_name);
        if (!mine) continue;
        const due = String(f.due_date || '');
        const overdue = due < today;
        const isToday = due === today;
        if (!overdue && !isToday) continue;
        list.push({
          id: `rem-${f.id}-${due}`,
          type: 'reminder',
          title: overdue ? 'Overdue follow-up' : 'Follow-up due today',
          text: f.title || `Follow up with ${f.contact_name || 'contact'}`,
          entityType: 'follow_up',
          entityId: f.id,
          createdAt: new Date(`${due}T00:00:00`).toISOString(),
        });
      }

      // 3) Field actions: today's minutes/site-visit log for this user so the
      //    bell doubles as a lightweight activity feed (e.g. "Started a site visit").
      const { data: mySiteVisits } = await client
        .from('site_visits')
        .select('id, project_name, check_in_at, check_out_at')
        .eq('user_id', user.id)
        .gte('check_in_at', `${today}T00:00:00`)
        .order('check_in_at', { ascending: false })
        .limit(10);

      for (const v of mySiteVisits || []) {
        const ended = v.check_out_at != null;
        const ts = new Date(v.check_in_at || new Date().toISOString()).toISOString();
        list.push({
          id: `visit-${v.id}`,
          type: 'task',
          title: ended ? 'Site visit ended' : 'Site visit in progress',
          text: v.project_name
            ? `${v.project_name}${ended ? ' — visit completed' : ' — GPS logged'}`
            : ended
              ? 'Site visit completed'
              : 'You started a site visit',
          entityType: 'site_visit',
          entityId: v.id,
          createdAt: ts,
        });
      }

      // 4) Push notification for newly assigned leads (throttled per lead id)
      const newAssignments = (assignedLeads || []).filter(
        (a) =>
          ((a.updated_at as string) || (a.created_at as string) || '') >
          (lastReadRef.current || '2000-01-01')
      );
      if (newAssignments.length > 0 && pushState === 'granted') {
        try {
          const a = newAssignments[0];
          const pushedKey = `brokly:pushed-lead-${a.id}`;
          if (!localStorage.getItem(pushedKey)) {
            const res = await fetch(`/api/push/send?target=${encodeURIComponent(user.id)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title:
                  newAssignments.length > 1
                    ? `${newAssignments.length} leads assigned to you`
                    : 'New lead assigned to you',
                body: (a.name as string) || 'A lead has been assigned to you',
                url: '/leads-management',
                tag: 'brokly-assignment',
              }),
            });
            // Only throttle when the push was actually delivered or attempted
            // for a real subscription; otherwise retry once one exists.
            const json = await res.json().catch(() => null);
            if (!json || json.reason !== 'no_subscription') {
              localStorage.setItem(pushedKey, '1');
            }
          }
        } catch {
          // ignore
        }
      }

      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
      const refresh = () => load();
      channel = client
        .channel('notif-bell')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'activity_log' },
          refresh
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'follow_ups' }, refresh)
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
    ) : type === 'task' || type === 'action' ? (
      <MapPin size={16} className="text-violet-500 flex-shrink-0" />
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
                    : pushState === 'default'
                      ? 'Enable phone notifications'
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

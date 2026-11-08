'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlarmClock,
  CheckCheck,
  Clock,
  Copy,
  Flame,
  Hourglass,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  StickyNote,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { followUpsService } from '@/lib/services/crmService';
import type { FollowUp } from './mockFollowUps';

/* ──────────────────────────────────────────────────────────────────────────
   Follow-up cockpit.
   POV: a follow-up is a deal-acceleration cockpit, not an archive.
   - Context precedes action: every card says WHY (last trigger), WHAT CHANGED (stage / value / decay)
     and the exact NEXT MOVE before it shows any button.
   - Momentum over maintenance: the queue is ordered by leverage (hot first, then fading), and the
     commonest moves are one click (call, WhatsApp with a ready message, snooze with a reason).
   All numbers come from real data (due date, lead stage, last call, last action, budget). Nothing is invented:
   the "message draft" is a template filled from the lead's fields, not a generated text.
   ────────────────────────────────────────────────────────────────────────── */

const HOT_STAGES = new Set(['Meeting', 'Interested', 'Reservation', 'Negotiation', 'Site Visit', 'Reservations']);
const AWAITING_RE = /no answer|busy|unreach|voicemail|not reachable|switched off/i;

type Heat = 'hot' | 'awaiting' | 'stalled' | 'normal';
type QuickFilter = 'all' | Heat;
type DrawerMode = 'message' | 'note' | 'snooze';

const SNOOZE_REASONS = [
  'Lead asked to be called later',
  'No answer — retry',
  'Waiting for documents / decision',
  'Travelling / unavailable',
  'Other',
];

/** Cairo calendar day as YYYY-MM-DD. */
function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayDiff(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
}

interface Signal {
  heat: Heat;
  daysOverdue: number; // > 0 when late
  daysToDue: number; // >= 0 when not late
  touchDays: number | null; // days since the last contact, null = never recorded
  health: number; // 0-100, decays with silence
  why: string;
  next: string;
}

function signalFor(fu: FollowUp, today: string): Signal {
  const due = (fu.dueDate || '').slice(0, 10);
  const diff = due ? dayDiff(today, due) : 0;
  const daysOverdue = Math.max(0, diff);
  const daysToDue = Math.max(0, -diff);

  const touchIso = [fu.lastCallAt, fu.lastActionAt].filter(Boolean).sort().pop() || null;
  const touchDays = touchIso ? Math.max(0, Math.floor((Date.now() - new Date(touchIso).getTime()) / 86400000)) : null;

  const awaiting = AWAITING_RE.test(fu.lastCallOutcome || '') || /no answer/i.test(fu.leadStatus || '');
  const hot = HOT_STAGES.has(fu.leadStatus || '') || fu.priority === 'High';
  const stalled = (touchDays !== null && touchDays >= 7) || daysOverdue >= 3;

  // Order matters: a hot lead that went quiet is still "hot" (that is where the leverage is).
  const heat: Heat = hot ? 'hot' : awaiting ? 'awaiting' : stalled ? 'stalled' : 'normal';

  // Health decays 8 points per silent day, plus 6 per overdue day; floor 5.
  const decay = (touchDays ?? 10) * 8 + daysOverdue * 6;
  const health = Math.max(5, Math.min(100, 100 - decay));

  const lastCall = fu.lastCallAt
    ? `Last call ${fu.lastCallOutcome ? `“${fu.lastCallOutcome}” ` : ''}${touchDays === 0 ? 'today' : `${touchDays}d ago`}`
    : fu.lastActionAt
      ? `Last action ${touchDays === 0 ? 'today' : `${touchDays}d ago`}`
      : 'No contact recorded yet';

  const next =
    heat === 'hot'
      ? 'Confirm the next step now: meeting time or send options'
      : heat === 'awaiting'
        ? 'Retry the call, then follow with a WhatsApp message'
        : heat === 'stalled'
          ? 'Re-engage with something new: a unit, a price, or an offer'
          : 'Call to confirm interest and set the next date';

  return { heat, daysOverdue, daysToDue, touchDays, health, why: lastCall, next };
}

/* ── Message templates (filled from real fields) ─────────────────────────── */
type Tone = 'friendly' | 'direct' | 'formal';
type Lang = 'en' | 'ar';

function buildTemplate(fu: FollowUp, sig: Signal, tone: Tone, lang: Lang): string {
  const first = (fu.contactName || '').trim().split(/\s+/)[0] || (lang === 'ar' ? 'حضرتك' : 'there');
  const me = (fu.agent || '').trim() || (lang === 'ar' ? 'مستشارك العقاري' : 'your advisor');
  const project = (fu.propertyInterest || '').trim();
  if (lang === 'ar') {
    const about = project ? ` بخصوص ${project}` : '';
    if (sig.heat === 'awaiting')
      return tone === 'formal'
        ? `السيد/ة ${first}، حاولت الاتصال بحضرتك${about}. برجاء تحديد الوقت المناسب للتواصل.`
        : tone === 'direct'
          ? `أهلاً ${first}، اتصلت بيك${about} ومردتش. قولي وقت مناسب أكلمك فيه النهاردة؟`
          : `أهلاً ${first} 👋 أنا ${me} من Brokly. حاولت أكلمك${about}، تحب أكلمك أمتى؟`;
    if (sig.heat === 'hot')
      return tone === 'formal'
        ? `السيد/ة ${first}، أود تأكيد الخطوة التالية${about}. ما هو الموعد المناسب لحضرتك؟`
        : tone === 'direct'
          ? `أهلاً ${first}، نأكد الميعاد${about}؟ ابعتلي الوقت المناسب وأنا هرتب كل حاجة.`
          : `أهلاً ${first} 👋 أنا ${me}. جاهزين نكمل${about} — إيه الوقت اللي يناسبك نتقابل أو نتكلم؟`;
    return tone === 'formal'
      ? `السيد/ة ${first}، أتمنى أن تكون بخير. أتابع مع حضرتك${about}. هل يناسبك التحدث قريباً؟`
      : tone === 'direct'
        ? `أهلاً ${first}، لسه مهتم${about ? ' ' + about.trim() : ''}؟ رد بـ "أيوه" وأبعتلك الخيارات المتاحة.`
        : `أهلاً ${first} 👋 أنا ${me} من Brokly. حبيت أطمن عليك${about} — تحب أبعتلك آخر التفاصيل؟`;
  }
  const about = project ? ` about ${project}` : '';
  if (sig.heat === 'awaiting')
    return tone === 'formal'
      ? `Dear ${first}, I tried to reach you${about}. Please let me know a convenient time to speak.`
      : tone === 'direct'
        ? `Hi ${first}, I called you${about} and couldn't get through. When is a good time today?`
        : `Hi ${first} 👋 it's ${me} from Brokly. I tried calling${about}. When would be a good time to reach you?`;
  if (sig.heat === 'hot')
    return tone === 'formal'
      ? `Dear ${first}, I would like to confirm our next step${about}. Which time suits you best?`
      : tone === 'direct'
        ? `Hi ${first}, let's lock in the next step${about}. Send me a time and I'll arrange everything.`
        : `Hi ${first} 👋 it's ${me}. Ready to move forward${about}. What time works for a quick meeting or call?`;
  return tone === 'formal'
    ? `Dear ${first}, I hope you are well. I am following up${about}. Would you be available to speak soon?`
    : tone === 'direct'
      ? `Hi ${first}, are you still interested${project ? ` in ${project}` : ''}? Reply YES and I'll send the available options.`
      : `Hi ${first} 👋 it's ${me} from Brokly. Just checking in${about} — shall I send the latest details?`;
}

function waLink(phone: string, text: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('01') && digits.length === 11) digits = `2${digits}`; // Egyptian mobile -> +20
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/* ── Writes ──────────────────────────────────────────────────────────────── */
function appendNote(old: string | undefined, line: string): string {
  const stamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  return [old?.trim(), `[${stamp}] ${line}`].filter(Boolean).join('\n');
}

/** Moves a follow-up to a new date. Lead-linked rows go through the API so the lead's follow_up_due stays in sync. */
async function rescheduleFollowUp(fu: FollowUp, dueDate: string, dueTime: string, reason: string) {
  const notes = appendNote(fu.notes, `Snoozed to ${dueDate}${reason ? ` — ${reason}` : ''}`);
  if (fu.leadId) {
    const res = await fetch('/api/follow-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fu.title || `Follow up: ${fu.contactName}`,
        contactName: fu.contactName,
        contactType: fu.contactType,
        contactPhone: fu.contactPhone,
        contactEmail: fu.contactEmail,
        type: fu.type,
        status: 'Pending',
        priority: fu.priority,
        dueDate,
        dueTime,
        agent: fu.agent,
        agentInitials: fu.agentInitials,
        notes,
        propertyInterest: fu.propertyInterest,
        relationshipStatus: fu.relationshipStatus,
        leadId: fu.leadId,
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not reschedule');
    return;
  }
  await followUpsService.update(fu.id, { ...fu, dueDate, dueTime, status: 'Pending', notes });
}

/** Closes a follow-up and clears the lead's follow-up date so it is not recreated by the sync. */
async function completeFollowUp(fu: FollowUp) {
  await followUpsService.updateStatus(fu.id, 'Completed', new Date().toISOString());
  if (fu.leadId) {
    try {
      await createClient().from('leads').update({ follow_up_due: null }).eq('id', fu.leadId);
    } catch {
      // The follow-up is closed either way.
    }
  }
}

/* ── Small UI pieces ─────────────────────────────────────────────────────── */
const HEAT_META: Record<Heat, { label: string; cls: string; icon: React.ReactNode } | null> = {
  hot: { label: 'Hot signal', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', icon: <Flame size={11} /> },
  awaiting: {
    label: 'Awaiting reply',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    icon: <Hourglass size={11} />,
  },
  stalled: {
    label: 'Stalled',
    cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',
    icon: <Activity size={11} />,
  },
  normal: null,
};

function HealthMeter({ health, touchDays }: { health: number; touchDays: number | null }) {
  const color = health >= 65 ? 'bg-emerald-500' : health >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div
      className="min-w-[120px]"
      title="Deal health: drops with every day without contact and every day past due"
    >
      <div className="flex items-center justify-between text-[10.5px] text-muted-foreground mb-1">
        <span>Deal health</span>
        <span className="tabular-nums font-semibold">{health}</span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={health}
        aria-label="Deal health"
        className="h-1.5 rounded-full bg-muted overflow-hidden"
      >
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${health}%` }} />
      </div>
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        {touchDays === null ? 'No contact yet' : touchDays === 0 ? 'Touched today' : `${touchDays}d without contact`}
      </p>
    </div>
  );
}

function formatTime12(t?: string | null) {
  if (!t || !t.includes(':')) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/* ── Cockpit ─────────────────────────────────────────────────────────────── */
interface Props {
  items: FollowUp[];
  onChanged: () => void | Promise<void>;
  onOpenLead: (leadId: string) => void;
  onEdit: (fu: FollowUp) => void;
}

export default function FollowUpCockpit({ items, onChanged, onOpenLead, onEdit }: Props) {
  const today = cairoToday();
  const [quick, setQuick] = useState<QuickFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ id: string; mode: DrawerMode } | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const open = useMemo(
    () =>
      items
        .filter((f) => f.status !== 'Completed' && f.status !== 'Cancelled' && !hidden.has(f.id))
        .map((fu) => ({ fu, sig: signalFor(fu, today) })),
    [items, hidden, today]
  );

  const counts = useMemo(() => {
    const c: Record<QuickFilter, number> = { all: open.length, hot: 0, awaiting: 0, stalled: 0, normal: 0 };
    for (const { sig } of open) c[sig.heat]++;
    return c;
  }, [open]);

  const visible = useMemo(() => open.filter(({ sig }) => quick === 'all' || sig.heat === quick), [open, quick]);

  // The queue, ordered by leverage: hot first, then fading, then today, then what is scheduled.
  const groups = useMemo(() => {
    const byDue = (a: { fu: FollowUp }, b: { fu: FollowUp }) =>
      `${a.fu.dueDate} ${a.fu.dueTime || ''}`.localeCompare(`${b.fu.dueDate} ${b.fu.dueTime || ''}`);
    const hot = visible.filter((x) => x.sig.heat === 'hot' && x.sig.daysToDue === 0).sort(byDue);
    const rest = visible.filter((x) => !hot.includes(x));
    const fading = rest.filter((x) => x.sig.daysOverdue > 0).sort((a, b) => a.sig.health - b.sig.health);
    const todayList = rest.filter((x) => x.sig.daysOverdue === 0 && x.sig.daysToDue === 0).sort(byDue);
    const scheduled = rest.filter((x) => x.sig.daysToDue > 0).sort(byDue);
    return [
      { key: 'hot', title: 'Hot signals', hint: 'High leverage, act first', icon: <Flame size={14} />, rows: hot },
      { key: 'fading', title: 'Overdue / Fading', hint: 'Losing momentum every day', icon: <AlarmClock size={14} />, rows: fading },
      { key: 'today', title: 'Due today', hint: 'On the plan', icon: <Clock size={14} />, rows: todayList },
      { key: 'scheduled', title: 'Scheduled', hint: 'Coming up', icon: <Zap size={14} />, rows: scheduled },
    ].filter((g) => g.rows.length > 0);
  }, [visible]);

  // 1-4 switch the quick filter; Esc closes the drawer. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') setDrawer(null);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, QuickFilter> = { '1': 'all', '2': 'hot', '3': 'awaiting', '4': 'stalled' };
      if (map[e.key]) setQuick(map[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const hide = (ids: string[]) => setHidden((h) => new Set([...h, ...ids]));

  const doComplete = useCallback(
    async (fus: FollowUp[]) => {
      if (!fus.length || busy) return;
      setBusy(true);
      hide(fus.map((f) => f.id));
      try {
        for (const fu of fus) await completeFollowUp(fu);
        toast.success(fus.length === 1 ? `Done: ${fus[0].contactName}` : `${fus.length} follow-ups completed`);
        setSelected(new Set());
        await onChanged();
      } catch (e: any) {
        toast.error(e?.message || 'Could not complete');
        await onChanged();
      } finally {
        setBusy(false);
      }
    },
    [busy, onChanged]
  );

  const doSnooze = useCallback(
    async (fus: FollowUp[], date: string, time: string, reason: string) => {
      if (!fus.length || busy) return;
      setBusy(true);
      try {
        for (const fu of fus) await rescheduleFollowUp(fu, date, time, reason);
        hide(fus.map((f) => f.id)); // they come back in the right bucket after the refresh
        toast.success(fus.length === 1 ? `Snoozed to ${date}` : `${fus.length} follow-ups snoozed to ${date}`);
        setSelected(new Set());
        setDrawer(null);
        await onChanged();
        setHidden(new Set());
      } catch (e: any) {
        toast.error(e?.message || 'Could not snooze');
      } finally {
        setBusy(false);
      }
    },
    [busy, onChanged]
  );

  const drawerItem = drawer ? open.find((x) => x.fu.id === drawer.id) || null : null;
  const selectedItems = open.filter((x) => selected.has(x.fu.id)).map((x) => x.fu);

  return (
    <div className="space-y-4">
      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Quick filters">
        {(
          [
            ['all', 'All', '1', null],
            ['hot', 'Hot', '2', <Flame key="f" size={12} />],
            ['awaiting', 'Awaiting reply', '3', <Hourglass key="h" size={12} />],
            ['stalled', 'Stalled', '4', <Activity key="a" size={12} />],
          ] as [QuickFilter, string, string, React.ReactNode][]
        ).map(([key, label, hotkey, icon]) => (
          <button
            key={key}
            type="button"
            aria-pressed={quick === key}
            onClick={() => setQuick(key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              quick === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            {icon}
            {label}
            <span className="tabular-nums opacity-80">{counts[key]}</span>
            <kbd className="hidden sm:inline rounded border border-current/20 px-1 text-[9px] opacity-60">{hotkey}</kbd>
          </button>
        ))}
        {visible.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setSelected((s) => (s.size === visible.length ? new Set() : new Set(visible.map((x) => x.fu.id))))
            }
            className="ms-auto text-xs text-muted-foreground hover:text-foreground"
          >
            {selected.size === visible.length ? 'Clear selection' : 'Select all shown'}
          </button>
        )}
      </div>

      {/* Bulk triage bar */}
      {selectedItems.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-sm font-semibold tabular-nums">{selectedItems.length} selected</span>
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            disabled={busy}
            onClick={() => doSnooze(selectedItems, addDays(today, 1), '10:00', 'Bulk snooze')}
            className="btn-secondary !py-1.5 text-xs"
          >
            Snooze to tomorrow
          </button>
          <button
            disabled={busy}
            onClick={() => doSnooze(selectedItems, addDays(today, 3), '10:00', 'Bulk snooze')}
            className="btn-secondary !py-1.5 text-xs"
          >
            +3 days
          </button>
          <button disabled={busy} onClick={() => doComplete(selectedItems)} className="btn-primary !py-1.5 text-xs">
            Mark done
          </button>
          <button onClick={() => setSelected(new Set())} className="ms-auto text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      {/* Action stream */}
      {groups.length === 0 ? (
        <div className="card-base flex flex-col items-center justify-center py-16 text-center">
          <CheckCheck size={40} className="mb-3 text-emerald-500 opacity-70" />
          <p className="text-base font-semibold text-foreground">
            {quick === 'all' ? 'Queue clear' : 'Nothing in this view'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {quick === 'all'
              ? 'No open follow-ups match your filters.'
              : 'Try another quick filter or clear the filters above.'}
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-muted-foreground">{g.icon}</span>
              <h2 className="text-sm font-bold text-foreground">{g.title}</h2>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {g.rows.length}
              </span>
              <span className="text-xs text-muted-foreground">{g.hint}</span>
            </div>
            <div className="space-y-2">
              {g.rows.map(({ fu, sig }) => (
                <Card
                  key={fu.id}
                  fu={fu}
                  sig={sig}
                  checked={selected.has(fu.id)}
                  notesOpen={expandedNotes.has(fu.id)}
                  onToggleNotes={() =>
                    setExpandedNotes((s) => {
                      const n = new Set(s);
                      if (n.has(fu.id)) n.delete(fu.id);
                      else n.add(fu.id);
                      return n;
                    })
                  }
                  onCheck={() => toggleSel(fu.id)}
                  onDrawer={(mode) => setDrawer({ id: fu.id, mode })}
                  onDone={() => doComplete([fu])}
                  onOpenLead={onOpenLead}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Action drawer */}
      {drawer && drawerItem && (
        <Drawer
          key={`${drawer.id}-${drawer.mode}`}
          fu={drawerItem.fu}
          sig={drawerItem.sig}
          mode={drawer.mode}
          today={today}
          busy={busy}
          onMode={(mode) => setDrawer({ id: drawer.id, mode })}
          onClose={() => setDrawer(null)}
          onSnooze={(date, time, reason) => doSnooze([drawerItem.fu], date, time, reason)}
          onNoteSaved={async () => {
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */
function Card({
  fu,
  sig,
  checked,
  notesOpen,
  onToggleNotes,
  onCheck,
  onDrawer,
  onDone,
  onOpenLead,
  onEdit,
}: {
  fu: FollowUp;
  sig: Signal;
  checked: boolean;
  notesOpen: boolean;
  onToggleNotes: () => void;
  onCheck: () => void;
  onDrawer: (m: DrawerMode) => void;
  onDone: () => void;
  onOpenLead: (id: string) => void;
  onEdit: (fu: FollowUp) => void;
}) {
  const late = sig.daysOverdue > 0;
  const heat = HEAT_META[sig.heat];
  const stripe = late ? 'bg-red-500' : sig.heat === 'hot' ? 'bg-orange-500' : sig.daysToDue === 0 ? 'bg-amber-500' : 'bg-sky-500';
  const dueLabel = late
    ? `Overdue ${sig.daysOverdue}d`
    : sig.daysToDue === 0
      ? `Today ${formatTime12(fu.dueTime)}`.trim()
      : `In ${sig.daysToDue}d · ${formatTime12(fu.dueTime)}`.replace(/ · $/, '');
  const phone = fu.leadPhone || fu.contactPhone || '';
  const longNote = (fu.notes || '').length > 140 || (fu.notes || '').includes('\n');

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t !== e.currentTarget) return; // keys typed in inner controls are theirs
    if (e.key === 'Enter') onDrawer('message');
    else if (e.key === 'n') onDrawer('note');
    else if (e.key === 's') onDrawer('snooze');
    else if (e.key === 'd') onDone();
    else if (e.key === ' ') {
      e.preventDefault();
      onCheck();
    }
  };

  return (
    <article
      tabIndex={0}
      onKeyDown={onKey}
      aria-label={`${fu.contactName}, ${dueLabel}`}
      className={`group relative flex overflow-hidden rounded-xl border bg-card transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary/40 hover:shadow-md ${
        checked ? 'border-primary ring-1 ring-primary/40' : 'border-border'
      }`}
    >
      <span className={`w-1 shrink-0 ${stripe}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 sm:flex-row sm:items-start">
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          aria-label={`Select ${fu.contactName}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary,#84cc16)]"
        />

        {/* Context: WHY / WHAT CHANGED / NEXT MOVE */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {fu.leadId ? (
              <button
                type="button"
                onClick={() => onOpenLead(fu.leadId!)}
                className="truncate text-sm font-bold text-foreground hover:text-primary hover:underline"
              >
                {fu.contactName}
              </button>
            ) : (
              <span className="truncate text-sm font-bold text-foreground">{fu.contactName}</span>
            )}
            {fu.leadStatus && (
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                {fu.leadStatus}
              </span>
            )}
            {heat && (
              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${heat.cls}`}>
                {heat.icon}
                {heat.label}
              </span>
            )}
            {fu.priority === 'High' && (
              <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">High</span>
            )}
            {fu.budgetMax ? (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                up to {Intl.NumberFormat('en', { notation: 'compact' }).format(fu.budgetMax)} EGP
              </span>
            ) : null}
          </div>

          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold text-muted-foreground">Why now</dt>
            <dd className="text-foreground">
              {sig.why}
              {fu.propertyInterest ? <span className="text-muted-foreground"> · {fu.propertyInterest}</span> : null}
            </dd>
            <dt className="font-semibold text-muted-foreground">Next move</dt>
            <dd className="flex items-start gap-1 font-medium text-foreground">
              <Sparkles size={12} className="mt-0.5 shrink-0 text-primary" />
              {sig.next}
            </dd>
          </dl>

          {fu.notes && (
            <div className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              <p className={`whitespace-pre-line ${notesOpen ? '' : 'line-clamp-2'}`}>{fu.notes}</p>
              {longNote && (
                <button type="button" onClick={onToggleNotes} className="mt-0.5 font-semibold text-primary hover:underline">
                  {notesOpen ? 'Show less' : 'Show full note'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Momentum + actions */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-[190px] sm:flex-col sm:items-stretch">
          <div className="space-y-2">
            <p className={`flex items-center gap-1 text-xs font-bold ${late ? 'text-red-500' : 'text-foreground'}`}>
              <Clock size={12} />
              {dueLabel}
            </p>
            <HealthMeter health={sig.health} touchDays={sig.touchDays} />
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Actions">
            {phone && (
              <a
                href={`tel:${phone}`}
                title="Call"
                aria-label={`Call ${fu.contactName}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Phone size={15} />
              </a>
            )}
            <button
              type="button"
              onClick={() => onDrawer('message')}
              title="Message (ready-made draft)"
              aria-label="Open message draft"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 text-emerald-600 transition hover:bg-emerald-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400"
            >
              <MessageCircle size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDrawer('note')}
              title="Log a note (n)"
              aria-label="Log a note"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StickyNote size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDrawer('snooze')}
              title="Snooze with a reason (s)"
              aria-label="Snooze"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AlarmClock size={15} />
            </button>
            <button
              type="button"
              onClick={onDone}
              title="Mark done (d)"
              aria-label="Mark done"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-emerald-600 transition hover:bg-emerald-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400"
            >
              <CheckCheck size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onEdit(fu)}
            className="hidden text-[11px] text-muted-foreground hover:text-foreground sm:block sm:text-end"
          >
            Edit details
          </button>
        </div>
      </div>
    </article>
  );
}

/* ── Drawer ──────────────────────────────────────────────────────────────── */
function Drawer({
  fu,
  sig,
  mode,
  today,
  busy,
  onMode,
  onClose,
  onSnooze,
  onNoteSaved,
}: {
  fu: FollowUp;
  sig: Signal;
  mode: DrawerMode;
  today: string;
  busy: boolean;
  onMode: (m: DrawerMode) => void;
  onClose: () => void;
  onSnooze: (date: string, time: string, reason: string) => void;
  onNoteSaved: () => void | Promise<void>;
}) {
  const [tone, setTone] = useState<Tone>('friendly');
  const [lang, setLang] = useState<Lang>('ar');
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState(SNOOZE_REASONS[0]);
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState('10:00');
  const firstFocus = useRef<HTMLButtonElement>(null);

  // Regenerate the draft when tone/language changes, unless the agent has already edited it by hand.
  useEffect(() => {
    if (!touched) setText(buildTemplate(fu, sig, tone, lang));
  }, [tone, lang, touched, fu, sig]);

  useEffect(() => {
    firstFocus.current?.focus();
  }, [mode]);

  const phone = fu.leadPhone || fu.contactPhone || '';

  const saveNote = async () => {
    if (!note.trim() || saving) return;
    setSaving(true);
    try {
      await followUpsService.update(fu.id, { ...fu, notes: appendNote(fu.notes, note.trim()) });
      toast.success('Note saved');
      setNote('');
      await onNoteSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the note');
    } finally {
      setSaving(false);
    }
  };

  const quickDates: [string, string][] = [
    ['Tomorrow', addDays(today, 1)],
    ['In 3 days', addDays(today, 3)],
    ['Next week', addDays(today, 7)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Actions for ${fu.contactName}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" tabIndex={-1} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-s border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-foreground">{fu.contactName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[fu.leadStatus, sig.why].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-1 border-b border-border px-3 pt-2" role="tablist">
          {(
            [
              ['message', 'Message', <Send key="m" size={13} />],
              ['note', 'Log note', <StickyNote key="n" size={13} />],
              ['snooze', 'Snooze', <AlarmClock key="s" size={13} />],
            ] as [DrawerMode, string, React.ReactNode][]
          ).map(([key, label, icon]) => (
            <button
              key={key}
              ref={key === mode ? firstFocus : undefined}
              role="tab"
              aria-selected={mode === key}
              onClick={() => onMode(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                mode === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {mode === 'message' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Tone">
                  {(['friendly', 'direct', 'formal'] as Tone[]).map((t) => (
                    <button
                      key={t}
                      aria-pressed={tone === t}
                      onClick={() => {
                        setTouched(false);
                        setTone(t);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                        tone === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Language">
                  {(['ar', 'en'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      aria-pressed={lang === l}
                      onClick={() => {
                        setTouched(false);
                        setLang(l);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${
                        lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {l === 'ar' ? 'عربي' : 'EN'}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="input-base min-h-[140px] w-full resize-y text-sm"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                value={text}
                onChange={(e) => {
                  setTouched(true);
                  setText(e.target.value);
                }}
                aria-label="Message draft"
              />
              <p className="text-[11px] text-muted-foreground">
                Draft filled from the lead&apos;s name, project and last call. Edit freely before sending.
              </p>
              <div className="flex gap-2">
                <a
                  href={phone ? waLink(phone, text) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!phone}
                  className={`btn-primary flex flex-1 items-center justify-center gap-1.5 text-sm ${phone ? '' : 'pointer-events-none opacity-50'}`}
                >
                  <MessageCircle size={15} />
                  Send on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(text).then(
                      () => toast.success('Copied'),
                      () => toast.error('Could not copy')
                    );
                  }}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Copy size={14} />
                  Copy
                </button>
              </div>
              {!phone && <p className="text-xs text-red-500">No phone number on this lead.</p>}
            </>
          )}

          {mode === 'note' && (
            <>
              <textarea
                className="input-base min-h-[140px] w-full resize-y text-sm"
                placeholder="What happened, what did the lead say, what is the next step?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Note"
                autoFocus
              />
              <button
                type="button"
                disabled={!note.trim() || saving}
                onClick={saveNote}
                className="btn-primary w-full text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </>
          )}

          {mode === 'snooze' && (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs font-semibold text-muted-foreground">Why are you snoozing?</legend>
                {SNOOZE_REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      reason === r ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <input type="radio" name="snooze-reason" checked={reason === r} onChange={() => setReason(r)} />
                    {r}
                  </label>
                ))}
              </fieldset>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">New date</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {quickDates.map(([label, d]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={date === d}
                      onClick={() => setDate(d)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        date === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input-base"
                    value={date}
                    min={today}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Date"
                  />
                  <input type="time" className="input-base" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !date}
                onClick={() => onSnooze(date, time || '10:00', reason)}
                className="btn-primary w-full text-sm disabled:opacity-50"
              >
                {busy ? 'Saving…' : `Snooze to ${date}`}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

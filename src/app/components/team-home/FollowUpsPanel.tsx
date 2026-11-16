'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarCheck, Check, Loader2, MessageCircle, Phone, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { followUpsService } from '@/lib/services/crmService';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { formatCallChip, parseFollowUpNote } from '@/lib/followUpNote';
import { QuickNoteSheet } from '@/components/mobile/QuickNoteSheet';
import { useCallOutcome, type CallChannel } from '@/components/mobile/CallOutcomeSheet';
import { Card, EmptyState, ErrorState, Segmented, SectionHeader, SkeletonRows, useFmt } from './ui';
import { localToday, type FollowUp } from './useHomeData';

type Tab = 'today' | 'overdue' | 'upcoming';
const ROWS = 6;

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-400',
  urgent: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-zinc-400',
};

function useWhen() {
  const { lang, t } = useLanguage();
  return (date: string, time?: string) => {
    const today = localToday();
    let day: string;
    if (date === today) day = t('tl.fu.today');
    else {
      const d = new Date(`${date}T00:00:00`);
      day = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
    }
    if (time && /^\d{1,2}:\d{2}/.test(time)) {
      const [h, m] = time.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return `${day} · ${d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return day;
  };
}

export function FollowUpsPanel({
  items,
  loading,
  error,
  onRetry,
  onChanged,
}: {
  items: FollowUp[] | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const fmt = useFmt();
  const when = useWhen();
  const [tab, setTab] = useState<Tab>('today');
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<FollowUp | null>(null);
  const { arm, sheet } = useCallOutcome();

  const lists = useMemo(() => {
    const today = localToday();
    const open = (items || []).filter((f) => !doneIds.has(f.id));
    const byDue = (a: FollowUp, b: FollowUp) => `${a.dueDate} ${a.dueTime || ''}`.localeCompare(`${b.dueDate} ${b.dueTime || ''}`);
    return {
      today: open.filter((f) => f.dueDate === today).sort(byDue),
      overdue: open.filter((f) => f.dueDate < today).sort(byDue).reverse(), // most recently missed first
      upcoming: open.filter((f) => f.dueDate > today).sort(byDue),
    };
  }, [items, doneIds]);

  const rows = lists[tab].slice(0, ROWS);

  const complete = async (f: FollowUp) => {
    setBusyId(f.id);
    try {
      await followUpsService.updateStatus(f.id, 'Completed', new Date().toISOString());
      setDoneIds((s) => new Set(s).add(f.id));
      toast.success(t('tl.fu.completed'));
    } catch {
      toast.error(t('tl.fu.failed'));
    } finally {
      setBusyId(null);
    }
  };

  const armCall = (f: FollowUp, channel: CallChannel) =>
    arm({ id: f.id, contactName: f.contactName, contactPhone: f.contactPhone, entityType: 'follow_up', rescheduleId: f.id, projectName: f.propertyInterest }, channel);

  const iconBtn =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800';

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <SectionHeader
        title={t('tl.fu.title')}
        subtitle={t('tl.fu.subtitle')}
        action={
          <Link href={`/follow-ups?tab=${tab}`} className="inline-flex items-center gap-1 text-xs font-semibold text-lime-700 hover:underline dark:text-lime-400">
            {t('tl.fu.seeAll')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
          </Link>
        }
      />

      <Segmented<Tab>
        label={t('tl.fu.title')}
        value={tab}
        onChange={setTab}
        options={(['today', 'overdue', 'upcoming'] as const).map((k) => ({
          value: k,
          label: (
            <>
              {t(`tl.fu.${k}`)}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  k === 'overdue' && lists.overdue.length > 0 ? 'bg-red-400/15 text-red-500 dark:text-red-300' : 'bg-black/[0.06] dark:bg-zinc-700/60'
                }`}
              >
                {items ? fmt(lists[k].length) : '–'}
              </span>
            </>
          ),
        }))}
      />

      {loading && !items ? (
        <SkeletonRows rows={ROWS} />
      ) : error && !items ? (
        <ErrorState onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} text={t('tl.fu.empty')} />
      ) : (
        <ul className="-mx-2 divide-y divide-black/[0.06] dark:divide-zinc-800">
          {rows.map((f) => {
            const note = parseFollowUpNote(f.notes);
            const dot = PRIORITY_DOT[(f.priority || '').toLowerCase()] || 'bg-zinc-300 dark:bg-zinc-600';
            return (
              <li key={f.id} className="flex items-center gap-3 px-2 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={f.priority || undefined} aria-label={f.priority || undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    {f.leadId ? (
                      <Link href={`/leads-management?lead=${f.leadId}`} className="truncate text-sm font-medium text-foreground hover:underline">
                        {f.contactName}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium text-foreground">{f.contactName}</span>
                    )}
                    <span className={`shrink-0 text-[11px] tabular-nums ${tab === 'overdue' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {when(f.dueDate, f.dueTime)}
                    </span>
                  </div>
                  {(note.text || note.call) && (
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      {note.call && (
                        <span className="shrink-0 rounded-md bg-black/[0.05] px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {formatCallChip(note.call)}
                        </span>
                      )}
                      {note.text && <p className="truncate text-xs text-muted-foreground">{note.text}</p>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  {f.contactPhone ? (
                    <>
                      <a href={`tel:${f.contactPhone}`} onClick={() => armCall(f, 'Call')} className={iconBtn} aria-label={t('tl.fu.call')} title={t('tl.fu.call')}>
                        <Phone size={15} />
                      </a>
                      <a
                        href={getWhatsAppLinkForLead(f.contactPhone, f.contactName)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => armCall(f, 'WhatsApp')}
                        className={iconBtn}
                        aria-label={t('tl.fu.whatsapp')}
                        title={t('tl.fu.whatsapp')}
                      >
                        <MessageCircle size={15} />
                      </a>
                    </>
                  ) : (
                    <span className={`${iconBtn} cursor-not-allowed`} title={t('tl.fu.noPhone')} aria-label={t('tl.fu.noPhone')}>
                      <Phone size={15} className="opacity-40" />
                    </span>
                  )}
                  <button type="button" onClick={() => setNoteTarget(f)} className={iconBtn} aria-label={t('tl.fu.note')} title={t('tl.fu.note')}>
                    <StickyNote size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => complete(f)}
                    disabled={busyId === f.id}
                    className={`${iconBtn} hover:!text-lime-600 dark:hover:!text-lime-400`}
                    aria-label={t('tl.fu.done')}
                    title={t('tl.fu.done')}
                  >
                    {busyId === f.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <QuickNoteSheet
        open={noteTarget !== null}
        title={noteTarget ? `${t('tl.fu.note')} — ${noteTarget.contactName}` : t('tl.fu.note')}
        onClose={() => setNoteTarget(null)}
        onSave={async (text) => {
          if (!noteTarget) return;
          // Same behaviour as the previous widget: the follow-up's note field is replaced.
          await followUpsService.update(noteTarget.id, { notes: text });
          onChanged();
        }}
      />
      {sheet}
    </Card>
  );
}

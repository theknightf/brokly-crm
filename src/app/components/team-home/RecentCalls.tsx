'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { isAnsweredCall } from '@/lib/callOutcome';
import { Card, EmptyState, ErrorState, Segmented, SectionHeader, SkeletonRows, useAgo } from './ui';
import { rangeWindows, useAsync, type MemberStats, type Range } from './useHomeData';

type AnswerFilter = 'all' | 'answered' | 'unanswered';
const SHOW = 5;

interface CallRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  entity_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  channel: string | null;
  direction: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  created_at: string;
}

const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Latest team calls for the page range. The member filter runs in SQL; answered/not is decided by isAnsweredCall()
 * (outcome + duration, same rule as the SQL is_answered_outcome()), so it filters the latest 60 calls in the browser.
 * call_logs RLS already limits rows to the leader's team.
 */
export function RecentCalls({
  members,
  range,
  token,
  member,
  onMember,
  answer,
  onAnswer,
}: {
  members: MemberStats[];
  range: Range;
  token: number;
  member: string;
  onMember: (id: string) => void;
  answer: AnswerFilter;
  onAnswer: (a: AnswerFilter) => void;
}) {
  const { t } = useLanguage();
  const ago = useAgo();
  const supabase = useMemo(() => createClient(), []);
  const ids = useMemo(() => members.map((m) => m.user_id), [members]);
  const idsKey = ids.join(',');

  const { data, loading, error, reload } = useAsync<CallRow[]>(async () => {
    if (ids.length === 0) return [];
    const { from } = rangeWindows(range);
    let q = supabase
      .from('call_logs')
      .select('id, user_id, lead_id, entity_id, contact_name, contact_phone, channel, direction, duration_seconds, outcome, created_at')
      .in('user_id', member ? [member] : ids)
      .gte('created_at', new Date(`${from}T00:00:00+02:00`).toISOString())
      .order('created_at', { ascending: false });
    // Answered/unanswered is decided by isAnsweredCall() (outcome + duration), so fetch a small window and filter.
    q = q.limit(answer === 'all' ? SHOW : 60);
    const { data: rows, error: e } = await q;
    if (e) throw e;
    return (rows as CallRow[]) || [];
  }, [supabase, idsKey, member, range, answer, token]);

  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.full_name])), [members]);
  const rows = (data || [])
    .filter((c) => answer === 'all' || (answer === 'answered') === isAnsweredCall(c))
    .slice(0, SHOW);

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <SectionHeader
        title={t('tl.calls.title')}
        action={
          <Link href="/call-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-lime-700 hover:underline dark:text-lime-400">
            {t('tl.calls.viewAll')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={member}
          onChange={(e) => onMember(e.target.value)}
          aria-label={t('tl.calls.allMembers')}
          className="h-8 min-w-0 max-w-[12rem] rounded-lg border border-black/10 bg-white px-2 text-xs text-foreground dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">{t('tl.calls.allMembers')}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <Segmented<AnswerFilter>
          size="sm"
          label={t('tl.calls.title')}
          value={answer}
          onChange={onAnswer}
          options={[
            { value: 'all', label: t('tl.calls.all') },
            { value: 'answered', label: t('tl.calls.answered') },
            { value: 'unanswered', label: t('tl.calls.noAnswer') },
          ]}
        />
      </div>

      {loading && !data ? (
        <SkeletonRows rows={SHOW} />
      ) : error && !data ? (
        <ErrorState onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon={PhoneOff} text={t('tl.calls.empty')} />
      ) : (
        <ul className="-mx-2 divide-y divide-black/[0.06] dark:divide-zinc-800">
          {rows.map((c) => {
            const answered = isAnsweredCall(c);
            const missed = c.direction === 'missed';
            const Icon = missed ? PhoneMissed : c.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
            const leadId = c.lead_id || c.entity_id;
            const secs = Number(c.duration_seconds) || 0;
            return (
              <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    missed ? 'bg-red-400/10 text-red-500' : answered ? 'bg-lime-400/10 text-lime-600 dark:text-lime-400' : 'bg-zinc-400/10 text-zinc-500'
                  }`}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.contact_name || c.contact_phone || '—'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {nameOf.get(c.user_id) || '—'} · {c.outcome || '—'}
                    {secs > 0 ? ` · ${dur(secs)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(c.created_at).toLocaleString()}>
                  {ago(c.created_at)}
                </span>
                {leadId && UUID.test(leadId) && (
                  <Link
                    href={`/leads-management?lead=${leadId}`}
                    aria-label={t('tl.calls.openLead')}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-lime-600 dark:hover:text-lime-400"
                  >
                    <ArrowUpRight size={14} className="rtl:-scale-x-100" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

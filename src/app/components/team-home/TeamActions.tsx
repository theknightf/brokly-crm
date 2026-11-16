'use client';
/**
 * "Team actions": what the team did in the page range, beyond raw counts.
 *  - summary tiles (stage moves, notes, next actions, meetings, deals),
 *  - per-member breakdown with a bar of WHERE each member moved leads (active / unreached / lost),
 *  - "moved to" distribution across stages,
 *  - live feed of the latest actions ("norhan moved Ahmed: Cold Calls → Interested").
 * Follows the member selected in the team table. Counts are grouped in SQL by team_action_breakdown().
 */
import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, CalendarClock, GitBranch, Handshake, ListChecks, StickyNote } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { CARD, Card, EmptyState, ErrorState, SectionHeader, Skeleton, SkeletonRows, initials, useAgo, useFmt } from './ui';
import { bucketOf, TONE, type Bucket } from './PipelinePanel';
import { rangeWindows, useAsync, type MemberStats, type Range } from './useHomeData';

interface BreakdownRow {
  actor_id: string;
  type: 'stage' | 'note' | 'next_action';
  new_value: string | null;
  count: number;
}
interface EventRow {
  id: string;
  lead_id: string | null;
  actor_id: string;
  type: 'stage' | 'note' | 'next_action';
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}
interface PerMember {
  stage: number;
  note: number;
  next: number;
  buckets: Record<Bucket, number>;
}

const FEED = 8;
const BUCKETS: Bucket[] = ['active', 'unreached', 'lost'];
const emptyMember = (): PerMember => ({ stage: 0, note: 0, next: 0, buckets: { active: 0, unreached: 0, lost: 0 } });

export function TeamActions({
  members,
  range,
  token,
  member,
}: {
  members: MemberStats[];
  range: Range;
  token: number;
  member: string;
}) {
  const { t } = useLanguage();
  const fmt = useFmt();
  const ago = useAgo();
  const supabase = useMemo(() => createClient(), []);
  const ids = useMemo(() => members.map((m) => m.user_id), [members]);
  const idsKey = ids.join(',');
  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.full_name])), [members]);

  // Grouped counts for the range.
  const breakdown = useAsync<BreakdownRow[]>(async () => {
    const w = rangeWindows(range);
    const { data, error } = await supabase.rpc('team_action_breakdown', { p_from: w.from, p_to: w.to, p_member: member || null });
    if (error) throw error;
    return ((data as BreakdownRow[]) || []).map((r) => ({ ...r, count: Number(r.count) || 0 }));
  }, [supabase, range, member, token]);

  // Latest actions + lead names.
  const feed = useAsync<{ events: EventRow[]; leadName: Map<string, string> }>(async () => {
    if (ids.length === 0) return { events: [], leadName: new Map() };
    const w = rangeWindows(range);
    const { data, error } = await supabase
      .from('lead_events')
      .select('id, lead_id, actor_id, type, old_value, new_value, created_at')
      .in('actor_id', member ? [member] : ids)
      .in('type', ['stage', 'note', 'next_action'])
      .gte('created_at', new Date(`${w.from}T00:00:00+02:00`).toISOString())
      .order('created_at', { ascending: false })
      .limit(FEED);
    if (error) throw error;
    const events = (data as EventRow[]) || [];
    const leadIds = Array.from(new Set(events.map((e) => e.lead_id).filter(Boolean))) as string[];
    const leadName = new Map<string, string>();
    if (leadIds.length) {
      const { data: leads } = await supabase.from('leads').select('id, name').in('id', leadIds);
      for (const l of (leads as { id: string; name: string | null }[]) || []) leadName.set(l.id, l.name || '—');
    }
    return { events, leadName };
  }, [supabase, idsKey, member, range, token]);

  const agg = useMemo(() => {
    const per = new Map<string, PerMember>();
    const movedTo = new Map<string, number>();
    const totals = emptyMember();
    for (const r of breakdown.data || []) {
      const m = per.get(r.actor_id) || emptyMember();
      if (r.type === 'stage') {
        const b = bucketOf(r.new_value || '');
        m.stage += r.count;
        m.buckets[b] += r.count;
        totals.stage += r.count;
        totals.buckets[b] += r.count;
        movedTo.set(r.new_value || '—', (movedTo.get(r.new_value || '—') || 0) + r.count);
      } else if (r.type === 'note') {
        m.note += r.count;
        totals.note += r.count;
      } else {
        m.next += r.count;
        totals.next += r.count;
      }
      per.set(r.actor_id, m);
    }
    const moved = Array.from(movedTo.entries()).sort((a, b) => b[1] - a[1]);
    return { per, totals, moved };
  }, [breakdown.data]);

  const scoped = member ? members.filter((m) => m.user_id === member) : members;
  const meetings = scoped.reduce((a, m) => a + m.meetings, 0);
  const deals = scoped.reduce((a, m) => a + m.deals, 0);

  const tiles: { label: string; value: number; Icon: typeof GitBranch }[] = [
    { label: t('tl.act.stage'), value: agg.totals.stage, Icon: GitBranch },
    { label: t('tl.act.notes'), value: agg.totals.note, Icon: StickyNote },
    { label: t('tl.act.next'), value: agg.totals.next, Icon: CalendarClock },
    { label: t('tl.kpi.meetings'), value: meetings, Icon: CalendarCheck },
    { label: t('tl.kpi.deals'), value: deals, Icon: Handshake },
  ];

  const rows = members
    .filter((m) => !member || m.user_id === member)
    .map((m) => ({ m, a: agg.per.get(m.user_id) || emptyMember() }))
    .sort((x, y) => y.a.stage + y.a.note + y.a.next - (x.a.stage + x.a.note + x.a.next));
  const maxMoved = Math.max(1, ...agg.moved.map((x) => x[1]));
  const selectedName = member ? nameOf.get(member) : null;

  const describe = (e: EventRow) => {
    if (e.type === 'stage') {
      return (
        <>
          {t('tl.act.moved')}{' '}
          <span className="text-muted-foreground">{e.old_value || '—'}</span>
          <ArrowRight size={11} className="mx-1 inline rtl:-scale-x-100" aria-hidden />
          <span className={`font-medium ${TONE[bucketOf(e.new_value || '')].text}`}>{e.new_value || '—'}</span>
        </>
      );
    }
    return e.type === 'note' ? t('tl.act.addedNote') : t('tl.act.setNext');
  };

  const busy = breakdown.loading && !breakdown.data;

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      <SectionHeader
        title={t('tl.act.title')}
        subtitle={selectedName ? t('tl.act.forMember', { name: selectedName }) : t('tl.act.subtitle')}
      />

      {breakdown.error && !breakdown.data ? (
        <ErrorState onRetry={breakdown.reload} />
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {tiles.map(({ label, value, Icon }) => (
              <div key={label} className="rounded-xl bg-black/[0.03] p-3 dark:bg-zinc-950/60">
                <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                  <Icon size={12} aria-hidden /> {label}
                </p>
                {busy ? <Skeleton className="mt-1.5 h-6 w-10" /> : <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{fmt(value)}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Per member */}
            <div className="min-w-0 lg:col-span-7">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('tl.act.byMember')}</p>
              {busy ? (
                <SkeletonRows rows={4} />
              ) : (
                <div className="custom-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[460px] text-[13px]">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground">
                        <th className="pb-2 text-start font-medium">{t('tl.team.title')}</th>
                        <th className="pb-2 text-end font-medium">{t('tl.act.stageShort')}</th>
                        <th className="pb-2 text-end font-medium">{t('tl.act.notesShort')}</th>
                        <th className="pb-2 text-end font-medium">{t('tl.act.nextShort')}</th>
                        <th className="w-[34%] pb-2 ps-4 text-start font-medium">{t('tl.act.movedTo')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06] dark:divide-zinc-800">
                      {rows.map(({ m, a }) => {
                        const idle = a.stage + a.note + a.next === 0;
                        return (
                          <tr key={m.user_id} className={idle ? 'opacity-50' : ''}>
                            <td className="py-2">
                              <span className="flex items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[10px] font-semibold dark:bg-zinc-800">
                                  {initials(m.full_name)}
                                </span>
                                <span className="truncate text-foreground">{m.full_name}</span>
                              </span>
                            </td>
                            <td className="py-2 text-end tabular-nums text-foreground">{fmt(a.stage)}</td>
                            <td className="py-2 text-end tabular-nums text-foreground">{fmt(a.note)}</td>
                            <td className="py-2 text-end tabular-nums text-foreground">{fmt(a.next)}</td>
                            <td className="py-2 ps-4">
                              {a.stage > 0 ? (
                                <div
                                  className="flex h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-zinc-800"
                                  title={BUCKETS.map((b) => `${t(`tl.pipe.${b}`)}: ${a.buckets[b]}`).join(' · ')}
                                >
                                  {BUCKETS.map((b) => (
                                    <div key={b} className={TONE[b].bar} style={{ width: `${(a.buckets[b] / a.stage) * 100}%` }} />
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {BUCKETS.map((b) => (
                      <span key={b} className="inline-flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${TONE[b].dot}`} /> {t(`tl.pipe.${b}`)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Moved to */}
            <div className="min-w-0 lg:col-span-5">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('tl.act.movedToTitle')}</p>
              {busy ? (
                <SkeletonRows rows={4} />
              ) : agg.moved.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t('tl.act.noMoves')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {agg.moved.slice(0, 8).map(([stage, n]) => (
                    <li key={stage}>
                      <Link
                        href={`/leads-management?status=${encodeURIComponent(stage)}`}
                        className="-mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-[13px] hover:bg-black/[0.03] dark:hover:bg-zinc-800/60"
                      >
                        <span className="w-32 shrink-0 truncate text-foreground" title={stage}>
                          {stage}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.05] dark:bg-zinc-800">
                          <span className={`block h-full rounded-full ${TONE[bucketOf(stage)].bar}`} style={{ width: `${(n / maxMoved) * 100}%` }} />
                        </span>
                        <span className="w-10 shrink-0 text-end font-semibold tabular-nums text-foreground">{fmt(n)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {/* Live feed */}
      <div className={`${CARD} border-dashed !bg-transparent p-3`}>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{t('tl.act.latest')}</p>
        {feed.loading && !feed.data ? (
          <SkeletonRows rows={4} />
        ) : feed.error && !feed.data ? (
          <ErrorState onRetry={feed.reload} />
        ) : (feed.data?.events.length || 0) === 0 ? (
          <EmptyState icon={ListChecks} text={t('tl.act.noActions')} />
        ) : (
          <ul className="divide-y divide-black/[0.06] dark:divide-zinc-800">
            {feed.data!.events.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 py-2 text-[13px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[10px] font-semibold dark:bg-zinc-800">
                  {initials(nameOf.get(e.actor_id) || '?')}
                </span>
                <p className="min-w-0 flex-1 truncate text-foreground">
                  <span className="font-medium">{nameOf.get(e.actor_id) || '—'}</span> {describe(e)}
                  {e.lead_id && (
                    <>
                      {' · '}
                      <Link href={`/leads-management?lead=${e.lead_id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                        {feed.data!.leadName.get(e.lead_id) || '—'}
                      </Link>
                    </>
                  )}
                </p>
                <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(e.created_at).toLocaleString()}>
                  {ago(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

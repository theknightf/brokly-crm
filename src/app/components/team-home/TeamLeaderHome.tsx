'use client';
/**
 * Home dashboard for team leaders. Order (mobile = same order, one column):
 *   header (greeting + page-wide range + refresh) → attention chips → team KPIs →
 *   follow-ups (8 cols) | team (4 cols) → recent team calls → pipeline → leads by source.
 * Each section loads on its own; the range control and refresh invalidate all of them.
 */
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { HomeHeader, AttentionBar } from './HomeHeader';
import { KpiRow } from './KpiRow';
import { FollowUpsPanel } from './FollowUpsPanel';
import { TeamPanel } from './TeamPanel';
import { RecentCalls } from './RecentCalls';
import { TeamActions } from './TeamActions';
import { PipelinePanel, SourcePanel } from './PipelinePanel';
import { HomeContext, useDailyCallsTarget, useFollowUps, useHomeState, useStageCounts, useTeamStats } from './useHomeData';

const GettingStarted = dynamic(() => import('../GettingStarted'));

export default function TeamLeaderHome() {
  const home = useHomeState();
  const { range, token } = home;

  const team = useTeamStats(range, token);
  const stages = useStageCounts(token);
  const followUps = useFollowUps(token);
  const target = useDailyCallsTarget();

  // Shared between the team table (click a member) and the calls feed filter.
  const [member, setMember] = useState('');
  const [answer, setAnswer] = useState<'all' | 'answered' | 'unanswered'>('all');

  const refreshing = team.loading || stages.loading || followUps.loading;
  const members = team.data?.members || [];

  return (
    <HomeContext.Provider value={home}>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <HomeHeader refreshing={refreshing} />

        <AttentionBar followUps={followUps.data} />

        <KpiRow data={team.data} loading={team.loading} error={team.error} onRetry={team.reload} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <FollowUpsPanel
              items={followUps.data}
              loading={followUps.loading}
              error={followUps.error}
              onRetry={followUps.reload}
              onChanged={followUps.reload}
            />
          </div>
          <div className="min-w-0 lg:col-span-4">
            <TeamPanel
              data={team.data}
              loading={team.loading}
              error={team.error}
              onRetry={team.reload}
              range={range}
              dailyTarget={target.data ?? null}
              selected={member}
              onSelect={setMember}
            />
          </div>
        </div>

        {members.length > 0 && <TeamActions members={members} range={range} token={token} member={member} />}

        {members.length > 0 && (
          <RecentCalls
            members={members}
            range={range}
            token={token}
            member={member}
            onMember={setMember}
            answer={answer}
            onAnswer={setAnswer}
          />
        )}

        <PipelinePanel data={stages.data} loading={stages.loading} error={stages.error} onRetry={stages.reload} />

        <SourcePanel data={stages.data} loading={stages.loading} error={stages.error} onRetry={stages.reload} />

        {/* Onboarding only for a near-empty org. */}
        {stages.data && stages.data.total < 5 && <GettingStarted />}
      </div>
    </HomeContext.Provider>
  );
}

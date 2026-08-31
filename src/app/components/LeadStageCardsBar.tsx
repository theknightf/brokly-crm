'use client';
import React from 'react';
import { Flame, Snowflake, Pause, Phone, PhoneOff, XCircle, CheckCircle } from 'lucide-react';

interface StageStat { count: number; percentage: string; revenue?: number; }

interface Props {
  stats: {
    newFresh: StageStat;
    newCold: StageStat;
    leadsPending: StageStat;
    callsAnswer: StageStat;
    noAnswer: StageStat;
    cancel: StageStat;
    doneDeal: StageStat;
  };
  activeStageKey: string | null; // stageKeys[0] value
  onStageClick: (key: string) => void;
}

const META: Record<string, { label: string; icon: any; badgeLight: string; badgeDark: string; stageKeys: string[] }> = {
  newFresh: { label: 'NEW FRESH', icon: Flame, badgeLight: 'bg-cyan-50 text-cyan-600', badgeDark: 'dark:bg-cyan-500/10 dark:text-cyan-400', stageKeys: ['Fresh Leads','New Fresh'] },
  newCold: { label: 'NEW COLD', icon: Snowflake, badgeLight: 'bg-blue-50 text-blue-600', badgeDark: 'dark:bg-blue-500/10 dark:text-blue-400', stageKeys: ['Cold Calls','New Cold'] },
  leadsPending: { label: 'LEADS PENDING', icon: Pause, badgeLight: 'bg-amber-50 text-amber-600', badgeDark: 'dark:bg-amber-500/10 dark:text-amber-400', stageKeys: ['Pending Leads','Leads Pending','Following Up'] },
  callsAnswer: { label: 'CALLS ANSWER', icon: Phone, badgeLight: 'bg-purple-50 text-purple-600', badgeDark: 'dark:bg-purple-500/10 dark:text-purple-400', stageKeys: ['Calls Answer','Calls Answered','Meeting','Interested'] },
  noAnswer: { label: 'NO ANSWER', icon: PhoneOff, badgeLight: 'bg-zinc-100 text-zinc-600', badgeDark: 'dark:bg-zinc-800 dark:text-zinc-400', stageKeys: ['No Answer','No Answer At All'] },
  cancel: { label: 'CANCEL', icon: XCircle, badgeLight: 'bg-rose-50 text-rose-600', badgeDark: 'dark:bg-rose-500/10 dark:text-rose-400', stageKeys: ['Cancel','Cancellation'] },
  doneDeal: { label: 'D.DEAL', icon: CheckCircle, badgeLight: 'bg-lime-50 text-lime-600', badgeDark: 'dark:bg-lime-500/10 dark:text-lime-400', stageKeys: ['Done Deal','D.Deal'] },
};

const ORDER: (keyof typeof META)[] = ['newFresh','newCold','leadsPending','callsAnswer','noAnswer','cancel','doneDeal'];

export default function LeadStageCardsBar({ stats, activeStageKey, onStageClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      {ORDER.map((key) => {
        const meta = META[key];
        const stat = stats[key as keyof typeof stats];
        const isActive = activeStageKey === meta.stageKeys[0];
        const isDoneDeal = key === 'doneDeal';
        return (
          <button
            key={key}
            onClick={() => onStageClick(key)}
            className={`text-left bg-white dark:bg-zinc-900/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5
              ${isActive ? 'border-lime-500/50 ring-1 ring-lime-500/20 shadow-md' : 'border-zinc-200 dark:border-zinc-800/90 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${meta.badgeLight} ${meta.badgeDark}`}>
                <meta.icon size={14} />
              </div>
              {isActive && <span className="w-2 h-2 rounded-full bg-lime-500 animate-pulse" />}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 text-xs font-bold tracking-wider mt-3 truncate">{meta.label}</p>
            <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">{stat.count}</p>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
              <span>{stat.percentage}</span>
              {isDoneDeal && stat.revenue ? <span className="text-lime-600 dark:text-lime-400 font-semibold">· {Number(stat.revenue).toLocaleString()} EGP</span> : null}
            </p>
          </button>
        );
      })}
    </div>
  );
}

'use client';
import React from 'react';
import { Flame, Snowflake, Pause, Phone, PhoneOff, XCircle, CheckCircle } from 'lucide-react';

export interface LeadStageStats {
  newFresh: { count: number; percentage: string };
  newCold: { count: number; percentage: string };
  leadsPending: { count: number; percentage: string };
  callsAnswer: { count: number; percentage: string };
  noAnswer: { count: number; percentage: string };
  cancel: { count: number; percentage: string };
  doneDeal: { count: number; percentage: string; revenue?: number };
}

interface Props {
  stats: LeadStageStats;
  activeStageKey: string | null;
  onStageClick: (key: string) => void;
}

const STAGES: { key: keyof LeadStageStats; label: string; icon: any; badge: string }[] = [
  { key: 'newFresh', label: 'New Fresh', icon: Flame, badge: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  { key: 'newCold', label: 'New Cold', icon: Snowflake, badge: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { key: 'leadsPending', label: 'Leads Pending', icon: Pause, badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { key: 'callsAnswer', label: 'Calls Answer', icon: Phone, badge: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { key: 'noAnswer', label: 'No Answer', icon: PhoneOff, badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' },
  { key: 'cancel', label: 'Cancel', icon: XCircle, badge: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { key: 'doneDeal', label: 'D.Deal', icon: CheckCircle, badge: 'bg-lime-50 dark:bg-lime-500/10 text-lime-600 dark:text-lime-400' },
];

export default function LeadStageCardsBar({ stats, activeStageKey, onStageClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      {STAGES.map(({ key, label, icon: Icon, badge }) => {
        const stat = stats[key] || { count: 0, percentage: '0%' };
        const isActive = activeStageKey === key;
        const isDoneDeal = key === 'doneDeal';
        return (
          <button
            key={key}
            onClick={() => onStageClick(key)}
            className={`text-left bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-2xl p-4 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 group flex flex-col justify-between min-h-[96px] ${
              isActive ? 'ring-1 ring-lime-500/30 border-lime-500/50 dark:border-lime-500/50 shadow-[0_0_12px_rgba(132,204,22,0.15)]' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${badge}`}>
                <Icon size={14} />
              </div>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse" />}
            </div>
            <div>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs font-bold tracking-wider truncate">{label.toUpperCase()}</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1 tabular-nums">{stat.count}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-lime-500/20 text-lime-600 dark:text-lime-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>{stat.percentage}</span>
                {isDoneDeal && (stat as any).revenue ? (
                  <span className="text-zinc-500 dark:text-zinc-400 text-xs truncate">{Number((stat as any).revenue).toLocaleString()} EGP</span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

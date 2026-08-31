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

const STAGES: { key: keyof LeadStageStats; label: string; icon: any }[] = [
  { key: 'newFresh', label: 'New Fresh', icon: Flame },
  { key: 'newCold', label: 'New Cold', icon: Snowflake },
  { key: 'leadsPending', label: 'Leads Pending', icon: Pause },
  { key: 'callsAnswer', label: 'Calls Answer', icon: Phone },
  { key: 'noAnswer', label: 'No Answer', icon: PhoneOff },
  { key: 'cancel', label: 'Cancel', icon: XCircle },
  { key: 'doneDeal', label: 'D.Deal', icon: CheckCircle },
];

export default function LeadStageCardsBar({ stats, activeStageKey, onStageClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      {STAGES.map(({ key, label, icon: Icon }) => {
        const stat = stats[key] || { count: 0, percentage: '0%' };
        const isActive = activeStageKey === key;
        const isDoneDeal = key === 'doneDeal';
        return (
          <button
            key={key}
            onClick={() => onStageClick(key)}
            className={`text-left bg-zinc-900/60 dark:bg-zinc-900 border rounded-xl p-3.5 transition-all cursor-pointer hover:-translate-y-0.5 group flex flex-col justify-between min-h-[96px] ${
              isActive
                ? 'border-lime-500/50 ring-1 ring-lime-500/20 shadow-[0_0_12px_rgba(132,204,22,0.15)]'
                : 'border-zinc-800/80 hover:border-zinc-700 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isActive ? 'bg-lime-500/20 text-lime-400' : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200'}`}>
                <Icon size={14} />
              </div>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse" />}
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide truncate">{label}</p>
              <p className="text-xl font-bold text-white mt-1 tabular-nums">{stat.count}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-lime-500/20 text-lime-300' : 'bg-zinc-800 text-zinc-400'}`}>{stat.percentage}</span>
                {isDoneDeal && (stat as any).revenue ? (
                  <span className="text-xs text-zinc-500 truncate">{Number((stat as any).revenue).toLocaleString()} EGP</span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

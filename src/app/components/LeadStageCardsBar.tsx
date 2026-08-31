'use client';
import React from 'react';
import { Flame, Snowflake, Pause, Phone, PhoneOff, XCircle, CheckCircle, ArrowRight } from 'lucide-react';

export type StageKey = 'newFresh' | 'newCold' | 'leadsPending' | 'callsAnswer' | 'noAnswer' | 'cancel' | 'doneDeal';

interface StageStat { count: number; percentage: string; revenue?: number; }

interface Props {
  stats: Record<StageKey, StageStat>;
  activeStage: string | null; // stageKeys[0] value
  onSelect: (key: StageKey) => void;
  onReset?: () => void;
}

const META: Record<StageKey, { label: string; Icon: any; accent: string; badgeBg: string; borderTop: string; stageKeys: string[] }> = {
  newFresh: { label: 'New Fresh', Icon: Flame, accent: 'text-cyan-400', badgeBg: 'bg-cyan-500/10 border-cyan-500/20', borderTop: 'border-t-cyan-500', stageKeys: ['Fresh Leads','New Fresh'] },
  newCold: { label: 'New Cold', Icon: Snowflake, accent: 'text-blue-400', badgeBg: 'bg-blue-500/10 border-blue-500/20', borderTop: 'border-t-blue-500', stageKeys: ['Cold Calls','New Cold'] },
  leadsPending: { label: 'Leads Pending', Icon: Pause, accent: 'text-amber-400', badgeBg: 'bg-amber-500/10 border-amber-500/20', borderTop: 'border-t-amber-500', stageKeys: ['Pending Leads','Leads Pending','Following Up'] },
  callsAnswer: { label: 'Calls Answer', Icon: Phone, accent: 'text-purple-400', badgeBg: 'bg-purple-500/10 border-purple-500/20', borderTop: 'border-t-purple-500', stageKeys: ['Calls Answer','Calls Answered','Meeting','Interested'] },
  noAnswer: { label: 'No Answer', Icon: PhoneOff, accent: 'text-zinc-400', badgeBg: 'bg-zinc-500/10 border-zinc-500/20', borderTop: 'border-t-zinc-500', stageKeys: ['No Answer','No Answer At All'] },
  cancel: { label: 'Cancel', Icon: XCircle, accent: 'text-rose-400', badgeBg: 'bg-rose-500/10 border-rose-500/20', borderTop: 'border-t-rose-500', stageKeys: ['Cancel','Cancellation'] },
  doneDeal: { label: 'D.Deal', Icon: CheckCircle, accent: 'text-lime-400', badgeBg: 'bg-lime-500/10 border-lime-500/20', borderTop: 'border-t-lime-500', stageKeys: ['Done Deal','D.Deal'] },
};

export default function LeadStageCardsBar({ stats, activeStage, onSelect, onReset }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
          <span className="w-1.5 h-4 rounded-full bg-lime-500 inline-block" />
          Lead Stage Overview
          <span className="text-xs font-normal text-zinc-500">— 1-Click Filter</span>
        </h3>
        {activeStage && onReset && (
          <button onClick={onReset} className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 transition-colors">
            Clear filter <span className="font-semibold text-zinc-900 dark:text-zinc-100">{activeStage}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        { (Object.keys(META) as StageKey[]).map((key) => {
          const meta = META[key];
          const stat = stats[key] || { count: 0, percentage: '0%' };
          const isActive = activeStage === meta.stageKeys[0];
          const isDoneDeal = key === 'doneDeal';
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`group text-left relative overflow-hidden rounded-2xl p-4 transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] border shadow-sm bg-white dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 ${isActive ? 'ring-2 ring-lime-500/40 border-lime-500/40 dark:border-lime-500/40' : ''} border-t-[3px] ${meta.borderTop}`}
            >
              {/* Top subtle glow for active */}
              {isActive && <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-lime-500/10 to-transparent pointer-events-none" />}

              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${meta.badgeBg} ${meta.accent} mb-3`}>
                <meta.Icon size={14} />
              </div>

              <p className="text-xs font-medium tracking-wider uppercase text-zinc-400">{meta.label}</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tracking-tight">{stat.count}</p>
              <p className="text-xs font-medium text-zinc-500 mt-0.5">
                {stat.percentage}{isDoneDeal && (stat as any).revenue ? ` · ${Number((stat as any).revenue).toLocaleString()} EGP` : ''}
              </p>
              <p className={`text-xs mt-3 flex items-center gap-1 font-medium transition-colors ${isActive ? 'text-lime-500' : 'text-zinc-400 group-hover:text-lime-500 dark:group-hover:text-lime-400'}`}>
                Filter <ArrowRight size={11} className={`transition-transform ${isActive ? 'translate-x-0.5' : 'group-hover:translate-x-0.5'}`} />
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { META as LEAD_STAGE_META };

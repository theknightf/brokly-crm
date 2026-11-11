'use client';
import React from 'react';
import { Check } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import { PIPELINE_STAGES, OUTCOME_STAGES } from './leadStages';
import type { LeadStatus } from './mockLeads';

/**
 * The list inside every "change stage" menu (leads table and the phone lead card): pipeline stages,
 * then outcomes, the current one marked with a check. Tapping the current stage just closes the menu.
 */
export default function StageMenuList({
  current,
  onPick,
  keyPrefix,
}: {
  current: string;
  onPick: (stage: LeadStatus | null) => void;
  keyPrefix: string;
}) {
  const { t } = useLanguage();
  const row = (s: string) => {
    const on = s === current;
    return (
      <button
        key={`${keyPrefix}-${s}`}
        type="button"
        role="option"
        aria-selected={on}
        onClick={() => onPick(on ? null : (s as LeadStatus))}
        className={`flex w-full min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 text-start text-sm transition-colors touch-manipulation sm:min-h-[44px] ${
          on ? 'bg-primary/10 font-semibold' : 'hover:bg-muted active:bg-muted'
        }`}
      >
        <StatusBadge status={s} showDot />
        {on && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
      </button>
    );
  };
  return (
    <div className="py-1">
      <p className="px-4 pt-1 pb-2 text-sm font-bold text-foreground sm:hidden">{t('stageMenu.title')}</p>
      <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {t('stageMenu.pipeline')}
      </p>
      {PIPELINE_STAGES.map(row)}
      <div className="my-1 border-t border-border/60" />
      <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {t('stageMenu.outcomes')}
      </p>
      {OUTCOME_STAGES.map(row)}
    </div>
  );
}

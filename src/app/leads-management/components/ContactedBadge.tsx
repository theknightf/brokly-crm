'use client';
import React from 'react';

/**
 * Action Taken indicator (replaces Contacted). Display-only: green when the
 * lead has had any key action today (call, note, stage, follow-up), gray
 * otherwise. Back-compat: also accepts `contactedToday`.
 * Never changes status — view filter only.
 */
export default function ContactedBadge({
  contactedToday,
  actionTakenToday,
  compact = false,
}: {
  contactedToday?: boolean;
  actionTakenToday?: boolean;
  compact?: boolean;
}) {
  const active = !!(actionTakenToday ?? contactedToday);
  return (
    <span
      title={
        active
          ? 'Action taken today (call, note, stage change, or follow-up scheduled)'
          : 'No action taken today'
      }
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${
        compact ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'
      } ${
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      <span
        className={`rounded-full ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${
          active ? 'bg-emerald-500' : 'bg-muted-foreground/50'
        }`}
      />
      {active ? 'Action taken' : 'No action'}
    </span>
  );
}

/** Alias for new call sites. */
export const ActionTakenBadge = ContactedBadge;

'use client';
import React from 'react';

/**
 * Contacted-today indicator. Display-only: a green dot when the lead has a
 * call log or follow-up created today, gray otherwise. Never changes status.
 */
export default function ContactedBadge({
  contactedToday,
  compact = false,
}: {
  contactedToday?: boolean;
  compact?: boolean;
}) {
  const contacted = !!contactedToday;
  return (
    <span
      title={contacted ? 'Contacted today (call or follow-up logged)' : 'Not contacted today'}
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${
        compact ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'
      } ${
        contacted
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      <span
        className={`rounded-full ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${
          contacted ? 'bg-emerald-500' : 'bg-muted-foreground/50'
        }`}
      />
      {contacted ? 'Contacted today' : 'Not contacted'}
    </span>
  );
}

'use client';
import React from 'react';

export default function CalledBadge({ hasBeenCalled, compact = false }: { hasBeenCalled?: boolean; compact?: boolean }) {
  const called = !!hasBeenCalled;
  return (
    <span
      title={called ? 'Sales has called this lead' : 'Not called yet'}
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${
        compact ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'
      } ${called ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}
    >
      <span className={`rounded-full ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${called ? 'bg-sky-500' : 'bg-amber-500'}`} />
      {called ? 'Called' : 'Not Called'}
    </span>
  );
}

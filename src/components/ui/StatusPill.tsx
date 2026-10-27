import React from 'react';

/** Status pill colours that read on both the obsidian and the light theme. Order matters. */
const STATUS_TONES: { match: RegExp; cls: string }[] = [
  { match: /not interested|low budget/i, cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300' },
  { match: /cancel/i, cls: 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300' },
  { match: /duplicate/i, cls: 'bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300' },
  { match: /wrong|closed number/i, cls: 'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300' },
  { match: /rotation/i, cls: 'bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300' },
  { match: /no answer/i, cls: 'bg-zinc-500/15 text-zinc-700 border-zinc-500/30 dark:text-zinc-300' },
  { match: /reschedule/i, cls: 'bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300' },
  { match: /meeting/i, cls: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300' },
  { match: /follow/i, cls: 'bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300' },
  { match: /pending/i, cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300' },
  { match: /cold/i, cls: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/30 dark:text-cyan-300' },
  { match: /fresh|new/i, cls: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300' },
  { match: /reservation/i, cls: 'bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-300' },
  { match: /done deal|won/i, cls: 'bg-lime-500/15 text-lime-700 border-lime-500/30 dark:text-lime-300' },
  { match: /interested/i, cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300' },
];

export function StatusPill({ status, large = false }: { status: string; large?: boolean }) {
  const tone =
    STATUS_TONES.find((x) => x.match.test(status))?.cls ||
    'bg-zinc-500/15 text-zinc-700 border-zinc-500/30 dark:text-zinc-300';
  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full rounded-full border font-semibold ${
        large ? 'px-3 py-1 text-sm leading-5' : 'px-2.5 py-0.5 text-[12px] leading-5'
      } ${tone}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden />
      <span className="truncate">{status}</span>
    </span>
  );
}

export default StatusPill;

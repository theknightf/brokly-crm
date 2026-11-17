'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { leadsService } from '@/lib/services/crmService';
import { ALL_STATUSES, colorClassOf, STATUS_ICONS } from '@/lib/ui';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Sales-agent pipeline: only stages that have leads, as compact chips (emoji, name, count, %).
 * "Show all stages (19)" reveals the empty ones. Same data source as the shared stage grid
 * (leadsService.getStatusCounts, RLS-scoped to the agent's own leads); the shared grid is untouched.
 */
export default function AgentPipeline({ onCounts }: { onCounts?: (total: number) => void }) {
  const { t, lang } = useLanguage();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    leadsService
      .getStatusCounts()
      .then((data: unknown) => setCounts((data as Record<string, number>) || {}))
      .catch(() => setCounts({}));
  }, []);

  const total = useMemo(() => Object.values(counts || {}).reduce((s, n) => s + Number(n || 0), 0), [counts]);
  useEffect(() => {
    if (counts) onCounts?.(total);
  }, [counts, total, onCounts]);

  const nf = useMemo(() => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'), [lang]);
  const stages = ALL_STATUSES.filter((s) => showAll || Number(counts?.[s] || 0) > 0);
  const emptyCount = ALL_STATUSES.length - ALL_STATUSES.filter((s) => Number(counts?.[s] || 0) > 0).length;

  if (!counts) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.length === 0 ? (
        <p className="flex min-h-[88px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          {t('agent.pipe.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {stages.map((status) => {
            const n = Number(counts[status] || 0);
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            const [bg, text] = colorClassOf(status).split(' ');
            return (
              <Link
                key={status}
                href={`/leads-management?status=${encodeURIComponent(status)}`}
                title={t('agent.pipe.open', { stage: status })}
                className={`flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-lime-500/40 active:scale-[0.98] ${
                  n === 0 ? 'opacity-50' : ''
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${bg} bg-opacity-60`} aria-hidden>
                  {STATUS_ICONS[status] || '📊'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted-foreground">{status}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold tabular-nums text-foreground">{nf.format(n)}</span>
                    <span className={`text-[11px] font-semibold tabular-nums ${text}`}>{pct}%</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {emptyCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-semibold text-primary hover:underline"
          aria-expanded={showAll}
        >
          {showAll ? t('agent.pipe.hideEmpty') : t('agent.pipe.showAll', { n: ALL_STATUSES.length })}
        </button>
      )}
    </div>
  );
}

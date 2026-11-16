'use client';
import React from 'react';
import { AlertCircle, RefreshCw, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/** One card surface for the whole page. */
export const CARD = 'rounded-[14px] border border-black/[0.07] bg-white dark:border-zinc-800 dark:bg-zinc-900';

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`${CARD} ${className}`}>{children}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-black/[0.06] dark:bg-zinc-800 ${className}`} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Icon size={22} className="text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={AlertCircle}
      text={t('tl.error')}
      action={
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/10 px-3 text-xs font-semibold text-foreground hover:border-lime-500/50 dark:border-zinc-700"
        >
          <RefreshCw size={13} aria-hidden /> {t('tl.retry')}
        </button>
      }
    />
  );
}

/** Locale-aware number formatting with thousands separators (Latin digits in both languages, like the rest of the app). */
export function useFmt() {
  const { lang } = useLanguage();
  const nf = React.useMemo(() => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'), [lang]);
  return (n: number) => nf.format(n);
}

/** Short relative time: "now", "12m", "3h", "2d", or a date. */
export function useAgo() {
  const { t, lang } = useLanguage();
  return (iso: string | null | undefined) => {
    if (!iso) return t('tl.never');
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return t('tl.now');
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
  };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** Segmented control (range, tabs, filters). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs';
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] bg-black/[0.05] p-0.5 dark:bg-zinc-800/80">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`${h} inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
            value === o.value
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

'use client';
import React from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Building blocks shared by the Add lead and Edit lead forms, so both look and behave the same on a
 * phone (one column, 48px fields, 16px text so iOS does not zoom) and on a computer (two columns).
 */

/** Field class: tall + 16px text on phones, compact on larger screens. */
export const FIELD = 'input-base h-12 min-h-[48px] text-base sm:h-11 sm:min-h-[44px] sm:text-sm border-border/80';
export const SELECT = `${FIELD} appearance-none pe-9`;

/** Small chevron used on select elements, anchored to the inline-end edge (RTL safe). */
export function SelectChevron() {
  return (
    <ChevronDown
      size={14}
      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
    />
  );
}

/** Label row with an optional "required"/"optional" tag and a trailing action. */
export function FieldLabel({
  htmlFor,
  children,
  required,
  requiredText,
  optionalText,
  action,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  requiredText?: string;
  optionalText?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[24px]">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <span>{children}</span>
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
        {requiredText && (
          <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
            {requiredText}
          </span>
        )}
        {optionalText && <span className="text-xs font-normal text-muted-foreground">{optionalText}</span>}
      </label>
      {action}
    </div>
  );
}

/** Positions a leading icon inside an input wrapper. */
export function IconWrap({
  icon,
  children,
  physicalLeft,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Use for dir="ltr" inputs (e.g. phone) so the icon stays on the input's own left edge. */
  physicalLeft?: boolean;
}) {
  return (
    <div className="relative">
      {children}
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none ${
          physicalLeft ? 'left-3.5' : 'start-3.5'
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
  );
}

/** A titled card that groups related fields. `id` lets a section tab scroll to it. */
export function FormSection({
  id,
  icon,
  title,
  hint,
  children,
  className = '',
}: {
  id?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-16 rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground sm:text-base">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Single-choice pill buttons (instead of a select) for short lists such as priority or rating. */
export function ChipGroup<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value || 'none'}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors active:scale-95 ${
              on
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {on && <Check size={14} strokeWidth={2.5} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Section tabs that stay at the top of the form and scroll to a section. Horizontal scroll on phones.
 * `scrollRoot` is the scrolling element (the modal body); sections are found by id inside the page.
 */
export function SectionTabs({ tabs, label }: { tabs: { id: string; label: string }[]; label: string }) {
  const [active, setActive] = React.useState(tabs[0]?.id);
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav
      aria-label={label}
      className="sticky top-0 z-10 -mx-4 flex gap-1.5 overflow-x-auto border-b border-border bg-card/95 px-4 py-2 backdrop-blur-md [scrollbar-width:none] sm:-mx-6 sm:px-6"
    >
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          onClick={() => go(tb.id)}
          aria-current={active === tb.id ? 'true' : undefined}
          className={`min-h-[36px] shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors ${
            active === tb.id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          {tb.label}
        </button>
      ))}
    </nav>
  );
}

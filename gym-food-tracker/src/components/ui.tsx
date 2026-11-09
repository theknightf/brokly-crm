import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp } from '../lib/calc';

/* ---------- icons ---------- */

const PATHS: Record<string, string> = {
  today: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  workout: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  food: 'M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 3c-2 2-3 5-3 8h3v10',
  progress: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l5 5 9-10',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  play: 'M7 4l13 8-13 8z',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  trophy: 'M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 14v4M8 20h8',
};

export function I({ n, className = 'h-6 w-6' }: { n: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[n]} />
    </svg>
  );
}

/* ---------- layout ---------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

export function H({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-bold">{children}</h2>
      {right}
    </div>
  );
}

type BtnVariant = 'primary' | 'soft' | 'danger' | 'ghost';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-onaccent',
  soft: 'bg-surface2 text-ink',
  danger: 'bg-danger/15 text-danger',
  ghost: 'text-accent',
};

export function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-semibold active:opacity-70 disabled:opacity-40 ${BTN[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  n,
  onClick,
  label,
  className = '',
}: {
  n: string;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-surface2 ${className}`}
    >
      <I n={n} className="h-5 w-5" />
    </button>
  );
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-surface2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-[40px] flex-1 rounded-lg px-2 text-sm font-semibold ${
            o.value === value ? 'bg-accent text-onaccent' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-semibold ${
        active ? 'border-accent bg-accent text-onaccent' : 'border-line text-muted'
      }`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/* ---------- sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  tall?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative flex flex-col rounded-t-3xl bg-bg ${tall ? 'h-[94%]' : 'max-h-[88%]'}`}
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconBtn n="x" label="Close" onClick={onClose} />
        </div>
        <div className="space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------- numeric inputs ---------- */

const fmt = (v: number) => String(Math.round(v * 100) / 100);

export function NumInput({
  value,
  onChange,
  min = 0,
  max = 99999,
  className = '',
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
  label?: string;
}) {
  const [txt, setTxt] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(fmt(value));
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={className}
      value={txt}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        const n = parseFloat(txt.replace(',', '.'));
        const v = Number.isNaN(n) ? value : clamp(n, min, max);
        onChange(v);
        setTxt(fmt(v));
      }}
      onChange={(e) => {
        setTxt(e.target.value);
        const n = parseFloat(e.target.value.replace(',', '.'));
        if (!Number.isNaN(n)) onChange(clamp(n, min, max));
      }}
    />
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 99999,
  inputClass = 'w-16 text-2xl',
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  inputClass?: string;
  label?: string;
}) {
  const bump = (d: number) => onChange(clamp(Math.round((value + d) * 100) / 100, min, max));
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label={`Decrease ${label ?? ''}`}
        onClick={() => bump(-step)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface2 active:opacity-60"
      >
        <I n="minus" className="h-5 w-5" />
      </button>
      <NumInput
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        className={`tnum min-w-0 bg-transparent text-center font-bold outline-none ${inputClass}`}
      />
      <button
        type="button"
        aria-label={`Increase ${label ?? ''}`}
        onClick={() => bump(step)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface2 active:opacity-60"
      >
        <I n="plus" className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Labeled big number box for forms */
export function NumBox({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <label className="block rounded-xl border border-line bg-surface px-3 py-2">
      <span className="text-xs text-muted">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <NumInput
        value={value}
        onChange={onChange}
        label={label}
        className="tnum block w-full bg-transparent text-2xl font-bold outline-none"
      />
    </label>
  );
}

export function TextBox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-xl border border-line bg-surface px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted/60"
      />
    </label>
  );
}

/* ---------- progress ---------- */

export function Ring({
  value,
  goal,
  size = 128,
  stroke = 12,
  children,
}: {
  value: number;
  goal: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className="fill-none stroke-accent transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Bar({ value, goal, label, unit }: { value: number; goal: number; label: string; unit: string }) {
  const p = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tnum font-semibold">
          {Math.round(value)}
          <span className="text-muted"> / {Math.round(goal)} {unit}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}

/* ---------- misc hooks ---------- */

export function useTick(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useChartColors() {
  const q = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setDark(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return dark
    ? { accent: '#bef264', muted: '#8ca094', grid: '#263a2d', surface: '#132119', ink: '#ecf3ed' }
    : { accent: '#15803d', muted: '#627067', grid: '#d8e0d9', surface: '#ffffff', ink: '#111c15' };
}

/* ---------- feedback ---------- */

let audioCtx: AudioContext | null = null;
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
    void audioCtx?.resume();
  } catch {
    /* ignore */
  }
}

export function alertDone() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    /* ignore */
  }
  try {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.35);
  } catch {
    /* ignore */
  }
}

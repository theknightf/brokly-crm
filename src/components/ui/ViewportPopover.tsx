'use client';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type PopoverAlign = 'start' | 'center' | 'end';

export interface ViewportPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The trigger element the popover anchors to. */
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: PopoverAlign;
  /** Vertical gap between anchor and popover. */
  sideOffset?: number;
  /** Minimum inset from the edge of the viewport. */
  gutter?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Preferred max height; clamps further to available viewport space. */
  preferredMaxHeight?: number;
  /** Recompute position when this value changes (e.g. selection count). */
  recomputeKey?: unknown;
  /** Render as a bottom sheet on small screens (default true). */
  mobileSheet?: boolean;
  sheetBreakpoint?: number;
  zIndex?: number;
  role?: string;
  className?: string;
  children: React.ReactNode;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export default function ViewportPopover({
  open,
  onClose,
  anchorRef,
  align = 'start',
  sideOffset = 8,
  gutter = 8,
  minWidth = 220,
  maxWidth,
  preferredMaxHeight,
  recomputeKey,
  mobileSheet = true,
  sheetBreakpoint = 640,
  zIndex = 60,
  role,
  className = '',
  children,
}: ViewportPopoverProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevRectRef = useRef<Rect | null>(null);

  // Detect small screens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${sheetBreakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    const onMqChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener?.('change', onMqChange);
    return () => mq.removeEventListener?.('change', onMqChange);
  }, [sheetBreakpoint]);

  const compute = useCallback(() => {
    const anchor = anchorRef.current;
    const content = contentRef.current;
    if (!anchor || !content) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = anchor.getBoundingClientRect();

    // Width: at least the anchor width / minWidth, clamped to the viewport.
    let width = Math.max(a.width, minWidth);
    if (maxWidth) width = Math.min(width, maxWidth);
    width = Math.min(width, vw - gutter * 2);
    // Measure at the intended width so wrapping matches the final layout.
    content.style.width = `${width}px`;
    const natural = content.scrollHeight;

    const availBelow = Math.max(0, vh - gutter - (a.bottom + sideOffset));
    const availAbove = Math.max(0, a.top - sideOffset - gutter);
    const pref = preferredMaxHeight ?? 360;

    let side: 'top' | 'bottom';
    let maxHeight: number;
    if (natural <= availBelow) {
      side = 'bottom';
      maxHeight = Math.min(pref, availBelow);
    } else if (natural <= availAbove) {
      side = 'top';
      maxHeight = Math.min(pref, availAbove);
    } else {
      // Not enough room on either side — use the larger side and scroll.
      side = availBelow >= availAbove ? 'bottom' : 'top';
      maxHeight = Math.max(96, side === 'bottom' ? availBelow : availAbove);
    }

    let top = side === 'bottom' ? a.bottom + sideOffset : a.top - sideOffset - maxHeight;
    top = Math.max(gutter, Math.min(top, vh - gutter));

    let left: number;
    if (align === 'start') left = a.left;
    else if (align === 'end') left = a.right - width;
    else left = a.left + a.width / 2 - width / 2;
    left = Math.min(Math.max(gutter, left), vw - gutter - width);

    const next: Rect = { top, left, width, maxHeight };
    const prev = prevRectRef.current;
    if (
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.maxHeight === next.maxHeight
    ) {
      return;
    }
    prevRectRef.current = next;
    setRect(next);
  }, [anchorRef, align, gutter, minWidth, maxWidth, preferredMaxHeight, sideOffset]);

  // Measure + position on open, and reposition on scroll / resize.
  useEffect(() => {
    if (!open || isMobile || !anchorRef.current) return;
    compute();
    const onReposition = () => compute();
    window.addEventListener('scroll', onReposition, { capture: true, passive: true });
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, isMobile, compute, recomputeKey, anchorRef]);

  // Re-measure when the content height changes (async data loads, etc.).
  useEffect(() => {
    if (!open || isMobile || !contentRef.current) return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [open, isMobile, compute, recomputeKey]);

  // Reset the measured rect each time the menu opens so we re-measure.
  useLayoutEffect(() => {
    if (open) prevRectRef.current = null;
    else setRect(null);
  }, [open]);

  // Outside click + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (contentRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return; // the trigger toggles itself
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  // Responsive bottom sheet on small screens.
  if (isMobile && mobileSheet) {
    return createPortal(
      <div className="fixed inset-0" style={{ zIndex }} role={role} aria-modal="true">
        <div
          className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 bottom-0 bg-card rounded-t-2xl shadow-modal max-h-[85dvh] flex flex-col overflow-hidden slide-up-enter">
          <div
            className="pt-3 pb-1.5 flex justify-center flex-shrink-0 cursor-pointer"
            onPointerDown={onClose}
          >
            <div className="w-10 h-1.5 rounded-full bg-muted" />
          </div>
          <div className={`overflow-y-auto flex-1 ${className}`}>{children}</div>
        </div>
      </div>,
      document.body
    );
  }

  const measured = rect !== null;
  const style: React.CSSProperties = measured
    ? {
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxHeight: rect.maxHeight,
        zIndex,
      }
    : {
        position: 'fixed',
        top: 0,
        left: -99999,
        width: Math.max(anchorRef.current?.getBoundingClientRect().width ?? 0, minWidth),
        visibility: 'hidden',
        pointerEvents: 'none',
        zIndex,
      };

  return createPortal(
    <div
      ref={contentRef}
      style={style}
      role={role}
      className={`bg-card border border-border rounded-xl shadow-modal overflow-y-auto ${measured ? 'fade-in' : ''} ${className}`}
      aria-hidden={!measured}
    >
      {children}
    </div>,
    document.body
  );
}

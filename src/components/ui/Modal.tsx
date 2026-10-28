'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Opt-in: on small screens render the panel as a full-screen sheet instead of
   * the default 85dvh bottom sheet. Off by default — every existing modal keeps
   * its current layout.
   */
  mobileFullScreen?: boolean;
  /**
   * 'drawer': from `sm` up render a full-height slide-over docked to the inline-end
   * edge (keeps the page visible behind it); phones keep the bottom sheet.
   * Default 'center' leaves every existing modal unchanged.
   */
  variant?: 'center' | 'drawer';
}

const sizeClasses = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  mobileFullScreen = false,
  variant = 'center',
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const isDrawer = variant === 'drawer';

  // On small screens the panel is a bottom sheet; `mobileFullScreen` promotes it
  // to a full-screen sheet. Both fall back to a centred dialog from `sm` up,
  // or to a slide-over drawer when `variant="drawer"`.
  const panelClasses = isDrawer
    ? 'rounded-t-3xl max-h-[92dvh] sm:rounded-none sm:h-[100dvh] sm:max-h-[100dvh]'
    : mobileFullScreen
      ? 'rounded-none h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[85vh]'
      : 'rounded-t-3xl max-h-[85dvh] sm:max-h-[85vh]';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handleKey);
      // Lock body scroll and compensate for scrollbar to prevent layout shift
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      return () => {
        document.removeEventListener('keydown', handleKey);
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        document.body.classList.remove('modal-open');
      };
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[100] flex items-end ${
        isDrawer ? 'sm:items-stretch sm:justify-end' : 'sm:items-center justify-center sm:p-4'
      } ${isDrawer ? 'justify-center' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="absolute inset-0 z-[100] bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`relative z-[101] w-full ${sizeClasses[size]} bg-card ${
          isDrawer ? 'sm:border-s sm:border-border drawer-enter' : 'sm:rounded-2xl slide-up-enter'
        } ${panelClasses} shadow-modal flex flex-col overflow-hidden`}
        style={mobileFullScreen || isDrawer ? undefined : { maxHeight: 'min(85vh, 85dvh)' }}
      >
        {/* Header — fixed, never scrolls */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-border flex-shrink-0 bg-card">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-foreground">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform flex-shrink-0 ml-3"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — only this scrolls */}
        <div className="overflow-y-auto flex-1 overscroll-contain min-h-0">{children}</div>
      </div>
    </div>
  );

  // Portal to document.body breaks out of parent overflow/transform contexts,
  // ensuring fixed positioning is always relative to the viewport.
  return createPortal(modalContent, document.body);
}

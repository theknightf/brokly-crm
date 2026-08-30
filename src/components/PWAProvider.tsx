'use client';
import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAProvider() {
  const [standalone, setStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);

    // Register service worker
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Hook the Android/Chromium install prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS needs "Add to Home Screen" instructions
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    if (!isStandalone && isIOS && isSafari) {
      setIosInstall(true);
      setShowBanner(true);
    }

    const onInstalled = () => setShowBanner(false);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('appinstalled', () => setInstallPrompt(null));

    // Keep the Toaster clear of the iOS home indicator in standalone mode
    document.documentElement.classList.toggle('is-standalone', isStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone) return null;
  if (!showBanner) return null;
  if (!installPrompt && !iosInstall) return null;

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setShowBanner(false);
    }
  };

  return (
    <div className="fixed bottom-20 inset-x-4 z-[60] sm:hidden lg:hidden md:hidden">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur p-3 shadow-lg shadow-black/10 text-sm">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">Install Brokly</p>
          {iosInstall ? (
            <p className="text-muted-foreground text-xs mt-0.5 leading-relaxed">
              Tap the <span className="font-semibold text-foreground">Share</span> icon in Safari,
              then choose “Add to Home Screen”.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs mt-0.5 leading-relaxed">
              Add Brokly to your home screen for a faster, app-like experience.
            </p>
          )}
        </div>
        {!iosInstall && (
          <button
            onClick={handleInstall}
            className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-transform"
          >
            <Download size={14} />
            Install app
          </button>
        )}
        <button
          onClick={() => setShowBanner(false)}
          aria-label="Dismiss"
          className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:bg-border active:scale-95 transition-transform"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

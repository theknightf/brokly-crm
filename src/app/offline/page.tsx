'use client';
import React from 'react';
import { WifiOff, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function OfflinePage() {
  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4">
        <WifiOff size={32} />
      </div>
      <h1 className="text-xl font-bold mb-2">You are currently offline</h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
        Brokly CRM contains live customer data and requires an active internet connection to securely fetch and update records.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={handleReload}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs active:scale-95 transition-transform"
        >
          <RotateCcw size={14} />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground font-semibold text-xs active:scale-95 transition-transform"
        >
          <Home size={14} />
          Return Home
        </Link>
      </div>
    </div>
  );
}

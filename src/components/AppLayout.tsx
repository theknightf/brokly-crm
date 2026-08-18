'use client';
import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileBottomNav from './MobileBottomNav';
import QuickActions from './QuickActions';
import { useLanguage } from '@/contexts/LanguageContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { lang, t } = useLanguage();
  const isDashboard = pathname === '/';

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main area */}
      <div
        className="flex flex-col flex-1 min-w-0 transition-all duration-300"
        style={{ marginLeft: 0 }}
      >
        <Topbar
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onMobileMenuOpen={() => setMobileSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 py-6 pb-24 lg:pb-6">
            {!isDashboard && (
              <button
                type="button"
                onClick={goBack}
                className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
                aria-label={t('common.back')}
              >
                {lang === 'ar' ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                {t('common.back')}
              </button>
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation (small screens only) */}
      <MobileBottomNav onOpenMenu={() => setMobileSidebarOpen(true)} />

      {/* Global quick actions launcher */}
      <QuickActions />
    </div>
  );
}

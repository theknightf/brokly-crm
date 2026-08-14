'use client';
import React from 'react';
import Link from 'next/link';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ChevronDown,
  Globe,
  Plus,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBell from './NotificationBell';

interface TopbarProps {
  onToggleSidebar: () => void;
  onMobileMenuOpen: () => void;
  sidebarCollapsed: boolean;
}

export default function Topbar({
  onToggleSidebar,
  onMobileMenuOpen,
  sidebarCollapsed,
}: TopbarProps) {
  const { t, lang, toggleLang } = useLanguage();
  const { user, profile } = useAuth();

  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const displayRole = profile?.role || user?.user_metadata?.role || 'agent';
  const initials = displayName
    .split(' ')
    .map((p: string) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-14 bg-card/80 backdrop-blur-md border-b border-border flex items-center px-4 gap-3 flex-shrink-0 z-20 sticky top-0">
      {/* Desktop toggle */}
      <button
        onClick={onToggleSidebar}
        className="hidden lg:flex btn-ghost p-2 rounded-lg"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      {/* Mobile menu */}
      <button
        onClick={onMobileMenuOpen}
        className="lg:hidden btn-ghost p-2 rounded-lg"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder={t('common.search')}
            className="input-base pl-9 py-1.5 text-sm h-9"
            suppressHydrationWarning
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Quick action: new lead */}
        <Link
          href="/leads-management?new=1"
          className="hidden sm:inline-flex btn-primary !h-9 !px-3 items-center gap-1.5 text-xs"
        >
          <Plus size={14} />
          <span className="hidden md:inline">{t('common.newLead')}</span>
        </Link>

        {/* Language toggle */}
        <button
          onClick={toggleLang}
          className="btn-ghost flex items-center gap-1.5 p-2 rounded-lg text-xs font-semibold"
          aria-label="Switch language"
          title="Language"
        >
          <Globe size={16} />
          <span className="hidden sm:inline">{lang === 'ar' ? 'EN' : 'عربي'}</span>
        </button>

        {/* Notifications */}
        <NotificationBell />

        {/* User menu */}
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            {initials}
          </div>
          <span className="hidden sm:block text-sm font-medium text-foreground truncate max-w-[120px]">
            {displayName}
          </span>
          <span className="hidden sm:block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {displayRole.replace('_', ' ')}
          </span>
          <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
        </button>
      </div>
    </header>
  );
}

'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ChevronDown,
  Globe,
  Plus,
  UserRound,
  Settings,
  LogOut,
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
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (q) router.push(`/leads-management?search=${encodeURIComponent(q)}`);
  };

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
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0 z-20 sticky top-0">
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
        <form onSubmit={submitSearch} className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="input-base pl-9 py-1.5 text-sm h-9"
            suppressHydrationWarning
          />
        </form>
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
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
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

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-card shadow-modal p-1.5 fade-in z-50">
              <div className="px-3 py-2.5 border-b border-border mb-1.5">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted"
              >
                <Settings size={15} /> Settings
              </Link>
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

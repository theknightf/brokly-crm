'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from './ui/AppLogo';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarClock,
  CalendarDays,
  UsersRound,
  BarChart3,
  Settings,
  ChevronLeft,
  Building,
  FolderOpen,
  ShieldCheck,
  LogOut,
  ListChecks,
  Calculator,
  Receipt,
  MapPin,
  KeyRound,
  Handshake,
  Phone,
  CopyCheck,
  Copy,
  CalendarCheck2,
  FileSpreadsheet,
} from 'lucide-react';
import { usePendingDuplicates } from '@/hooks/usePendingDuplicates';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole, canViewTeams } from '@/lib/roles';

interface NavItem {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
}

interface NavGroup {
  titleKey: string;
  descriptionKey?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    titleKey: 'nav.overview',
    descriptionKey: 'nav.overview.desc',
    items: [
      {
        id: 'nav-dashboard',
        labelKey: 'common.dashboard',
        icon: <LayoutDashboard size={18} />,
        href: '/',
      },
      {
        id: 'nav-attendance',
        labelKey: 'common.attendance',
        icon: <CalendarCheck2 size={18} />,
        href: '/attendance',
      },
    ],
  },
  {
    titleKey: 'nav.pipeline',
    descriptionKey: 'nav.pipeline.desc',
    items: [
      {
        id: 'nav-leads',
        labelKey: 'common.leads',
        icon: <Users size={18} />,
        href: '/leads-management',
      },
      {
        id: 'nav-duplicates',
        labelKey: 'common.duplicates',
        icon: <Copy size={18} />,
        href: '/duplicates',
      },
      {
        id: 'nav-customers',
        labelKey: 'common.customers',
        icon: <UserCheck size={18} />,
        href: '/customers',
      },
      {
        id: 'nav-followups',
        labelKey: 'common.followups',
        icon: <CalendarClock size={18} />,
        href: '/follow-ups',
      },
      {
        id: 'nav-reservations',
        labelKey: 'common.reservations',
        icon: <KeyRound size={18} />,
        href: '/reservations',
      },
      {
        id: 'nav-deals',
        labelKey: 'common.deals',
        icon: <Handshake size={18} />,
        href: '/deals',
      },
      {
        id: 'nav-call-logs',
        labelKey: 'common.callLogs',
        icon: <Phone size={18} />,
        href: '/call-logs',
      },
      {
        id: 'nav-calendar',
        labelKey: 'common.calendar',
        icon: <CalendarDays size={18} />,
        href: '/calendar',
      },
      {
        id: 'nav-workspace',
        labelKey: 'common.workspace',
        icon: <ListChecks size={18} />,
        href: '/workspace',
      },
    ],
  },
  {
    titleKey: 'nav.management',
    descriptionKey: 'nav.management.desc',
    items: [
      {
        id: 'nav-locations',
        labelKey: 'common.locations',
        icon: <MapPin size={18} />,
        href: '/locations',
      },
      {
        id: 'nav-projects',
        labelKey: 'common.projects',
        icon: <FolderOpen size={18} />,
        href: '/projects',
      },
      {
        id: 'nav-units',
        labelKey: 'common.units',
        icon: <Building size={18} />,
        href: '/units',
      },
      {
        id: 'nav-teams',
        labelKey: 'common.teams',
        icon: <UsersRound size={18} />,
        href: '/teams',
      },
      {
        id: 'nav-reports',
        labelKey: 'common.reports',
        icon: <BarChart3 size={18} />,
        href: '/reports',
      },
      {
        id: 'nav-calculator',
        labelKey: 'common.unitCalculator',
        icon: <Calculator size={18} />,
        href: '/calculator',
      },
    ],
  },
  {
    titleKey: 'nav.system',
    descriptionKey: 'nav.system.desc',
    items: [
      {
        id: 'nav-expenses',
        labelKey: 'common.expenses',
        icon: <Receipt size={18} />,
        href: '/expenses',
      },
      {
        id: 'nav-duplicate-leads',
        labelKey: 'common.duplicateLeads',
        icon: <CopyCheck size={18} />,
        href: '/duplicate-leads',
      },
      {
        id: 'nav-import-history',
        labelKey: 'common.importHistory',
        icon: <FileSpreadsheet size={18} />,
        href: '/import-history',
      },
      {
        id: 'nav-admin',
        labelKey: 'common.admin',
        icon: <ShieldCheck size={18} />,
        href: '/admin',
      },
      {
        id: 'nav-settings',
        labelKey: 'common.settings',
        icon: <Settings size={18} />,
        href: '/settings',
      },
    ],
  },
];

/**
 * Role-based reordering: Sales users get their pipeline + calculator pushed to
 * the top (Workspace, Leads, Customers, Follow-ups, Calculator), management
 * users get Projects/Reports/Teams up front, admins keep the default order.
 * Priority values: lower = shown earlier. Items not listed keep a neutral 100.
 */
const ROLE_ITEM_PRIORITY: Record<string, Record<string, number>> = {
  sales: {
    'nav-dashboard': 1,
    'nav-attendance': 2,
    'nav-workspace': 3,
    'nav-leads': 4,
    'nav-customers': 5,
    'nav-followups': 6,
    'nav-reservations': 7,
    'nav-deals': 8,
    'nav-call-logs': 9,
    'nav-calendar': 10,
    'nav-calculator': 11,
    'nav-locations': 12,
    'nav-projects': 13,
    'nav-reports': 14,
    'nav-teams': 15,
    'nav-expenses': 16,
    'nav-settings': 17,
    'nav-admin': 18,
  },
  management: {
    'nav-dashboard': 1,
    'nav-attendance': 2,
    'nav-projects': 3,
    'nav-reports': 4,
    'nav-calculator': 5,
    'nav-teams': 6,
    'nav-locations': 7,
    'nav-leads': 8,
    'nav-customers': 9,
    'nav-followups': 10,
    'nav-reservations': 11,
    'nav-deals': 12,
    'nav-call-logs': 13,
    'nav-calendar': 14,
    'nav-workspace': 15,
    'nav-expenses': 16,
    'nav-settings': 17,
    'nav-admin': 18,
  },
};

const ROLE_GROUP_ORDER: Record<string, string[]> = {
  sales: ['nav.overview', 'nav.pipeline', 'nav.management', 'nav.system'],
  management: ['nav.overview', 'nav.management', 'nav.pipeline', 'nav.system'],
};

function roleClassOf(role?: string): 'sales' | 'management' | 'admin' {
  if (!role) return 'admin';
  if (role === 'agent' || role === 'senior_agent' || role === 'telecaller') return 'sales';
  if (role === 'broker' || role === 'branch_manager' || role === 'team_leader') return 'management';
  return 'admin';
}

export function reorderNavForRole(
  role?: string,
  base: NavGroup[] = navGroups
): NavGroup[] {
  const cls = roleClassOf(role);
  if (cls === 'admin') return base;
  const priorities = ROLE_ITEM_PRIORITY[cls] || {};
  const groupOrder = ROLE_GROUP_ORDER[cls] || [];
  return [...base]
    .sort((a, b) => {
      const ia = groupOrder.indexOf(a.titleKey);
      const ib = groupOrder.indexOf(b.titleKey);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => (priorities[a.id] ?? 100) - (priorities[b.id] ?? 100)),
    }));
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const nav = reorderNavForRole(profile?.role);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-card border-e border-border sidebar-transition flex-shrink-0 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarContent collapsed={collapsed} isActive={isActive} nav={nav} />
      </aside>

      {/* Mobile sidebar — single brand header lives inside SidebarContent
          (a second header here used to render the Brokly logo twice) */}
      <aside
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={`fixed inset-y-0 start-0 z-40 flex flex-col w-60 bg-card border-e border-border shadow-2xl lg:hidden sidebar-transition ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        <SidebarContent
          collapsed={false}
          isActive={isActive}
          nav={nav}
          onNavigate={onMobileClose}
          headerAction={
            <button onClick={onMobileClose} className="btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close menu">
              <ChevronLeft size={16} className="rtl:rotate-180" />
            </button>
          }
        />
      </aside>
    </>
  );
}

function SidebarContent({
  collapsed,
  isActive,
  nav,
  headerAction,
  onNavigate,
}: {
  collapsed: boolean;
  isActive: (href: string) => boolean;
  nav: NavGroup[];
  headerAction?: React.ReactNode;
  onNavigate?: () => void;
}) {
  const { user, profile, signOut } = useAuth();
  const { t } = useLanguage();
  const pendingDuplicates = usePendingDuplicates();
  const badgeFor = (item: NavItem): number | undefined =>
    item.id === 'nav-duplicates' ? (pendingDuplicates > 0 ? pendingDuplicates : undefined) : item.badge;

  const isAdminOrOwner = isAdminRole(profile?.role);
  const canWatchTeams = canViewTeams(profile?.role);
  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const displayRole = profile?.role || user?.user_metadata?.role || 'agent';
  const initials = displayName
    .split(' ')
    .map((p: string) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo — the single brand header for desktop and mobile */}
      <div
        className={`flex items-center h-14 border-b border-border flex-shrink-0 ${
          collapsed ? 'justify-center px-2' : 'px-4 gap-2'
        }`}
      >
        <AppLogo size={28} />
        {!collapsed && (
          <span className="font-bold text-base text-lime-gradient truncate">Brokly</span>
        )}
        {!collapsed && headerAction && <span className="ms-auto flex items-center">{headerAction}</span>}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-3" aria-label="Main">
        {nav
          .map((group) => ({
            ...group,
            items: group.items.filter(
              (item) =>
                (isAdminOrOwner || (item.id !== 'nav-admin' && item.id !== 'nav-expenses' && item.id !== 'nav-duplicate-leads')) &&
                (isAdminOrOwner || canWatchTeams || item.id !== 'nav-import-history') &&
                (canWatchTeams || item.id !== 'nav-teams')
            ),
          }))
          .filter((group) => group.items.length > 0)
          .map((group, gi) => (
               <div key={`group-${group.titleKey}`} className={gi > 0 ? 'pt-3 border-t border-border' : ''}>
               {!collapsed && (
                 <>
                   <p className="px-3 mb-0.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                     {t(group.titleKey)}
                   </p>
                   {group.descriptionKey && (
                     <p className="px-3 mb-2 text-xs leading-snug text-muted-foreground opacity-80">
                       {t(group.descriptionKey)}
                     </p>
                   )}
                 </>
               )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`nav-item relative group ${
                        isActive(item.href) ? 'nav-item-active' : ''
                      } ${collapsed ? 'justify-center px-2' : ''}`}
                      title={collapsed ? t(item.labelKey) : undefined}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      aria-label={collapsed ? t(item.labelKey) : undefined}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{t(item.labelKey)}</span>
                          {badgeFor(item) !== undefined && (
                            <span
                              className="bg-primary text-primary-foreground text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center tabular-nums"
                              aria-label={`${badgeFor(item)} pending`}
                            >
                              {(badgeFor(item) as number) > 99 ? '99+' : badgeFor(item)}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && badgeFor(item) !== undefined && (
                        <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-primary rounded-full" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </nav>

      {/* Bottom user card */}
      <div className={`border-t border-border p-3 flex-shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={handleSignOut}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Sign out"
            aria-label="Sign out"
          >
            {initials}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-xl bg-zinc-500/10 p-2.5">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <div className="flex items-center gap-1">
                  <Building size={11} className="text-muted-foreground flex-shrink-0" aria-hidden />
                  <p className="text-xs text-muted-foreground truncate capitalize">
                    {displayRole.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-lg flex items-center justify-center flex-shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground opacity-70 text-center">Made by Faris Mustafa</p>
          </div>
        )}
      </div>
    </div>
  );
}

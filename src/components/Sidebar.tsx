'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from './ui/AppLogo';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarClock,
  UsersRound,
  BarChart3,
  Settings,
  ChevronRight,
  Building2,
  FolderOpen,
  ShieldCheck,
  LogOut,
  ListChecks,
  Calculator,
  Receipt,
  MapPin,
} from 'lucide-react';
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

const navGroups: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: 'nav.overview',
    items: [
      {
        id: 'nav-dashboard',
        labelKey: 'common.dashboard',
        icon: <LayoutDashboard size={18} />,
        href: '/dashboard',
      },
    ],
  },
  {
    titleKey: 'nav.pipeline',
    items: [
      {
        id: 'nav-leads',
        labelKey: 'common.leads',
        icon: <Users size={18} />,
        href: '/leads-management',
        badge: 14,
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
        badge: 5,
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
        icon: <Building2 size={18} />,
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
    items: [
      {
        id: 'nav-expenses',
        labelKey: 'common.expenses',
        icon: <Receipt size={18} />,
        href: '/expenses',
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
    'nav-workspace': 2,
    'nav-leads': 3,
    'nav-customers': 4,
    'nav-followups': 5,
    'nav-calculator': 6,
    'nav-locations': 7,
    'nav-projects': 8,
    'nav-reports': 9,
    'nav-teams': 10,
    'nav-expenses': 11,
    'nav-settings': 12,
    'nav-admin': 13,
  },
  management: {
    'nav-dashboard': 1,
    'nav-projects': 2,
    'nav-reports': 3,
    'nav-calculator': 4,
    'nav-teams': 5,
    'nav-locations': 6,
    'nav-leads': 7,
    'nav-customers': 8,
    'nav-followups': 9,
    'nav-workspace': 10,
    'nav-expenses': 11,
    'nav-settings': 12,
    'nav-admin': 13,
  },
};

const ROLE_GROUP_ORDER: Record<string, string[]> = {
  sales: ['nav.overview', 'nav.pipeline', 'nav.management', 'nav.system'],
  management: ['nav.overview', 'nav.management', 'nav.pipeline', 'nav.system'],
};

function roleClassOf(role?: string): 'sales' | 'management' | 'admin' {
  if (!role) return 'admin';
  if (role === 'agent' || role === 'senior_agent' || role === 'telecaller') return 'sales';
  if (role === 'broker' || role === 'branch_manager') return 'management';
  return 'admin';
}

export function reorderNavForRole(
  role?: string,
  base: { titleKey: string; items: NavItem[] }[] = navGroups
): { titleKey: string; items: NavItem[] }[] {
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
    if (href === '/dashboard' && pathname === '/') return true;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const nav = reorderNavForRole(profile?.role);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-card border-r border-border sidebar-transition flex-shrink-0 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarContent collapsed={collapsed} isActive={isActive} nav={nav} />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-60 bg-card border-r border-border lg:hidden sidebar-transition ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-border">
          <div className="flex items-center gap-2">
            <AppLogo size={28} />
            <span className="font-bold text-base text-foreground">Brokly</span>
          </div>
          <button onClick={onMobileClose} className="btn-ghost p-1.5">
            <ChevronRight size={16} />
          </button>
        </div>
        <SidebarContent collapsed={false} isActive={isActive} nav={nav} />
      </aside>
    </>
  );
}

function SidebarContent({
  collapsed,
  isActive,
  nav = navGroups,
}: {
  collapsed: boolean;
  isActive: (href: string) => boolean;
  nav?: { titleKey: string; items: NavItem[] }[];
}) {
  const { user, profile, signOut } = useAuth();
  const { t } = useLanguage();

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
      {/* Logo */}
      <div
        className={`flex items-center h-14 border-b border-border flex-shrink-0 ${
          collapsed ? 'justify-center px-2' : 'px-4 gap-2'
        }`}
      >
        <AppLogo size={28} />
        {!collapsed && <span className="font-bold text-base text-foreground truncate">Brokly</span>}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups
          .map((group) => ({
            ...group,
            items: group.items.filter(
              (item) =>
                (isAdminOrOwner || (item.id !== 'nav-admin' && item.id !== 'nav-expenses')) &&
                (canWatchTeams || item.id !== 'nav-teams')
            ),
          }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={`group-${group.titleKey}`}>
              {!collapsed && (
                <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t(group.titleKey)}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href === '/dashboard' ? '/' : item.href}
                      className={`nav-item relative group ${
                        isActive(item.href) ? 'nav-item-active' : ''
                      } ${collapsed ? 'justify-center px-2' : ''}`}
                      title={collapsed ? t(item.labelKey) : undefined}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{t(item.labelKey)}</span>
                          {item.badge !== undefined && (
                            <span className="bg-primary text-primary-foreground text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && item.badge !== undefined && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                      )}
                      {collapsed && (
                        <span className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                          {t(item.labelKey)}
                          {item.badge !== undefined && ` (${item.badge})`}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </nav>

      {/* Bottom user card */}
      <div
        className={`border-t border-border p-3 flex-shrink-0 ${collapsed ? 'flex justify-center' : ''}`}
      >
        {collapsed ? (
          <button
            onClick={handleSignOut}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold hover:bg-primary/80 transition-colors"
            title="Sign out"
          >
            {initials}
          </button>
        ) : (
          <div className="flex flex-col gap-2 px-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <div className="flex items-center gap-1">
                  <Building2 size={10} className="text-muted-foreground flex-shrink-0" />
                  <p className="text-xs text-muted-foreground truncate capitalize">
                    {displayRole.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="btn-ghost p-1.5 rounded-lg flex-shrink-0"
                title="Sign out"
              >
                <LogOut size={14} className="text-muted-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center">
              Made by Faris Mustafa
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

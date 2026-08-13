// Single source of truth for cross-cutting UI tokens.
// Keep color/style maps here instead of redefining them per screen so badges,
// charts, reports and filters all stay visually consistent.

/** Canonical pipeline stage/status order shown in filters, pickers and reports. */
export const ALL_STATUSES: string[] = [
  'Fresh Leads',
  'Cold Calls',
  'Pending Leads',
  'Following Up',
  'Meeting',
  'Interested',
  'Not Interested',
  'Cancellation',
  'Done Deal',
  'Duplicate Leads',
  'Wrong Number',
  'Data Rotation',
  'Closed Number',
  'No Answer',
  'No Answer At All',
  'Low Budget',
  'Reschedule Meeting',
  'Reservation',
];

/** Pipeline status brand colors. Keys match lead.status values in DB. */
export const STATUS_COLORS: Record<string, string> = {
  'Fresh Leads': 'bg-blue-100 text-blue-700',
  'Cold Calls': 'bg-cyan-100 text-cyan-700',
  'Pending Leads': 'bg-yellow-100 text-yellow-700',
  'Following Up': 'bg-indigo-100 text-indigo-700',
  Meeting: 'bg-purple-100 text-purple-700',
  Interested: 'bg-emerald-100 text-emerald-700',
  'Not Interested': 'bg-red-100 text-red-700',
  Cancellation: 'bg-orange-100 text-orange-700',
  'Done Deal': 'bg-green-100 text-green-700',
  'Duplicate Leads': 'bg-gray-100 text-gray-600',
  'Wrong Number': 'bg-rose-100 text-rose-700',
  'Data Rotation': 'bg-teal-100 text-teal-700',
  'Closed Number': 'bg-slate-100 text-slate-600',
  'No Answer': 'bg-amber-100 text-amber-700',
  'No Answer At All': 'bg-amber-100 text-amber-800',
  'Low Budget': 'bg-pink-100 text-pink-700',
  'Reschedule Meeting': 'bg-violet-100 text-violet-700',
  Reservation: 'bg-amber-100 text-amber-700',
  'All Leads': 'bg-muted text-muted-foreground',
};

/** Emoji-ish glyphs used by the dashboard status grid. */
export const STATUS_ICONS: Record<string, string> = {
  'Fresh Leads': '🌱',
  'Cold Calls': '📞',
  'Pending Leads': '⏳',
  'Following Up': '🔄',
  Meeting: '🤝',
  Interested: '⭐',
  'Not Interested': '❌',
  Cancellation: '🚫',
  'Done Deal': '✅',
  'Duplicate Leads': '📋',
  'Wrong Number': '📵',
  'Data Rotation': '🔃',
  'Closed Number': '🔒',
  'No Answer': '📴',
  'No Answer At All': '🔕',
  'Low Budget': '💰',
  'Reschedule Meeting': '📅',
};

/** Call/WhatsApp outcome badge colors shared by call logs, reports & the admin tab. */
export const OUTCOME_CLS: Record<string, string> = {
  Reached: 'bg-emerald-100 text-emerald-700',
  Interested: 'bg-sky-100 text-sky-700',
  'Site Visit': 'bg-violet-100 text-violet-700',
  'Won Deal': 'bg-yellow-100 text-yellow-700',
  'Not Interested': 'bg-red-100 text-red-700',
  'Call back later': 'bg-amber-100 text-amber-700',
  'No Answer': 'bg-muted text-muted-foreground',
  'Wrong Number': 'bg-rose-100 text-rose-700',
  Busy: 'bg-amber-100 text-amber-700',
  Other: 'bg-muted text-muted-foreground',
  'WhatsApp Sent': 'bg-emerald-100 text-emerald-700',
  'Customer Replied': 'bg-sky-100 text-sky-700',
  'No Reply': 'bg-muted text-muted-foreground',
  'WhatsApp Follow-up': 'bg-amber-100 text-amber-700',
};

export function outcomeClass(outcome: string): string {
  return OUTCOME_CLS[outcome] || 'bg-muted text-muted-foreground';
}

export function colorClassOf(status: string): string {
  return STATUS_COLORS[status] || 'bg-muted text-muted-foreground';
}

/** Role → human label + badge color used across attendance/users tables. */
export const ROLE_BADGES: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  broker: { label: 'Broker', color: 'bg-indigo-100 text-indigo-700' },
  branch_manager: { label: 'Branch Manager', color: 'bg-cyan-100 text-cyan-700' },
  senior_agent: { label: 'Senior Agent', color: 'bg-emerald-100 text-emerald-700' },
  agent: { label: 'Sales', color: 'bg-amber-100 text-amber-700' },
  telecaller: { label: 'Telecaller', color: 'bg-rose-100 text-rose-700' },
  'Team Lead': { label: 'Team Lead', color: 'bg-teal-100 text-teal-700' },
};

export function roleBadgeOf(role?: string | null): { label: string; color: string } {
  if (!role) return { label: '—', color: 'bg-muted text-muted-foreground' };
  return ROLE_BADGES[role] ?? { label: role, color: 'bg-muted text-muted-foreground' };
}

export function roleLabelOf(role?: string | null): string {
  return roleBadgeOf(role).label;
}

/** Follow-up lifecycle status colors (Follow-ups + Workspace tab badges). */
export const FOLLOW_UP_STATUS_CLS: Record<string, string> = {
  Completed: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Overdue: 'bg-red-100 text-red-600',
  'In Progress': 'bg-blue-100 text-blue-700',
  Cancelled: 'bg-muted text-muted-foreground',
};

export function followUpStatusClass(status: string): string {
  return FOLLOW_UP_STATUS_CLS[status] || 'bg-muted text-muted-foreground';
}

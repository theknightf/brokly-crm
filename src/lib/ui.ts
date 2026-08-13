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
  'Fresh Leads': 'bg-gold-soft text-gold',
  'Cold Calls': 'bg-dusk-soft text-dusk',
  'Pending Leads': 'bg-muted text-muted-foreground',
  'Following Up': 'bg-teal-soft text-teal',
  Meeting: 'bg-dusk-soft text-dusk',
  Interested: 'bg-teal-soft text-teal',
  'Not Interested': 'bg-clay-soft text-clay',
  Cancellation: 'bg-clay-soft text-clay',
  'Done Deal': 'bg-sage-soft text-sage',
  'Duplicate Leads': 'bg-muted text-muted-foreground',
  'Wrong Number': 'bg-clay-soft text-clay',
  'Data Rotation': 'bg-dusk-soft text-dusk',
  'Closed Number': 'bg-muted text-muted-foreground',
  'No Answer': 'bg-gold-soft text-gold',
  'No Answer At All': 'bg-gold-soft text-gold-dark',
  'Low Budget': 'bg-muted text-muted-foreground',
  'Reschedule Meeting': 'bg-gold-soft text-gold',
  Reservation: 'bg-gold-soft text-gold-dark',
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
  Reached: 'bg-teal-soft text-teal',
  Interested: 'bg-teal-soft text-teal',
  'Site Visit': 'bg-dusk-soft text-dusk',
  'Won Deal': 'bg-sage-soft text-sage',
  'Not Interested': 'bg-clay-soft text-clay',
  'Call back later': 'bg-gold-soft text-gold',
  'No Answer': 'bg-muted text-muted-foreground',
  'Wrong Number': 'bg-clay-soft text-clay',
  Busy: 'bg-gold-soft text-gold',
  Other: 'bg-muted text-muted-foreground',
  'WhatsApp Sent': 'bg-teal-soft text-teal',
  'Customer Replied': 'bg-teal-soft text-teal',
  'No Reply': 'bg-muted text-muted-foreground',
  'WhatsApp Follow-up': 'bg-gold-soft text-gold',
};

export function outcomeClass(outcome: string): string {
  return OUTCOME_CLS[outcome] || 'bg-muted text-muted-foreground';
}

export function colorClassOf(status: string): string {
  return STATUS_COLORS[status] || 'bg-muted text-muted-foreground';
}

/** Role → human label + badge color used across attendance/users tables. */
export const ROLE_BADGES: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-dusk-soft text-dusk' },
  admin: { label: 'Admin', color: 'bg-teal-soft text-teal' },
  broker: { label: 'Broker', color: 'bg-sage-soft text-sage' },
  branch_manager: { label: 'Branch Manager', color: 'bg-dusk-soft text-dusk' },
  senior_agent: { label: 'Senior Agent', color: 'bg-sage-soft text-sage' },
  agent: { label: 'Sales', color: 'bg-gold-soft text-gold' },
  telecaller: { label: 'Telecaller', color: 'bg-clay-soft text-clay' },
  'Team Lead': { label: 'Team Lead', color: 'bg-teal-soft text-teal' },
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
  Completed: 'bg-sage-soft text-sage',
  Pending: 'bg-gold-soft text-gold',
  Overdue: 'bg-clay-soft text-clay',
  'In Progress': 'bg-dusk-soft text-dusk',
  Cancelled: 'bg-muted text-muted-foreground',
};

export function followUpStatusClass(status: string): string {
  return FOLLOW_UP_STATUS_CLS[status] || 'bg-muted text-muted-foreground';
}

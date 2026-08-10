export type LeadStatus =
  | 'All Leads'
  | 'Duplicate Leads'
  | 'Fresh Leads'
  | 'Cold Calls'
  | 'Pending Leads'
  | 'Following Up'
  | 'Meeting'
  | 'Cancellation'
  | 'Done Deal'
  | 'Not Interested'
  | 'Interested'
  | 'Wrong Number'
  | 'Data Rotation'
  | 'Closed Number'
  | 'No Answer'
  | 'No Answer At All'
  | 'Low Budget'
  | 'Reschedule Meeting';

export type LeadSource =
  | 'MagicBricks'
  | 'Referral'
  | '99acres'
  | 'Walk-in'
  | 'Facebook Ads'
  | 'Cold Call'
  | 'Instagram'
  | 'WhatsApp'
  | 'Website'
  | 'Other';

export type PropertyType =
  | '1BHK Apartment'
  | '2BHK Apartment'
  | '3BHK Apartment'
  | '4BHK Penthouse'
  | 'Villa'
  | 'Villa Plot'
  | 'Commercial Space'
  | 'Office Space';

/** Actions recorded against leads in activity_log — used by the Leads panel
 *  action filter AND the per-user activity reports. */
export type LeadAction =
  | 'Lead Added'
  | 'Lead Updated'
  | 'Lead Status Updated'
  | 'Lead Assigned'
  | 'Lead Deleted'
  | 'Comment Added'
  | 'Call Logged';

export const LEAD_ACTIONS: LeadAction[] = [
  'Lead Added',
  'Lead Updated',
  'Lead Status Updated',
  'Lead Assigned',
  'Lead Deleted',
  'Comment Added',
  'Call Logged',
];

export interface Lead {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  propertyType?: PropertyType;
  budgetMin?: number;
  budgetMax?: number;
  source?: LeadSource;
  agent?: string;
  agentInitials?: string;
  status?: LeadStatus;
  assignedTo?: string;
  assignedToName?: string;
  adminId?: string | null;
  adminName?: string | null;
  lastContact?: string;
  followUpDue?: string;
  createdAt?: string;
  notes?: string;
  location?: string;
  developer?: string;
  project?: string;
}

export const mockLeads: Lead[] = [];

export const ALL_STATUSES: LeadStatus[] = [
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
];

export const ALL_SOURCES: LeadSource[] = [
  'MagicBricks',
  'Referral',
  '99acres',
  'Walk-in',
  'Facebook Ads',
  'Cold Call',
  'Instagram',
  'WhatsApp',
  'Website',
  'Other',
];

export const ALL_PROPERTY_TYPES: PropertyType[] = [
  '1BHK Apartment',
  '2BHK Apartment',
  '3BHK Apartment',
  '4BHK Penthouse',
  'Villa',
  'Villa Plot',
  'Commercial Space',
  'Office Space',
];

export const STATUS_COLORS: Record<LeadStatus, string> = {
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
  'All Leads': 'bg-muted text-muted-foreground',
};
const ALL_AGENTS: any = null;

export { ALL_AGENTS };

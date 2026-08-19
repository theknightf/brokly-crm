// Canonical status lists & colors now live in @/lib/ui — re-exported here so
// existing page imports keep working while every consumer shares one source.
export { ALL_STATUSES, STATUS_COLORS } from '@/lib/ui';

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
  | 'Reschedule Meeting'
  | 'Reservation';

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
  referredTo?: string | null;
  referredToName?: string | null;
  referredBy?: string | null;
  referredByName?: string | null;
  adminId?: string | null;
  adminName?: string | null;
  lastContact?: string;
  followUpDue?: string;
  createdAt?: string;
  notes?: string;
  location?: string;
  developer?: string;
  project?: string;
  unit?: string;
  interestLevel?: string;
  leadNumber?: string;
  leadRating?: string;
  priority?: string;
  team?: string;
  csAgent?: string;
  unitId?: string | null;
  unitArea?: number;
  unitPrice?: number;
  totalPrice?: number;
  downPayment?: number;
  downPaymentPct?: number;
  installmentAmount?: number;
  installmentCount?: number;
  installmentFrequency?: number;
  paymentStartDate?: string;
  reservationAmount?: number;
  maintenanceFees?: number;
  remainingAmount?: number;
  paymentStatus?: string;
  reservationDate?: string;
  closingDate?: string;
  finalPrice?: number;
  commission?: number;
}

export const mockLeads: Lead[] = [];

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

const ALL_AGENTS: any = null;

export { ALL_AGENTS };

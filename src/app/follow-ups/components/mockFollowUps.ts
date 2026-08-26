export type FollowUpStatus = 'Pending' | 'In Progress' | 'Completed' | 'Overdue' | 'Cancelled';
export type FollowUpType = 'Call' | 'Email' | 'Site Visit' | 'Meeting' | 'WhatsApp' | 'Video Call';
export type FollowUpPriority = 'High' | 'Medium' | 'Low';
export type ContactType = 'Lead' | 'Customer';
export type RelationshipStatus =
  'New' | 'Nurturing' | 'Negotiating' | 'Closed Won' | 'Closed Lost' | 'At Risk' | 'Loyal';

export interface FollowUp {
  id: string;
  title: string;
  contactName: string;
  contactType: ContactType;
  contactPhone: string;
  contactEmail: string;
  type: FollowUpType;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  dueDate: string;
  dueTime: string;
  agent: string;
  agentInitials: string;
  notes: string;
  propertyInterest: string;
  createdAt: string;
  completedAt?: string;
  relationshipStatus?: RelationshipStatus;
  /** Linked lead id when this follow-up was scheduled from a lead. */
  leadId?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  contactType: ContactType;
  relationshipStatus: RelationshipStatus;
  propertyInterest: string;
  agent: string;
  agentInitials: string;
  lastContactDate: string;
  totalFollowUps: number;
}

export const ALL_FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
  'Overdue',
  'Cancelled',
];

export const ALL_FOLLOW_UP_TYPES: FollowUpType[] = [
  'Call',
  'Email',
  'Site Visit',
  'Meeting',
  'WhatsApp',
  'Video Call',
];

export const ALL_PRIORITIES: FollowUpPriority[] = ['High', 'Medium', 'Low'];

export const ALL_AGENTS = ['Arjun Sharma', 'Vikram Singh', 'Neha Patel', 'Priya Nair'];

export const ALL_RELATIONSHIP_STATUSES: RelationshipStatus[] = [
  'New',
  'Nurturing',
  'Negotiating',
  'Closed Won',
  'Closed Lost',
  'At Risk',
  'Loyal',
];

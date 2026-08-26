export type TeamRole = 'Broker' | 'Senior Agent' | 'Agent' | 'Junior Agent' | 'Team Lead';
export type TeamMemberStatus = 'Active' | 'Inactive';

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: TeamRole;
  email: string;
  phone: string;
  status: TeamMemberStatus;
  assignedLeads: number;
  closedDeals: number;
  conversionRate: number; // percentage
  totalRevenue: number; // in lakhs
  joinedAt: string;
}

export const ALL_ROLES: TeamRole[] = [
  'Broker',
  'Senior Agent',
  'Agent',
  'Junior Agent',
  'Team Lead',
];

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

export let mockTeamMembers: TeamMember[] = [
  {
    id: 'tm-001',
    name: 'Sarah Reynolds',
    initials: 'SR',
    role: 'Broker',
    email: 'sarah.reynolds@realtyflow.io',
    phone: '+91-98001-00001',
    status: 'Active',
    assignedLeads: 0,
    closedDeals: 42,
    conversionRate: 68,
    totalRevenue: 1240,
    joinedAt: '2022-01-15',
  },
  {
    id: 'tm-002',
    name: 'Arjun Sharma',
    initials: 'AS',
    role: 'Senior Agent',
    email: 'arjun.sharma@realtyflow.io',
    phone: '+91-98001-00002',
    status: 'Active',
    assignedLeads: 4,
    closedDeals: 28,
    conversionRate: 54,
    totalRevenue: 820,
    joinedAt: '2022-06-10',
  },
  {
    id: 'tm-003',
    name: 'Neha Patel',
    initials: 'NP',
    role: 'Agent',
    email: 'neha.patel@realtyflow.io',
    phone: '+91-98001-00003',
    status: 'Active',
    assignedLeads: 3,
    closedDeals: 19,
    conversionRate: 47,
    totalRevenue: 560,
    joinedAt: '2023-02-20',
  },
  {
    id: 'tm-004',
    name: 'Vikram Singh',
    initials: 'VS',
    role: 'Senior Agent',
    email: 'vikram.singh@realtyflow.io',
    phone: '+91-98001-00004',
    status: 'Active',
    assignedLeads: 3,
    closedDeals: 24,
    conversionRate: 51,
    totalRevenue: 710,
    joinedAt: '2022-09-05',
  },
  {
    id: 'tm-005',
    name: 'Priya Nair',
    initials: 'PN',
    role: 'Agent',
    email: 'priya.nair@realtyflow.io',
    phone: '+91-98001-00005',
    status: 'Active',
    assignedLeads: 2,
    closedDeals: 15,
    conversionRate: 43,
    totalRevenue: 430,
    joinedAt: '2023-07-12',
  },
  {
    id: 'tm-006',
    name: 'Rohan Mehta',
    initials: 'RM',
    role: 'Junior Agent',
    email: 'rohan.mehta@realtyflow.io',
    phone: '+91-98001-00006',
    status: 'Active',
    assignedLeads: 2,
    closedDeals: 6,
    conversionRate: 30,
    totalRevenue: 180,
    joinedAt: '2024-03-01',
  },
  {
    id: 'tm-007',
    name: 'Divya Kapoor',
    initials: 'DK',
    role: 'Team Lead',
    email: 'divya.kapoor@realtyflow.io',
    phone: '+91-98001-00007',
    status: 'Inactive',
    assignedLeads: 0,
    closedDeals: 11,
    conversionRate: 38,
    totalRevenue: 320,
    joinedAt: '2023-11-18',
  },
];

let memberCounter = 8;

export function addTeamMember(
  data: Omit<
    TeamMember,
    'id' | 'initials' | 'assignedLeads' | 'closedDeals' | 'conversionRate' | 'totalRevenue'
  >
): TeamMember {
  const initials = data.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const member: TeamMember = {
    ...data,
    id: `tm-${String(memberCounter++).padStart(3, '0')}`,
    initials,
    assignedLeads: 0,
    closedDeals: 0,
    conversionRate: 0,
    totalRevenue: 0,
  };
  mockTeamMembers = [...mockTeamMembers, member];
  return member;
}

export function updateTeamMember(id: string, data: Partial<TeamMember>): void {
  mockTeamMembers = mockTeamMembers.map((m) => (m.id === id ? { ...m, ...data } : m));
}

export function deleteTeamMember(id: string): void {
  mockTeamMembers = mockTeamMembers.filter((m) => m.id !== id);
}

/** Shared agent name list derived from active team members — used in Leads & Follow-ups dropdowns */
export function getActiveAgentNames(): string[] {
  return mockTeamMembers.filter((m) => m.status === 'Active').map((m) => m.name);
}

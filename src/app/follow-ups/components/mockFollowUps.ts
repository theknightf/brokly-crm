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

export const mockCustomerProfiles: CustomerProfile[] = [
  {
    id: 'cp-001',
    name: 'Meera Joshi',
    phone: '+91-10987-65432',
    email: 'meera.joshi@corporate.io',
    contactType: 'Customer',
    relationshipStatus: 'Loyal',
    propertyInterest: '3BHK Apartment – Unit 8C Powai',
    agent: 'Priya Nair',
    agentInitials: 'PN',
    lastContactDate: '2026-08-03',
    totalFollowUps: 4,
  },
  {
    id: 'cp-002',
    name: 'Ananya Shah',
    phone: '+91-76543-21098',
    email: 'ananya.shah@yahoo.com',
    contactType: 'Lead',
    relationshipStatus: 'Negotiating',
    propertyInterest: 'Villa – Heritage Villas',
    agent: 'Vikram Singh',
    agentInitials: 'VS',
    lastContactDate: '2026-08-01',
    totalFollowUps: 3,
  },
  {
    id: 'cp-003',
    name: 'Suresh Iyer',
    phone: '+91-90876-54321',
    email: 'suresh.iyer@techcorp.in',
    contactType: 'Lead',
    relationshipStatus: 'Nurturing',
    propertyInterest: 'Office Space – Prestige Tech Park',
    agent: 'Vikram Singh',
    agentInitials: 'VS',
    lastContactDate: '2026-08-02',
    totalFollowUps: 2,
  },
  {
    id: 'cp-004',
    name: 'Kavya Reddy',
    phone: '+91-54321-09876',
    email: 'kavya.reddy@company.in',
    contactType: 'Lead',
    relationshipStatus: 'At Risk',
    propertyInterest: 'Commercial Space – DLF Cyber City',
    agent: 'Priya Nair',
    agentInitials: 'PN',
    lastContactDate: '2026-08-03',
    totalFollowUps: 2,
  },
  {
    id: 'cp-005',
    name: 'Rohit Verma',
    phone: '+91-87654-32109',
    email: 'rohit.v@outlook.com',
    contactType: 'Lead',
    relationshipStatus: 'Nurturing',
    propertyInterest: '2BHK Apartment – Godrej Horizon',
    agent: 'Neha Patel',
    agentInitials: 'NP',
    lastContactDate: '2026-08-02',
    totalFollowUps: 1,
  },
  {
    id: 'cp-006',
    name: 'Amit Desai',
    phone: '+91-43210-98765',
    email: 'amit.desai@businessmail.com',
    contactType: 'Lead',
    relationshipStatus: 'New',
    propertyInterest: '4BHK Penthouse – Worli/BKC',
    agent: 'Vikram Singh',
    agentInitials: 'VS',
    lastContactDate: '2026-08-01',
    totalFollowUps: 1,
  },
];

export const mockFollowUps: FollowUp[] = [
  {
    id: 'fu-001',
    title: 'Follow up on site visit feedback',
    contactName: 'Ananya Shah',
    contactType: 'Lead',
    contactPhone: '+91-76543-21098',
    contactEmail: 'ananya.shah@yahoo.com',
    type: 'Call',
    status: 'Overdue',
    priority: 'High',
    dueDate: '2026-08-01',
    dueTime: '10:00',
    agent: 'Vikram Singh',
    agentInitials: 'VS',
    notes: 'She visited Heritage Villas Unit 14B. Need to get her final decision.',
    propertyInterest: 'Villa – Heritage Villas',
    createdAt: '2026-07-30',
    relationshipStatus: 'Negotiating',
  },
  {
    id: 'fu-002',
    title: 'Send revised pricing proposal',
    contactName: 'Suresh Iyer',
    contactType: 'Lead',
    contactPhone: '+91-90876-54321',
    contactEmail: 'suresh.iyer@techcorp.in',
    type: 'Email',
    status: 'Pending',
    priority: 'High',
    dueDate: '2026-08-05',
    dueTime: '11:00',
    agent: 'Vikram Singh',
    agentInitials: 'VS',
    notes: 'Client wants revised pricing for 5000 sqft office. Include parking details.',
    propertyInterest: 'Office Space – Prestige Tech Park',
    createdAt: '2026-08-02',
    relationshipStatus: 'Nurturing',
  },
  {
    id: 'fu-003',
    title: 'Schedule second site visit',
    contactName: 'Rohit Verma',
    contactType: 'Lead',
    contactPhone: '+91-87654-32109',
    contactEmail: 'rohit.v@outlook.com',
    type: 'WhatsApp',
    status: 'Pending',
    priority: 'Medium',
    dueDate: '2026-08-05',
    dueTime: '14:00',
    agent: 'Neha Patel',
    agentInitials: 'NP',
    notes: 'First visit went well. Wants to bring spouse for second visit.',
    propertyInterest: '2BHK Apartment – Godrej Horizon',
    createdAt: '2026-08-02',
    relationshipStatus: 'Nurturing',
  },
  {
    id: 'fu-004',
    title: 'Loan documentation assistance',
    contactName: 'Nisha Kapoor',
    contactType: 'Lead',
    contactPhone: '+91-80765-43210',
    contactEmail: 'nisha.kapoor@mail.com',
    type: 'Meeting',
    status: 'In Progress',
    priority: 'Medium',
    dueDate: '2026-08-07',
    dueTime: '15:30',
    agent: 'Neha Patel',
    agentInitials: 'NP',
    notes: 'First-time buyer needs help with home loan application. Connect with bank partner.',
    propertyInterest: '1BHK Apartment – Lodha Palava',
    createdAt: '2026-08-01',
    relationshipStatus: 'New',
  },
  {
    id: 'fu-005',
    title: 'Negotiate final price for commercial space',
    contactName: 'Kavya Reddy',
    contactType: 'Lead',
    contactPhone: '+91-54321-09876',
    contactEmail: 'kavya.reddy@company.in',
    type: 'Video Call',
    status: 'Overdue',
    priority: 'High',
    dueDate: '2026-08-03',
    dueTime: '12:00',
    agent: 'Priya Nair',
    agentInitials: 'PN',
    notes: 'Client wants 5% discount. Check with broker before confirming.',
    propertyInterest: 'Commercial Space – DLF Cyber City',
    createdAt: '2026-07-31',
    relationshipStatus: 'At Risk',
  },
  {
    id: 'fu-006',
    title: 'Post-purchase handover checklist',
    contactName: 'Meera Joshi',
    contactType: 'Customer',
    contactPhone: '+91-10987-65432',
    contactEmail: 'meera.joshi@corporate.io',
    type: 'Call',
    status: 'Completed',
    priority: 'Low',
    dueDate: '2026-08-03',
    dueTime: '10:00',
    agent: 'Priya Nair',
    agentInitials: 'PN',
    notes: 'Confirmed handover date Dec 2026. Sent checklist via email.',
    propertyInterest: '3BHK Apartment – Unit 8C Powai',
    createdAt: '2026-08-01',
    completedAt: '2026-08-03',
    relationshipStatus: 'Loyal',
  },
  {
    id: 'fu-007',
    title: 'Qualify budget and timeline',
    contactName: 'Karan Malhotra',
    contactType: 'Lead',
    contactPhone: '+91-70654-32109',
    contactEmail: 'karan.m@startup.co',
    type: 'Call',
    status: 'Pending',
    priority: 'Medium',
    dueDate: '2026-08-04',
    dueTime: '11:30',
    agent: 'Arjun Sharma',
    agentInitials: 'AS',
    notes: 'New lead from Instagram. Confirm budget range and preferred location.',
    propertyInterest: '2BHK Apartment – Bandra area',
    createdAt: '2026-08-03',
    relationshipStatus: 'New',
  },
  {
    id: 'fu-008',
    title: 'Confirm site visit appointment',
    contactName: 'Deepak Nair',
    contactType: 'Lead',
    contactPhone: '+91-65432-10987',
    contactEmail: 'deepak.nair@gmail.com',
    type: 'WhatsApp',
    status: 'Pending',
    priority: 'Low',
    dueDate: '2026-08-04',
    dueTime: '09:00',
    agent: 'Arjun Sharma',
    agentInitials: 'AS',
    notes: 'Send property brochure and confirm visit time.',
    propertyInterest: '2BHK Apartment – Hyderabad',
    createdAt: '2026-08-03',
    relationshipStatus: 'New',
  },
  {
    id: 'fu-009',
    title: 'Share penthouse floor plans',
    contactName: 'Amit Desai',
    contactType: 'Lead',
    contactPhone: '+91-43210-98765',
    contactEmail: 'amit.desai@businessmail.com',
    type: 'Email',
    status: 'Completed',
    priority: 'High',
    dueDate: '2026-08-01',
    dueTime: '16:00',
    agent: 'Vikram Singh',
    agentInitials: 'VS',
    notes: 'Sent Worli and BKC penthouse floor plans with sea-facing units highlighted.',
    propertyInterest: '4BHK Penthouse – Worli/BKC',
    createdAt: '2026-07-30',
    completedAt: '2026-08-01',
    relationshipStatus: 'New',
  },
  {
    id: 'fu-010',
    title: 'Referral introduction call',
    contactName: 'Priya Mehta',
    contactType: 'Lead',
    contactPhone: '+91-98765-43210',
    contactEmail: 'priya.mehta@gmail.com',
    type: 'Call',
    status: 'In Progress',
    priority: 'Medium',
    dueDate: '2026-08-06',
    dueTime: '13:00',
    agent: 'Arjun Sharma',
    agentInitials: 'AS',
    notes: 'She mentioned her colleague is also looking for 2BHK. Get referral details.',
    propertyInterest: '3BHK Apartment – Powai',
    createdAt: '2026-08-02',
    relationshipStatus: 'Nurturing',
  },
  {
    id: 'fu-011',
    title: 'Plot registration guidance',
    contactName: 'Sunita Krishnan',
    contactType: 'Lead',
    contactPhone: '+91-32109-87654',
    contactEmail: 'sunita.k@personal.net',
    type: 'Meeting',
    status: 'Pending',
    priority: 'Low',
    dueDate: '2026-08-08',
    dueTime: '10:30',
    agent: 'Neha Patel',
    agentInitials: 'NP',
    notes: 'Explain registration process and stamp duty for villa plots.',
    propertyInterest: 'Villa Plot – Gated Community Hyderabad',
    createdAt: '2026-08-02',
    relationshipStatus: 'Nurturing',
  },
  {
    id: 'fu-012',
    title: 'Cancellation follow-up',
    contactName: 'Farhan Shaikh',
    contactType: 'Lead',
    contactPhone: '+91-21098-76543',
    contactEmail: 'farhan.s@gmail.com',
    type: 'Call',
    status: 'Cancelled',
    priority: 'Low',
    dueDate: '2026-07-30',
    dueTime: '15:00',
    agent: 'Arjun Sharma',
    agentInitials: 'AS',
    notes: 'Lead chose Godrej Properties. Cancelled follow-up.',
    propertyInterest: '3BHK Apartment – Pune',
    createdAt: '2026-07-28',
    relationshipStatus: 'Closed Lost',
  },
];

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

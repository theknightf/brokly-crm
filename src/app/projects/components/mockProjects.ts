export type ProjectStatus = 'Active' | 'Inactive';

export interface Developer {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  developerId: string;
  developerName: string;
  status: ProjectStatus;
  createdAt: string;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
  pitchSummary?: string;
  whyBuy?: string;
  sellingPoints?: string[];
  imagePath?: string;
  location?: string;
  fullDescription?: string;
  developerDescription?: string;
  paymentPlanSummary?: string;
}

export const DEVELOPERS: Developer[] = [
  { id: 'dev-001', name: 'Palm Hills' },
  { id: 'dev-002', name: 'Emaar' },
  { id: 'dev-003', name: 'SODIC' },
  { id: 'dev-004', name: 'Ora Developers' },
  { id: 'dev-005', name: 'Tatweer Misr' },
  { id: 'dev-006', name: 'Mountain View' },
];

export const mockProjects: Project[] = [
  {
    id: 'proj-001',
    name: 'Palm Hills New Cairo',
    developerId: 'dev-001',
    developerName: 'Palm Hills',
    status: 'Active',
    createdAt: '2026-01-10',
    location: 'South Investors Area, New Cairo',
    latitude: 29.9984,
    longitude: 31.4385,
    radiusM: 300,
    pitchSummary: 'Premium gated community with private gardens, clubhouse & smart home tech.',
    fullDescription:
      'Palm Hills New Cairo is a master-planned gated community set on 900 feddans of landscaped greenery. The compound blends contemporary architecture with private gardens, a signature clubhouse, retail promenade and international schools within minutes.',
    developerDescription:
      'Palm Hills Developments is one of Egypt’s leading real estate developers, with 25+ years of experience and a portfolio spanning New Cairo, 6th of October, Alexandria and the North Coast.',
    whyBuy:
      'Best location in the district with direct access to the ring road and a fully finished, hand-over-ready infrastructure.',
    sellingPoints: ['60% finished & handed over', '0% down payment', '8-year installments'],
    paymentPlanSummary:
      'Starting from 0% down, 8-year installment plan with flexible payment milestones.',
  },
  {
    id: 'proj-002',
    name: 'Palm Hills October',
    developerId: 'dev-001',
    developerName: 'Palm Hills',
    status: 'Active',
    createdAt: '2026-01-10',
    location: 'Sheikh Zayed, 6th of October',
    latitude: 30.0255,
    longitude: 31.0044,
    radiusM: 300,
    pitchSummary: 'Family-oriented compound near schools, with a central park & sports facilities.',
    paymentPlanSummary: 'Down payment from 10%, installments up to 7 years.',
  },
  {
    id: 'proj-003',
    name: 'Palm Hills Alexandria',
    developerId: 'dev-001',
    developerName: 'Palm Hills',
    status: 'Active',
    createdAt: '2026-02-15',
    location: 'King Mariout, Alexandria',
    latitude: 30.8439,
    longitude: 29.7384,
    radiusM: 300,
    pitchSummary: 'Lakefront villas with private beaches and a 18-hole golf course.',
    paymentPlanSummary: '25% down, 5-year installment plan.',
  },
  {
    id: 'proj-004',
    name: 'Emaar Mirage City',
    developerId: 'dev-002',
    developerName: 'Emaar',
    status: 'Active',
    createdAt: '2026-01-20',
    location: 'Mirage City, New Cairo',
    latitude: 30.0228,
    longitude: 31.3936,
    radiusM: 300,
    pitchSummary: 'Emaar-branded community with championship golf, lakes and a central plaza.',
    fullDescription:
      'Mirage City by Emaar spans over 2,000 acres in the heart of New Cairo, featuring a championship golf course, man-made lakes, a central plaza with retail and dining, and home styles from apartments to villas.',
    developerDescription:
      'Emaar is a global developer with projects in 13 markets, known for world-class communities and timely delivery.',
    whyBuy:
      'Global brand quality and one of New Cairo’s largest green, master-planned destinations.',
    sellingPoints: ['Golf & lake views', '10% down payment', 'Emaar delivery track record'],
    paymentPlanSummary: '10% down, 6-year installments, handover in 2027.',
  },
  {
    id: 'proj-005',
    name: 'Emaar Uptown Cairo',
    developerId: 'dev-002',
    developerName: 'Emaar',
    status: 'Active',
    createdAt: '2026-02-01',
    location: 'Moqattam Heights, Cairo',
    latitude: 30.0164,
    longitude: 31.3093,
    radiusM: 300,
    pitchSummary: 'Iconic hilltop destination with panoramic Cairo views and cable car.',
    paymentPlanSummary: '15% down, installments up to 8 years.',
  },
  {
    id: 'proj-006',
    name: 'Emaar Golf Views',
    developerId: 'dev-002',
    developerName: 'Emaar',
    status: 'Inactive',
    createdAt: '2025-11-05',
    location: '6th of October',
    latitude: 30.0059,
    longitude: 30.9767,
    radiusM: 300,
    pitchSummary: 'Golf-front residences around the Katameya Dunes course.',
  },
  {
    id: 'proj-007',
    name: 'SODIC East',
    developerId: 'dev-003',
    developerName: 'SODIC',
    status: 'Active',
    createdAt: '2026-03-01',
    location: 'New Cairo',
    latitude: 30.0144,
    longitude: 31.4578,
    radiusM: 300,
    pitchSummary: 'Walkable community with offices, retail and green squares in the east.',
    paymentPlanSummary: '0% down with a 4-year handover and 9-year installments.',
  },
  {
    id: 'proj-008',
    name: 'SODIC West',
    developerId: 'dev-003',
    developerName: 'SODIC',
    status: 'Active',
    createdAt: '2026-03-01',
    location: 'Sheikh Zayed',
    latitude: 30.0355,
    longitude: 30.9902,
    radiusM: 300,
    pitchSummary: 'Mixed-use development anchoring the west expansion of Greater Cairo.',
  },
  {
    id: 'proj-009',
    name: 'Ora Zed East',
    developerId: 'dev-004',
    developerName: 'Ora Developers',
    status: 'Active',
    createdAt: '2026-04-10',
    location: 'New Cairo',
    latitude: 30.0055,
    longitude: 31.4611,
    radiusM: 300,
    pitchSummary: 'Zen-inspired gated community with a vast central park and running trails.',
    fullDescription:
      'Zed East is an 850-acre wellness-focused community in New Cairo, designed around a 100-acre central park with cycling paths, sports hubs, retail and residential zones from townhouses to apartments.',
    developerDescription:
      'Ora Developers is the premium brand behind Zed, built on a vision of wellness-first, pedestrian-friendly communities.',
    whyBuy: 'The park-first design delivers unmatched green space per resident in New Cairo.',
    sellingPoints: ['100-acre central park', 'Premium finishing', '5% down payment'],
    paymentPlanSummary: '5% down, installments up to 10 years.',
  },
  {
    id: 'proj-010',
    name: 'Ora Zed West',
    developerId: 'dev-004',
    developerName: 'Ora Developers',
    status: 'Inactive',
    createdAt: '2025-12-20',
    location: 'Sheikh Zayed',
    latitude: 30.0399,
    longitude: 30.9737,
    radiusM: 300,
    pitchSummary: 'Wellness community in the west with landscaped courtyards and retail.',
  },
  {
    id: 'proj-011',
    name: 'Tatweer Fouka Bay',
    developerId: 'dev-005',
    developerName: 'Tatweer Misr',
    status: 'Active',
    createdAt: '2026-05-01',
    location: 'North Coast',
    latitude: 30.8868,
    longitude: 29.1927,
    radiusM: 300,
    pitchSummary: 'Mediterranean resort with lagoons, beach clubs and summer event calendar.',
    paymentPlanSummary: '20% down, 4-year installments, seasonal ownership options.',
  },
  {
    id: 'proj-012',
    name: 'Tatweer D-Bay',
    developerId: 'dev-005',
    developerName: 'Tatweer Misr',
    status: 'Active',
    createdAt: '2026-05-15',
    location: 'North Coast',
    latitude: 30.9011,
    longitude: 29.1789,
    radiusM: 300,
    pitchSummary: 'Exclusive beachfront with private docks and a marina lifestyle.',
  },
  {
    id: 'proj-013',
    name: 'Mountain View iCity',
    developerId: 'dev-006',
    developerName: 'Mountain View',
    status: 'Active',
    createdAt: '2026-06-01',
    location: 'New Administrative Capital',
    latitude: 30.0088,
    longitude: 31.6965,
    radiusM: 300,
    pitchSummary: 'Smart city community in the new capital with digital home automation.',
    paymentPlanSummary: '0% down with 3-year handover and flexible installments.',
  },
  {
    id: 'proj-014',
    name: 'Mountain View Ras El Hekma',
    developerId: 'dev-006',
    developerName: 'Mountain View',
    status: 'Active',
    createdAt: '2026-06-10',
    location: 'Ras El Hekma, North Coast',
    latitude: 31.1316,
    longitude: 27.8461,
    radiusM: 300,
    pitchSummary: 'Largest coastal development in the region with private bays and hotels.',
  },
];

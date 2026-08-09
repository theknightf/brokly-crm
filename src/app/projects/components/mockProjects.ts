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
  },
  {
    id: 'proj-002',
    name: 'Palm Hills October',
    developerId: 'dev-001',
    developerName: 'Palm Hills',
    status: 'Active',
    createdAt: '2026-01-10',
  },
  {
    id: 'proj-003',
    name: 'Palm Hills Alexandria',
    developerId: 'dev-001',
    developerName: 'Palm Hills',
    status: 'Active',
    createdAt: '2026-02-15',
  },
  {
    id: 'proj-004',
    name: 'Emaar Mirage City',
    developerId: 'dev-002',
    developerName: 'Emaar',
    status: 'Active',
    createdAt: '2026-01-20',
  },
  {
    id: 'proj-005',
    name: 'Emaar Uptown Cairo',
    developerId: 'dev-002',
    developerName: 'Emaar',
    status: 'Active',
    createdAt: '2026-02-01',
  },
  {
    id: 'proj-006',
    name: 'Emaar Golf Views',
    developerId: 'dev-002',
    developerName: 'Emaar',
    status: 'Inactive',
    createdAt: '2025-11-05',
  },
  {
    id: 'proj-007',
    name: 'SODIC East',
    developerId: 'dev-003',
    developerName: 'SODIC',
    status: 'Active',
    createdAt: '2026-03-01',
  },
  {
    id: 'proj-008',
    name: 'SODIC West',
    developerId: 'dev-003',
    developerName: 'SODIC',
    status: 'Active',
    createdAt: '2026-03-01',
  },
  {
    id: 'proj-009',
    name: 'Ora Zed East',
    developerId: 'dev-004',
    developerName: 'Ora Developers',
    status: 'Active',
    createdAt: '2026-04-10',
  },
  {
    id: 'proj-010',
    name: 'Ora Zed West',
    developerId: 'dev-004',
    developerName: 'Ora Developers',
    status: 'Inactive',
    createdAt: '2025-12-20',
  },
  {
    id: 'proj-011',
    name: 'Tatweer Fouka Bay',
    developerId: 'dev-005',
    developerName: 'Tatweer Misr',
    status: 'Active',
    createdAt: '2026-05-01',
  },
  {
    id: 'proj-012',
    name: 'Tatweer D-Bay',
    developerId: 'dev-005',
    developerName: 'Tatweer Misr',
    status: 'Active',
    createdAt: '2026-05-15',
  },
  {
    id: 'proj-013',
    name: 'Mountain View iCity',
    developerId: 'dev-006',
    developerName: 'Mountain View',
    status: 'Active',
    createdAt: '2026-06-01',
  },
  {
    id: 'proj-014',
    name: 'Mountain View Ras El Hekma',
    developerId: 'dev-006',
    developerName: 'Mountain View',
    status: 'Active',
    createdAt: '2026-06-10',
  },
];

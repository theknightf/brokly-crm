export interface AdminItem {
  id: string;
  name: string;
  color?: string;
  order?: number;
  active: boolean;
}

export interface AdminSettingsStore {
  leadSources: AdminItem[];
  pipelineStages: AdminItem[];
  areas: AdminItem[];
  priorities: AdminItem[];
  developers: AdminItem[];
}

export const defaultAdminSettings: AdminSettingsStore = {
  leadSources: [
    { id: 'ls-1', name: 'Facebook', color: '#1877F2', active: true },
    { id: 'ls-2', name: 'Instagram', color: '#E1306C', active: true },
    { id: 'ls-3', name: 'TikTok', color: '#010101', active: true },
    { id: 'ls-4', name: 'Website', color: '#84cc16', active: true },
    { id: 'ls-5', name: 'WhatsApp', color: '#25D366', active: true },
    { id: 'ls-6', name: 'Referral', color: '#65a30d', active: true },
    { id: 'ls-7', name: 'Word of Mouth', color: '#a3e635', active: true },
    { id: 'ls-8', name: 'Existing Client', color: '#4d7c0f', active: true },
    { id: 'ls-9', name: 'Sales Referral', color: '#22c55e', active: true },
    { id: 'ls-10', name: 'Property Portal', color: '#9ca3af', active: true },
    { id: 'ls-11', name: 'Walk-in', color: '#16a34a', active: true },
  ],
  // Must match canonical ALL_STATUSES in @/lib/ui — dashboard cards, Import
  // dropdown, Filters and Add/Edit forms all merge on top of that list.
  pipelineStages: [
    { id: 'ps-1', name: 'Fresh Leads', color: '#d9f99d', order: 1, active: true },
    { id: 'ps-2', name: 'Cold Calls', color: '#a3e635', order: 2, active: true },
    { id: 'ps-3', name: 'Pending Leads', color: '#94a3b8', order: 3, active: true },
    { id: 'ps-4', name: 'Following Up', color: '#84cc16', order: 4, active: true },
    { id: 'ps-5', name: 'Meeting', color: '#22c55e', order: 5, active: true },
    { id: 'ps-6', name: 'Interested', color: '#65a30d', order: 6, active: true },
    { id: 'ps-7', name: 'Not Interested', color: '#9ca3af', order: 7, active: true },
    { id: 'ps-8', name: 'Cancellation', color: '#ef4444', order: 8, active: true },
    { id: 'ps-9', name: 'Done Deal', color: '#4d7c0f', order: 9, active: true },
    { id: 'ps-10', name: 'Duplicate Leads', color: '#94a3b8', order: 10, active: true },
    { id: 'ps-11', name: 'Wrong Number', color: '#f97316', order: 11, active: true },
    { id: 'ps-12', name: 'Data Rotation', color: '#8b5cf6', order: 12, active: true },
    { id: 'ps-13', name: 'Closed Number', color: '#6b7280', order: 13, active: true },
    { id: 'ps-14', name: 'No Answer', color: '#f59e0b', order: 14, active: true },
    { id: 'ps-15', name: 'No Answer At All', color: '#f59e0b', order: 15, active: true },
    { id: 'ps-16', name: 'Low Budget', color: '#eab308', order: 16, active: true },
    { id: 'ps-17', name: 'Reschedule Meeting', color: '#06b6d4', order: 17, active: true },
    { id: 'ps-18', name: 'Reservation', color: '#16a34a', order: 18, active: true },
  ],
  areas: [
    { id: 'ar-1', name: 'New Cairo', active: true },
    { id: 'ar-2', name: '6th of October', active: true },
    { id: 'ar-3', name: 'Sheikh Zayed', active: true },
    { id: 'ar-4', name: 'Maadi', active: true },
    { id: 'ar-5', name: 'Zamalek', active: true },
    { id: 'ar-6', name: 'Heliopolis', active: true },
    { id: 'ar-7', name: 'North Coast', active: true },
    { id: 'ar-8', name: 'Ain Sokhna', active: true },
    { id: 'ar-9', name: 'New Administrative Capital', active: true },
    { id: 'ar-10', name: 'Mostakbal City', active: true },
    { id: 'ar-11', name: 'Obour City', active: true },
    { id: 'ar-12', name: 'Badr City', active: true },
  ],
  priorities: [
    { id: 'pr-1', name: 'Critical', color: '#ef4444', order: 1, active: true },
    { id: 'pr-2', name: 'High', color: '#f97316', order: 2, active: true },
    { id: 'pr-3', name: 'Medium', color: '#f59e0b', order: 3, active: true },
    { id: 'pr-4', name: 'Low', color: '#22c55e', order: 4, active: true },
  ],
  developers: [
    { id: 'dev-1', name: 'Palm Hills', active: true },
    { id: 'dev-2', name: 'Emaar Misr', active: true },
    { id: 'dev-3', name: 'SODIC', active: true },
    { id: 'dev-4', name: 'Ora Developers', active: true },
    { id: 'dev-5', name: 'Tatweer Misr', active: true },
    { id: 'dev-6', name: 'Mountain View', active: true },
    { id: 'dev-7', name: 'Talaat Moustafa Group', active: true },
    { id: 'dev-8', name: 'Marasem', active: true },
    { id: 'dev-9', name: 'Inertia', active: true },
    { id: 'dev-10', name: 'Hassan Allam Properties', active: true },
  ],
};

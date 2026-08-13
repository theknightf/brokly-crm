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
  pipelineStages: [
    { id: 'ps-1', name: 'New Lead', color: '#d9f99d', order: 1, active: true },
    { id: 'ps-2', name: 'Contacted', color: '#a3e635', order: 2, active: true },
    { id: 'ps-3', name: 'Follow Up', color: '#84cc16', order: 3, active: true },
    { id: 'ps-4', name: 'Interested', color: '#65a30d', order: 4, active: true },
    { id: 'ps-5', name: 'Meeting Scheduled', color: '#22c55e', order: 5, active: true },
    { id: 'ps-6', name: 'Site Visit', color: '#4d7c0f', order: 6, active: true },
    { id: 'ps-7', name: 'Negotiation', color: '#365314', order: 7, active: true },
    { id: 'ps-8', name: 'Reservation', color: '#16a34a', order: 8, active: true },
    { id: 'ps-9', name: 'Closed Won', color: '#4d7c0f', order: 9, active: true },
    { id: 'ps-10', name: 'Closed Lost', color: '#9ca3af', order: 10, active: true },
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

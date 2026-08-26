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

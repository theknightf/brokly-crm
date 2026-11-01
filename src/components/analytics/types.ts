/** Types for the Analytics & Reports dashboard (/analytics). */

export type CallDirection = 'incoming' | 'outgoing';
export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'failed' | 'closed';

export type PipelineStage =
  | 'following_up'
  | 'following_up_after_meeting'
  | 'interested'
  | 'meeting'
  | 'reschedule_meeting'
  | 'reserved'
  | 'closed_won';

export interface Agent {
  id: string;
  name: string;
  teamId: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  channel: string;
  isColdCall: boolean;
  createdBy: string; // agent id
  assignedTo: string; // agent id
  createdAt: string; // ISO
  assignedAt: string; // ISO
  stage: PipelineStage;
  notes?: string;
}

export interface CallRecord {
  id: string;
  /** null when the number does not match any lead ("+ Add Lead" is shown instead). */
  leadId: string | null;
  leadName: string | null;
  phone: string;
  agentId: string;
  direction: CallDirection;
  outcome: CallOutcome;
  durationSeconds: number;
  at: string; // ISO
}

export interface TeamReport {
  agentId: string;
  agentName: string;
  teamId: string;
  teamName: string;
  leadsAssigned: number;
  assignFrom: number;
  /** leadsAssigned + assignFrom */
  total: number;
}

export interface FunnelRow {
  agentId: string;
  agentName: string;
  teamId: string;
  counts: Record<PipelineStage, number>;
}

export interface DateRange {
  from: string; // YYYY-MM-DD or ''
  to: string;
}

export interface FilterState {
  assignDate: DateRange;
  actionDate: DateRange;
  creationDate: DateRange;
  source: string; // '' = all
  channel: string; // '' = all
  isColdCall: 'any' | 'yes' | 'no';
  createdBy: string; // agent id, '' = all
}

export type Timeframe = 'day' | 'weekly' | 'monthly' | 'year';

export interface TimelinePoint {
  label: string;
  calls: number;
}

export interface OverviewStats {
  totalCalls: number;
  totalCallsByHour: number;
  outcome: { answered: number; noAnswer: number; closed: number };
  dial: { incoming: number; outgoing: number };
}

export const EMPTY_FILTERS: FilterState = {
  assignDate: { from: '', to: '' },
  actionDate: { from: '', to: '' },
  creationDate: { from: '', to: '' },
  source: '',
  channel: '',
  isColdCall: 'any',
  createdBy: '',
};

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'following_up', label: 'Following up' },
  { key: 'following_up_after_meeting', label: 'Following up after meeting' },
  { key: 'interested', label: 'Interested' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'reschedule_meeting', label: 'Reschedule meeting' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'closed_won', label: 'Closed won' },
];

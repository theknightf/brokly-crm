/** Types for the Reports > Analytics dashboard (real data from /api/reports/analytics/*). */

export type PipelineStage =
  | 'following_up'
  | 'following_up_after_meeting'
  | 'interested'
  | 'meeting'
  | 'reschedule_meeting'
  | 'reserved'
  | 'closed_won';

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'following_up', label: 'Following up' },
  { key: 'following_up_after_meeting', label: 'Following up after meeting' },
  { key: 'interested', label: 'Interested' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'reschedule_meeting', label: 'Reschedule meeting' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'closed_won', label: 'Closed won' },
];

export interface DateRange {
  from: string; // YYYY-MM-DD or ''
  to: string;
}

export interface FilterState {
  assignDate: DateRange;
  actionDate: DateRange;
  creationDate: DateRange;
  source: string; // broker / lead source, '' = all
  channel: string; // call channel, '' = all
  isColdCall: 'any' | 'yes' | 'no';
  createdBy: string; // user id, '' = all
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

export interface FilterOptions {
  sources: string[];
  channels: string[];
  agents: { id: string; name: string }[];
}

export type Timeframe = 'day' | 'weekly' | 'monthly' | 'year';

export interface TimelinePoint {
  label: string;
  calls: number;
}

export interface OverviewStats {
  totalCalls: number;
  /** calls divided by the number of distinct hours that had at least one call */
  callsByHour: number;
  answered: number;
  noAnswer: number;
  closed: number;
  incoming: number;
  outgoing: number;
  timeline: TimelinePoint[];
}

export type CallBucket = 'answered' | 'no_answer' | 'closed';

export interface CallLogRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  phone: string | null;
  direction: string | null;
  channel: string | null;
  outcome: string | null;
  bucket: CallBucket;
  duration_seconds: number;
  created_at: string;
  source: string | null;
  is_cold: boolean | null;
  lead_stage: string | null;
  user_id: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
  owner_name: string | null;
}

export interface CallsPage {
  total: number;
  rows: CallLogRow[];
  page: number;
  pageSize: number;
}

export type SortKey = 'lead' | 'phone' | 'agent' | 'direction' | 'outcome' | 'duration' | 'at';

export interface AssignedAgent {
  agentId: string;
  agentName: string;
  teamId: string | null;
  teamName: string;
  leadsAssigned: number;
  assignFrom: number;
  total: number;
  stages: Record<PipelineStage, number>;
  /** every crm_status the agent's leads are in, with counts */
  allStages: Record<string, number>;
  /** total calls made by the agent (same filters as the Calls Log) */
  calls: number;
}

export interface AssignedData {
  teams: { id: string; name: string }[];
  agents: AssignedAgent[];
}

export interface Loadable<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

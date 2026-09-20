// Canonical sales-pipeline order + helpers shared by LeadsTable (inline stage
// editing) and the lead detail stepper. Keeps "update stage" consistent across
// the whole leads panel without inventing statuses that don't exist in the DB.
import type { LeadStatus } from './mockLeads';

/** Forward sales pipeline stages, in order. Excludes filter-only and negative outcomes. */
export const PIPELINE_STAGES: LeadStatus[] = [
  'Fresh Leads',
  'Cold Calls',
  'Pending Leads',
  'Following Up',
  'Meeting',
  'Interested',
  'Reservation',
  'Done Deal',
];

/** Negative / terminal outcomes — reached via the "outcome" row, not the forward path.
 * Includes 'Duplicate Leads' so ALL_REAL_STATUSES === ALL_STATUSES (single truth in @/lib/ui). */
export const OUTCOME_STAGES: LeadStatus[] = [
  'Not Interested',
  'Cancellation',
  'Duplicate Leads',
  'Wrong Number',
  'Data Rotation',
  'Closed Number',
  'No Answer',
  'No Answer At All',
  'Low Budget',
  'Reschedule Meeting',
];

/** Every selectable status — must stay in sync with ALL_STATUSES in @/lib/ui. */
export const ALL_REAL_STATUSES: LeadStatus[] = [...PIPELINE_STAGES, ...OUTCOME_STAGES];

export function pipelineIndex(status?: LeadStatus | null): number {
  if (!status) return -1;
  return PIPELINE_STAGES.indexOf(status);
}

export function nextPipelineStage(status?: LeadStatus | null): LeadStatus | undefined {
  const i = pipelineIndex(status);
  return i >= 0 && i < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[i + 1] : undefined;
}

export function prevPipelineStage(status?: LeadStatus | null): LeadStatus | undefined {
  const i = pipelineIndex(status);
  return i > 0 ? PIPELINE_STAGES[i - 1] : undefined;
}

export function isOutcome(status?: LeadStatus | null): boolean {
  return !!status && OUTCOME_STAGES.includes(status);
}

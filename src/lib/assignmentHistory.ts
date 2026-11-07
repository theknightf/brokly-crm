// Shared by the assign dialogs (what is about to be assigned) and the assignment history (what was assigned).

export interface Tally {
  label: string;
  count: number;
}

export interface LeadLike {
  id?: string;
  status?: string | null;
  source?: string | null;
  assignedToName?: string | null;
  agent?: string | null;
}

/** Counts of each distinct value, biggest first; empty values are grouped under `emptyLabel`. */
export function tally(values: (string | undefined | null)[], emptyLabel: string): Tally[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = (v || '').toString().trim() || emptyLabel;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** How a set of leads splits by current stage, source and current owner. */
export function summarizeLeads(leads: LeadLike[]) {
  return {
    by_stage: tally(leads.map((l) => l.status), 'No stage'),
    by_source: tally(leads.map((l) => l.source), 'No source'),
    by_owner: tally(leads.map((l) => l.assignedToName || l.agent), 'Unassigned'),
  };
}

export interface AssignmentBatchInput {
  kind: 'agents' | 'team';
  teamName?: string;
  stage?: string;
  leads: LeadLike[];
  assignees: { id?: string; name: string; count: number }[];
  createdByName?: string;
}

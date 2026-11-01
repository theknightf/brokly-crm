import type {
  Agent,
  CallRecord,
  FilterState,
  FunnelRow,
  Lead,
  OverviewStats,
  PipelineStage,
  Team,
  TeamReport,
  TimelinePoint,
  Timeframe,
} from './types';

/**
 * MOCK DATA ONLY. Every number on /analytics comes from this file until the SQL-backed
 * report endpoints exist. Keep the shapes in types.ts; swap these exports for fetchers.
 */

export const TEAMS: Team[] = [
  { id: 't1', name: 'Salma' },
  { id: 't2', name: 'Nadia Essam' },
  { id: 't3', name: 'Omar Khaled' },
];

export const AGENTS: Agent[] = [
  { id: 'a1', name: 'Donia Amr', teamId: 't1' },
  { id: 'a2', name: 'Salma Hassan', teamId: 't1' },
  { id: 'a3', name: 'Nadia Essam', teamId: 't2' },
  { id: 'a4', name: 'Hany Fawzy', teamId: 't2' },
  { id: 'a5', name: 'Omar Khaled', teamId: 't3' },
  { id: 'a6', name: 'Mariam Samy', teamId: 't3' },
];

export const SOURCES = ['Facebook Ads', 'Google Ads', 'Referral', 'Broker network', 'Website'];
export const CHANNELS = ['Call', 'WhatsApp', 'Walk-in', 'Web form'];

export const LEADS: Lead[] = [
  { id: 'l1', name: 'Ahmed Mostafa', phone: '+201012345678', source: 'Facebook Ads', channel: 'Call', isColdCall: false, createdBy: 'a1', assignedTo: 'a1', createdAt: '2026-10-20T09:10:00Z', assignedAt: '2026-10-20T09:30:00Z', stage: 'interested' },
  { id: 'l2', name: 'Mona Ibrahim', phone: '+201112223344', source: 'Google Ads', channel: 'WhatsApp', isColdCall: true, createdBy: 'a2', assignedTo: 'a2', createdAt: '2026-10-21T11:00:00Z', assignedAt: '2026-10-22T08:00:00Z', stage: 'following_up' },
  { id: 'l3', name: 'Karim Adel', phone: '+201223334455', source: 'Referral', channel: 'Walk-in', isColdCall: false, createdBy: 'a3', assignedTo: 'a3', createdAt: '2026-10-18T13:20:00Z', assignedAt: '2026-10-18T13:40:00Z', stage: 'meeting' },
  { id: 'l4', name: 'Sara Nabil', phone: '+201556667788', source: 'Broker network', channel: 'Call', isColdCall: true, createdBy: 'a4', assignedTo: 'a3', createdAt: '2026-10-25T10:00:00Z', assignedAt: '2026-10-26T09:00:00Z', stage: 'reschedule_meeting' },
  { id: 'l5', name: 'Tarek Salah', phone: '+201098887766', source: 'Website', channel: 'Web form', isColdCall: false, createdBy: 'a5', assignedTo: 'a5', createdAt: '2026-10-27T15:30:00Z', assignedAt: '2026-10-27T16:00:00Z', stage: 'reserved' },
  { id: 'l6', name: 'Laila Hossam', phone: '+201144556677', source: 'Facebook Ads', channel: 'Call', isColdCall: true, createdBy: 'a6', assignedTo: 'a6', createdAt: '2026-10-29T08:40:00Z', assignedAt: '2026-10-29T09:00:00Z', stage: 'following_up_after_meeting' },
  { id: 'l7', name: 'Yassin Fathy', phone: '+201277788990', source: 'Referral', channel: 'WhatsApp', isColdCall: false, createdBy: 'a1', assignedTo: 'a2', createdAt: '2026-10-23T12:00:00Z', assignedAt: '2026-10-24T10:00:00Z', stage: 'closed_won' },
  { id: 'l8', name: 'Dina Reda', phone: '+201533344556', source: 'Google Ads', channel: 'Call', isColdCall: true, createdBy: 'a3', assignedTo: 'a4', createdAt: '2026-10-30T09:15:00Z', assignedAt: '2026-10-30T09:45:00Z', stage: 'following_up' },
  { id: 'l9', name: 'Hossam Fouad', phone: '+201066677889', source: 'Broker network', channel: 'Walk-in', isColdCall: false, createdBy: 'a5', assignedTo: 'a5', createdAt: '2026-10-19T14:00:00Z', assignedAt: '2026-10-19T14:20:00Z', stage: 'meeting' },
  { id: 'l10', name: 'Nour El-Din', phone: '+201188899001', source: 'Website', channel: 'Web form', isColdCall: true, createdBy: 'a2', assignedTo: 'a1', createdAt: '2026-10-31T10:30:00Z', assignedAt: '2026-10-31T11:00:00Z', stage: 'interested' },
  { id: 'l11', name: 'Rana Wael', phone: '+201299900112', source: 'Facebook Ads', channel: 'WhatsApp', isColdCall: false, createdBy: 'a6', assignedTo: 'a6', createdAt: '2026-10-28T11:45:00Z', assignedAt: '2026-10-28T12:00:00Z', stage: 'following_up' },
  { id: 'l12', name: 'Mazen Gamal', phone: '+201511122233', source: 'Referral', channel: 'Call', isColdCall: true, createdBy: 'a4', assignedTo: 'a4', createdAt: '2026-11-01T08:20:00Z', assignedAt: '2026-11-01T08:40:00Z', stage: 'following_up' },
];

const call = (
  id: string,
  leadId: string | null,
  phone: string,
  agentId: string,
  direction: CallRecord['direction'],
  outcome: CallRecord['outcome'],
  durationSeconds: number,
  at: string
): CallRecord => ({
  id,
  leadId,
  leadName: leadId ? LEADS.find((l) => l.id === leadId)?.name || null : null,
  phone,
  agentId,
  direction,
  outcome,
  durationSeconds,
  at,
});

export const CALLS: CallRecord[] = [
  call('c1', 'l1', '+201012345678', 'a1', 'outgoing', 'answered', 38, '2026-11-01T12:39:00Z'),
  call('c2', 'l2', '+201112223344', 'a2', 'outgoing', 'no_answer', 0, '2026-11-01T12:21:00Z'),
  call('c3', null, '+201001112223', 'a1', 'incoming', 'answered', 56, '2026-11-01T11:58:00Z'),
  call('c4', 'l3', '+201223334455', 'a3', 'outgoing', 'answered', 212, '2026-11-01T11:40:00Z'),
  call('c5', 'l4', '+201556667788', 'a4', 'outgoing', 'busy', 4, '2026-11-01T11:12:00Z'),
  call('c6', 'l5', '+201098887766', 'a5', 'incoming', 'answered', 97, '2026-11-01T10:47:00Z'),
  call('c7', 'l6', '+201144556677', 'a6', 'outgoing', 'failed', 0, '2026-11-01T10:30:00Z'),
  call('c8', 'l7', '+201277788990', 'a2', 'outgoing', 'answered', 145, '2026-10-31T16:05:00Z'),
  call('c9', 'l8', '+201533344556', 'a4', 'outgoing', 'no_answer', 0, '2026-10-31T15:44:00Z'),
  call('c10', null, '+201015556667', 'a5', 'incoming', 'closed', 2, '2026-10-31T15:10:00Z'),
  call('c11', 'l9', '+201066677889', 'a5', 'outgoing', 'answered', 321, '2026-10-31T14:31:00Z'),
  call('c12', 'l10', '+201188899001', 'a1', 'outgoing', 'answered', 64, '2026-10-31T13:20:00Z'),
  call('c13', 'l11', '+201299900112', 'a6', 'outgoing', 'no_answer', 0, '2026-10-30T17:02:00Z'),
  call('c14', 'l12', '+201511122233', 'a4', 'incoming', 'answered', 48, '2026-10-30T16:25:00Z'),
  call('c15', 'l1', '+201012345678', 'a1', 'outgoing', 'closed', 3, '2026-10-30T12:11:00Z'),
  call('c16', 'l2', '+201112223344', 'a2', 'outgoing', 'answered', 77, '2026-10-29T15:50:00Z'),
  call('c17', null, '+201222233344', 'a3', 'incoming', 'no_answer', 0, '2026-10-29T14:19:00Z'),
  call('c18', 'l3', '+201223334455', 'a3', 'outgoing', 'answered', 189, '2026-10-29T11:03:00Z'),
  call('c19', 'l4', '+201556667788', 'a3', 'outgoing', 'busy', 5, '2026-10-28T16:48:00Z'),
  call('c20', 'l5', '+201098887766', 'a5', 'outgoing', 'answered', 133, '2026-10-28T13:36:00Z'),
  call('c21', 'l6', '+201144556677', 'a6', 'incoming', 'answered', 41, '2026-10-28T12:00:00Z'),
  call('c22', 'l9', '+201066677889', 'a5', 'outgoing', 'failed', 0, '2026-10-28T10:15:00Z'),
];

export const OVERVIEW: OverviewStats = {
  totalCalls: 77803,
  totalCallsByHour: 2827.725,
  outcome: { answered: 31120, noAnswer: 38902, closed: 7781 }, // sums to totalCalls
  dial: { incoming: 21785, outgoing: 56018 }, // sums to totalCalls
};

/** Deterministic wave so server and client render the same chart. */
const wave = (i: number, base: number, amp: number) =>
  Math.round(base + amp * Math.sin(i * 0.9) + amp * 0.4 * Math.cos(i * 0.37));

export function timeline(frame: Timeframe): TimelinePoint[] {
  if (frame === 'day') {
    return Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, '0')}:00`,
      calls: h < 8 || h > 20 ? wave(h, 30, 20) : wave(h, 210, 90),
    }));
  }
  if (frame === 'weekly') {
    return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => ({
      label: d,
      calls: i === 6 ? wave(i, 420, 60) : wave(i, 2900, 500),
    }));
  }
  if (frame === 'monthly') {
    return Array.from({ length: 30 }, (_, d) => ({ label: String(d + 1), calls: wave(d, 2500, 700) }));
  }
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => ({
    label: m,
    calls: wave(i, 6400, 1500),
  }));
}

const REPORT_SEED: Record<string, { leads: number; from: number }> = {
  a1: { leads: 412, from: 38 },
  a2: { leads: 377, from: 52 },
  a3: { leads: 455, from: 21 },
  a4: { leads: 298, from: 64 },
  a5: { leads: 520, from: 17 },
  a6: { leads: 341, from: 45 },
};

export function teamReports(): TeamReport[] {
  return AGENTS.map((a) => {
    const seed = REPORT_SEED[a.id];
    return {
      agentId: a.id,
      agentName: a.name,
      teamId: a.teamId,
      teamName: TEAMS.find((t) => t.id === a.teamId)?.name || '',
      leadsAssigned: seed.leads,
      assignFrom: seed.from,
      total: seed.leads + seed.from,
    };
  });
}

const FUNNEL_SEED: Record<string, number[]> = {
  a1: [96, 21, 64, 38, 12, 9, 6],
  a2: [88, 17, 51, 33, 14, 7, 5],
  a3: [120, 30, 72, 45, 11, 14, 9],
  a4: [70, 12, 40, 22, 9, 5, 3],
  a5: [131, 34, 83, 52, 17, 19, 12],
  a6: [82, 16, 47, 29, 10, 8, 4],
};
const STAGE_ORDER: PipelineStage[] = [
  'following_up',
  'following_up_after_meeting',
  'interested',
  'meeting',
  'reschedule_meeting',
  'reserved',
  'closed_won',
];

export function funnelRows(): FunnelRow[] {
  return AGENTS.map((a) => {
    const counts = {} as Record<PipelineStage, number>;
    STAGE_ORDER.forEach((s, i) => {
      counts[s] = FUNNEL_SEED[a.id][i];
    });
    return { agentId: a.id, agentName: a.name, teamId: a.teamId, counts };
  });
}

const inRange = (iso: string, from: string, to: string) => {
  if (!from && !to) return true;
  const day = iso.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
};

/** Applies the drawer filters to the mock calls (lead-level filters need a matching lead). */
export function filterCalls(calls: CallRecord[], f: FilterState): CallRecord[] {
  const leadFilterActive =
    !!f.assignDate.from || !!f.assignDate.to || !!f.creationDate.from || !!f.creationDate.to ||
    !!f.source || !!f.channel || f.isColdCall !== 'any' || !!f.createdBy;
  return calls.filter((c) => {
    if (!inRange(c.at, f.actionDate.from, f.actionDate.to)) return false;
    if (!leadFilterActive) return true;
    const lead = c.leadId ? LEADS.find((l) => l.id === c.leadId) : undefined;
    if (!lead) return false;
    if (!inRange(lead.assignedAt, f.assignDate.from, f.assignDate.to)) return false;
    if (!inRange(lead.createdAt, f.creationDate.from, f.creationDate.to)) return false;
    if (f.source && lead.source !== f.source) return false;
    if (f.channel && lead.channel !== f.channel) return false;
    if (f.isColdCall === 'yes' && !lead.isColdCall) return false;
    if (f.isColdCall === 'no' && lead.isColdCall) return false;
    if (f.createdBy && lead.createdBy !== f.createdBy) return false;
    return true;
  });
}

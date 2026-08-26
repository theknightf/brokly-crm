// Shared classification for call logs so the admin "Call Logs" tab and the
// reports view label every touch-point consistently:
//   Incoming Call  – a call the agent received (direction = incoming)
//   No Answer      – dialed but the customer never answered (attempt)
//   Short Call     – connected but hung up within ~1 minute
//   Successful     – connected, reached the prospect
//   Site Visit     – a field meeting logged from the app

export interface CallLogShape {
  channel?: string;
  direction?: string;
  duration_seconds?: number;
  outcome?: string;
}

export type VerificationCategory =
  'Incoming Call' | 'Call' | 'Short Call' | 'Successful' | 'Site Visit' | 'No Answer';

export interface VerificationResult {
  category: VerificationCategory;
  label: string;
  cls: string;
}

const SUCCESS_OUTCOMES = ['Reached', 'Interested', 'Site Visit', 'Won Deal', 'Customer Replied'];
const NO_ANSWER_OUTCOMES = ['No Answer', 'No Answer At All', 'Busy', 'Wrong Number', 'No Reply'];

export function verifyCall(row: CallLogShape): VerificationResult {
  const duration = Math.max(0, Math.floor(Number(row.duration_seconds) || 0));
  const outcome = (row.outcome || '').trim();

  if (row.channel === 'Site Visit' || row.channel === 'Meeting') {
    return {
      category: 'Site Visit',
      label: 'Site Visit',
      cls: 'bg-violet-100 text-violet-700',
    };
  }

  if (row.direction === 'incoming') {
    return {
      category: 'Incoming Call',
      label: 'Incoming',
      cls: 'bg-sky-100 text-sky-700',
    };
  }

  if (SUCCESS_OUTCOMES.includes(outcome) || duration >= 60) {
    return {
      category: 'Successful',
      label: 'Connected',
      cls: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (NO_ANSWER_OUTCOMES.includes(outcome)) {
    return {
      category: 'No Answer',
      label: outcome,
      cls: 'bg-muted text-muted-foreground',
    };
  }

  if (duration > 0 && duration < 60) {
    return {
      category: 'Short Call',
      label: 'Short call',
      cls: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    category: 'No Answer',
    label: outcome || 'Call attempt',
    cls: 'bg-muted text-muted-foreground',
  };
}

export const VERIFICATION_CLS: Record<VerificationCategory, string> = {
  'Incoming Call': 'bg-sky-100 text-sky-700',
  Call: 'bg-muted text-muted-foreground',
  'Short Call': 'bg-amber-100 text-amber-700',
  Successful: 'bg-emerald-100 text-emerald-700',
  'Site Visit': 'bg-violet-100 text-violet-700',
  'No Answer': 'bg-muted text-muted-foreground',
};

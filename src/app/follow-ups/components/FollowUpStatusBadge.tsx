import React from 'react';
import { FollowUpStatus, FollowUpPriority } from './mockFollowUps';
import { followUpStatusClass } from '@/lib/ui';

const priorityConfig: Record<FollowUpPriority, { bg: string; text: string }> = {
  High: { bg: 'bg-red-50', text: 'text-red-600' },
  Medium: { bg: 'bg-amber-50', text: 'text-amber-600' },
  Low: { bg: 'bg-slate-100', text: 'text-slate-500' },
};

interface FollowUpStatusBadgeProps {
  status: FollowUpStatus;
}

export function FollowUpStatusBadge({ status }: FollowUpStatusBadgeProps) {
  const [bg, text] = followUpStatusClass(status).split(' ');
  const dot = text.replace('text-', 'bg-') || 'bg-muted-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
      {status}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: FollowUpPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const cfg = priorityConfig[priority];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {priority}
    </span>
  );
}

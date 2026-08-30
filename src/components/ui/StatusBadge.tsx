import React from 'react';
import { colorClassOf } from '@/lib/ui';

export type LeadStatus = string;

interface StatusBadgeProps {
  status: string;
  onClick?: () => void;
  showDot?: boolean;
}

export default function StatusBadge({ status, onClick, showDot = true }: StatusBadgeProps) {
  const colorClass = colorClassOf(status);
  const textToken = colorClass.split(' ').find((cls) => cls.startsWith('text-')) || '';
  const dotColor = textToken.replace('text-', 'bg-') || 'bg-muted-foreground';

  return (
    <span
      className={`status-badge ${colorClass} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />}
      {status}
    </span>
  );
}

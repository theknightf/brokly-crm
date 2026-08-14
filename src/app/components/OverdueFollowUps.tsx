'use client';
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Phone, Clock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { followUpsService } from '@/lib/services/crmService';

interface OverdueItem {
  id: string;
  contactName: string;
  contactPhone: string;
  agent: string;
  agentInitials: string;
  dueDate: string;
  propertyInterest: string;
  priority: string;
}

export default function OverdueFollowUps() {
  const [items, setItems] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    followUpsService
      .getOverdue(5)
      .then((data: any[]) => {
        setItems(data || []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const getUrgencyClass = (priority: string) => {
    if (priority === 'High') return 'border-destructive/30 bg-destructive/10';
    if (priority === 'Medium') return 'border-gold/30 bg-gold-soft/50';
    return 'border-border bg-muted/30';
  };

  return (
    <div className="card-base border-amber-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-clay-soft border border-border flex items-center justify-center">
            <AlertTriangle size={14} className="text-clay" />
          </div>
          <div>
            <h2 className="section-header">Overdue Follow-ups</h2>
            <p className="text-xs text-muted-foreground">
              {loading
                ? '…'
                : `${items.length} lead${items.length !== 1 ? 's' : ''} waiting for contact`}
            </p>
          </div>
        </div>
        <Link href="/follow-ups" className="text-xs text-primary font-medium hover:underline">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-24 text-center">
          <p className="text-sm text-muted-foreground font-medium">No overdue follow-ups</p>
          <p className="text-xs text-muted-foreground/70 mt-1">You&apos;re all caught up!</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors hover:bg-muted/30 cursor-pointer ${getUrgencyClass(item.priority)}`}
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                {item.agentInitials || item.agent?.slice(0, 2).toUpperCase() || '??'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {item.contactName}
                  </p>
                  {item.propertyInterest && (
                    <span className="text-xs text-muted-foreground truncate hidden sm:block">
                      — {item.propertyInterest}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <Clock size={10} />
                    Due {item.dueDate}
                  </span>
                  {item.agent && (
                    <span className="text-xs text-muted-foreground">{item.agent}</span>
                  )}
                </div>
              </div>
              {item.contactPhone && (
                <a
                  href={`tel:${item.contactPhone}`}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone size={12} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

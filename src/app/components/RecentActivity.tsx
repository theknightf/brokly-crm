'use client';
import React, { useEffect, useState } from 'react';
import { UserPlus, CheckCircle2, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import { leadsService } from '@/lib/services/crmService';
import { useLanguage } from '@/contexts/LanguageContext';

interface ActivityItem {
  id: string;
  type: string;
  icon: React.ReactNode;
  iconBg: string;
  text: string;
  time: string;
  agent: string;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function RecentActivity({ variant = 'default' }: { variant?: 'default' | 'agent' } = {}) {
  // variant="agent": i18n copy, sans heading, and a real label for leads without a name. Default is unchanged.
  const agent = variant === 'agent';
  const { t } = useLanguage();
  const L = (key: string, fallback: string, vars?: Record<string, string | number>) => (agent ? t(key, vars) : fallback);
  const agoAgent = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return t('agent.ago.now');
    if (mins < 60) return t('agent.ago.m', { n: mins });
    const h = Math.floor(mins / 60);
    return h < 24 ? t('agent.ago.h', { n: h }) : t('agent.ago.d', { n: Math.floor(h / 24) });
  };
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leadsService
      .getRecent(7)
      .then((leads: any[]) => {
        const recent = (leads || []).map((lead: any) => {
          // Agent view: never "New lead:" with nothing after it.
          const name = agent ? String(lead.name || '').trim() || String(lead.phone || '').trim() || t('agent.ra.unnamed') : lead.name;
          let icon = <UserPlus size={14} />;
          let iconBg = 'bg-blue-50 text-primary';
          let text = agent ? t('agent.ra.newLead', { name }) : `New lead: ${lead.name}`;

          if (lead.status === 'Won') {
            icon = <CheckCircle2 size={14} />;
            iconBg = 'bg-emerald-50 text-emerald-600';
            text = agent ? t('agent.ra.won', { name }) : `Deal closed: ${lead.name} — ${lead.propertyType || ''}`;
          } else if (lead.status === 'Lost') {
            icon = <XCircle size={14} />;
            iconBg = 'bg-red-50 text-red-500';
            text = agent ? t('agent.ra.lost', { name }) : `Lead lost: ${lead.name}`;
          } else if (lead.status === 'Negotiation') {
            icon = <ArrowRight size={14} />;
            iconBg = 'bg-amber-50 text-amber-600';
            text = agent ? t('agent.ra.negotiation', { name }) : `${lead.name} in negotiation — ${lead.propertyType || ''}`;
          }

          return {
            id: lead.id,
            type: lead.status,
            icon,
            iconBg,
            text,
            time: (agent ? agoAgent : timeAgo)(lead.createdAt || lead.updatedAt || new Date().toISOString()),
            agent: lead.agent || L('agent.ra.system', 'System'),
          };
        });
        setActivities(recent);
      })
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card-base">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={agent ? 'text-base font-semibold text-foreground' : 'section-header'}>{L('agent.ra.title', 'Recent Activity')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{L('agent.ra.subtitle', 'Latest leads added')}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {L('agent.ra.live', 'Live')}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-24 text-center">
          <p className="text-sm text-muted-foreground font-medium">{L('agent.ra.empty', 'No recent activity')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{L('agent.ra.emptyHint', 'Add leads to see activity here')}</p>
        </div>
      ) : (
        <ul className="space-y-0">
          {activities.map((act, i) => (
            <li
              key={act.id}
              className={`flex items-start gap-3 py-3 ${
                i < activities.length - 1 ? 'border-b border-border' : ''
              } hover:bg-muted/30 rounded-lg px-1 transition-colors cursor-pointer`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${act.iconBg}`}
              >
                {act.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-snug">{act.text}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{act.time}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{act.agent}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

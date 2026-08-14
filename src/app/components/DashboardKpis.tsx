'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  Users,
  Flame,
  BadgeCheck,
  Handshake,
  TrendingUp,
  Wallet,
  Clock,
  AlertCircle,
  MapPin,
  ArrowUpRight,
} from 'lucide-react';
import { leadsService, followUpsService, siteVisitsService } from '@/lib/services/crmService';

interface Stats {
  total: number;
  new30d: number;
  unassigned: number;
  hot: number;
  reservations: number;
  doneDeals: number;
  conversionPct: number;
  revenue: number;
}

const EMPTY: Stats = {
  total: 0,
  new30d: 0,
  unassigned: 0,
  hot: 0,
  reservations: 0,
  doneDeals: 0,
  conversionPct: 0,
  revenue: 0,
};

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  href: string;
  highlight?: boolean;
}

function KpiCard({ icon, iconBg, iconColor, label, value, sub, href, highlight }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="group relative card-base !p-4 flex items-start gap-3 transition-all hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.98]"
    >
      {highlight && (
        <div className="absolute inset-0 rounded-xl pointer-events-none bg-brand-glow-strong opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-border ${iconBg}`}
      >
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{value}</p>
        <p className="metric-label mt-1 flex items-center gap-1">
          {label}
          <ArrowUpRight
            size={11}
            className="text-primary/60 group-hover:text-primary transition-colors flex-shrink-0"
          />
        </p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-1">{sub}</p>}
      </div>
    </Link>
  );
}

export default function DashboardKpis() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [fuCounts, setFuCounts] = useState({ overdue: 0, dueToday: 0 });
  const [visits, setVisits] = useState({ scheduled: 0, completed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      leadsService.getDashboardStats(),
      followUpsService.getDashboardCounts(),
      siteVisitsService.getCounts(),
    ])
      .then(([s, f, v]) => {
        if (!mounted) return;
        setStats(s || EMPTY);
        setFuCounts(f || { overdue: 0, dueToday: 0 });
        setVisits(v || { scheduled: 0, completed: 0 });
      })
      .catch(() => {
        if (!mounted) return;
        setStats(EMPTY);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card-base !p-4 h-20 animate-pulse bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard
        icon={<Users size={16} />}
        iconColor="text-teal"
        iconBg="bg-teal-soft"
        label="Total leads"
        value={stats.total.toLocaleString()}
        href="/leads-management"
        highlight
      />
      <KpiCard
        icon={<Flame size={16} />}
        iconColor="text-gold"
        iconBg="bg-gold-soft"
        label="Hot leads"
        value={stats.hot.toLocaleString()}
        sub="rating = Hot"
        href="/leads-management"
      />
      <KpiCard
        icon={<UserPlus size={16} />}
        iconColor="text-lime"
        iconBg="bg-lime-soft"
        label="New leads (30d)"
        value={stats.new30d.toLocaleString()}
        href="/leads-management"
      />
      <KpiCard
        icon={<AlertCircle size={16} />}
        iconColor="text-dusk"
        iconBg="bg-dusk-soft"
        label="Unassigned"
        value={stats.unassigned.toLocaleString()}
        sub={`of ${stats.total.toLocaleString()} total`}
        href="/leads-management"
      />
      <KpiCard
        icon={<BadgeCheck size={16} />}
        iconColor="text-gold"
        iconBg="bg-gold-soft"
        label="Reservations"
        value={stats.reservations.toLocaleString()}
        href="/leads-management?status=Reservation"
      />
      <KpiCard
        icon={<Handshake size={16} />}
        iconColor="text-sage"
        iconBg="bg-sage-soft"
        label="Done deals"
        value={stats.doneDeals.toLocaleString()}
        sub={`${stats.conversionPct}% conversion`}
        href="/deals"
      />
      <KpiCard
        icon={<Wallet size={16} />}
        iconColor="text-teal"
        iconBg="bg-teal-soft"
        label="Revenue"
        value={`EGP ${stats.revenue.toLocaleString()}`}
        href="/reports"
      />
      <KpiCard
        icon={<Clock size={16} />}
        iconColor="text-clay"
        iconBg="bg-clay-soft"
        label="Overdue follow-ups"
        value={fuCounts.overdue.toLocaleString()}
        href="/follow-ups?tab=overdue"
      />
      <KpiCard
        icon={<AlertCircle size={16} />}
        iconColor="text-lime"
        iconBg="bg-lime-soft"
        label="Follow-ups due today"
        value={fuCounts.dueToday.toLocaleString()}
        href="/follow-ups?tab=today"
      />
      <KpiCard
        icon={<MapPin size={16} />}
        iconColor="text-dusk"
        iconBg="bg-dusk-soft"
        label="Site visits"
        value={visits.scheduled.toLocaleString()}
        sub={`${visits.completed.toLocaleString()} completed`}
        href="/locations"
      />
      <KpiCard
        icon={<TrendingUp size={16} />}
        iconColor="text-sage"
        iconBg="bg-sage-soft"
        label="Conversion rate"
        value={`${stats.conversionPct}%`}
        sub="Deals ÷ total leads"
        href="/reports"
      />
    </div>
  );
}

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
  label: string;
  value: string;
  sub?: string;
  href: string;
}

function KpiCard({ icon, iconBg, label, value, sub, href }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="card-base !p-4 flex items-start gap-3 group transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
          {label}
          <ArrowUpRight
            size={10}
            className="text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0"
          />
        </p>
        {sub && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</p>}
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
        icon={<Users size={16} className="text-blue-600" />}
        iconBg="bg-blue-50"
        label="Total leads"
        value={stats.total.toLocaleString()}
        href="/leads-management"
      />
      <KpiCard
        icon={<Flame size={16} className="text-orange-600" />}
        iconBg="bg-orange-50"
        label="Hot leads"
        value={stats.hot.toLocaleString()}
        sub="rating = Hot"
        href="/leads-management"
      />
      <KpiCard
        icon={<UserPlus size={16} className="text-violet-600" />}
        iconBg="bg-violet-50"
        label="New leads (30d)"
        value={stats.new30d.toLocaleString()}
        href="/leads-management"
      />
      <KpiCard
        icon={<AlertCircle size={16} className="text-sky-600" />}
        iconBg="bg-sky-50"
        label="Unassigned"
        value={stats.unassigned.toLocaleString()}
        sub={`of ${stats.total.toLocaleString()} total`}
        href="/leads-management"
      />
      <KpiCard
        icon={<BadgeCheck size={16} className="text-amber-600" />}
        iconBg="bg-amber-50"
        label="Reservations"
        value={stats.reservations.toLocaleString()}
        href="/leads-management?status=Reservation"
      />
      <KpiCard
        icon={<Handshake size={16} className="text-emerald-600" />}
        iconBg="bg-emerald-50"
        label="Done deals"
        value={stats.doneDeals.toLocaleString()}
        sub={`${stats.conversionPct}% conversion`}
        href="/deals"
      />
      <KpiCard
        icon={<Wallet size={16} className="text-teal-600" />}
        iconBg="bg-teal-50"
        label="Revenue"
        value={`EGP ${stats.revenue.toLocaleString()}`}
        href="/reports"
      />
      <KpiCard
        icon={<Clock size={16} className="text-red-500" />}
        iconBg="bg-red-50"
        label="Overdue follow-ups"
        value={fuCounts.overdue.toLocaleString()}
        href="/follow-ups?tab=overdue"
      />
      <KpiCard
        icon={<AlertCircle size={16} className="text-orange-600" />}
        iconBg="bg-orange-50"
        label="Follow-ups due today"
        value={fuCounts.dueToday.toLocaleString()}
        href="/follow-ups?tab=today"
      />
      <KpiCard
        icon={<MapPin size={16} className="text-sky-600" />}
        iconBg="bg-sky-50"
        label="Site visits"
        value={visits.scheduled.toLocaleString()}
        sub={`${visits.completed.toLocaleString()} completed`}
        href="/locations"
      />
      <KpiCard
        icon={<TrendingUp size={16} className="text-indigo-600" />}
        iconBg="bg-indigo-50"
        label="Conversion rate"
        value={`${stats.conversionPct}%`}
        sub="Deals ÷ total leads"
        href="/reports"
      />
    </div>
  );
}

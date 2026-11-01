'use client';
import React, { useCallback, useEffect, useState } from 'react';
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
  CalendarClock,
  AlertCircle,
  MapPin,
  ArrowUpRight,
  ChevronDown,
} from 'lucide-react';
import { leadsService, followUpsService, siteVisitsService } from '@/lib/services/crmService';
import { useFollowUpSync } from '@/hooks/useFollowUpSync';

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
      className="flex items-start gap-3 rounded-xl border border-black/5 bg-white p-3.5 group transition-colors hover:border-lime-500/40 active:scale-[0.98] dark:border-white/5 dark:bg-zinc-900/60 dark:hover:border-lime-400/40"
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
  const [fuCounts, setFuCounts] = useState({ overdue: 0, dueToday: 0, upcoming: 0 });
  const [visits, setVisits] = useState({ scheduled: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      leadsService.getDashboardStats(),
      followUpsService.getDashboardCounts(),
      siteVisitsService.getCounts(),
    ])
      .then(([s, f, v]) => {
        setStats(s || EMPTY);
        setFuCounts(f || { overdue: 0, dueToday: 0, upcoming: 0 });
        setVisits(v || { scheduled: 0, completed: 0 });
      })
      .catch(() => setStats(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let mounted = true;
    const wrapped = () => {
      if (!mounted) return Promise.resolve();
      return load();
    };
    wrapped();
    return () => {
      mounted = false;
    };
  }, [load]);

  // Real-time: any follow-up schedule/update/delete wakes this widget without a hard reload.
  useFollowUpSync(load);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-black/5 dark:border-white/5 h-[72px] animate-pulse bg-muted/30" />
        ))}
      </div>
    );
  }

  // Primary ribbon: what a sales user checks first. Everything else stays one click away under "More metrics".
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          icon={<Users size={16} className="text-teal" />}
          iconBg="bg-teal-soft"
          label="Total leads"
          value={stats.total.toLocaleString()}
          href="/leads-management"
        />
        <KpiCard
          icon={<UserPlus size={16} className="text-gold-dark" />}
          iconBg="bg-gold-soft"
          label="New leads (30d)"
          value={stats.new30d.toLocaleString()}
          href="/leads-management"
        />
        <KpiCard
          icon={<Clock size={16} className="text-clay" />}
          iconBg="bg-clay-soft"
          label="Overdue follow-ups"
          value={fuCounts.overdue.toLocaleString()}
          href="/follow-ups?tab=overdue"
        />
        <KpiCard
          icon={<AlertCircle size={16} className="text-gold-dark" />}
          iconBg="bg-gold-soft"
          label="Due today"
          value={fuCounts.dueToday.toLocaleString()}
          href="/follow-ups?tab=today"
        />
        <KpiCard
          icon={<BadgeCheck size={16} className="text-gold-dark" />}
          iconBg="bg-gold-soft"
          label="Reservations"
          value={stats.reservations.toLocaleString()}
          href="/leads-management?status=Reservation"
        />
        <KpiCard
          icon={<Handshake size={16} className="text-sage" />}
          iconBg="bg-sage-soft"
          label="Done deals"
          value={stats.doneDeals.toLocaleString()}
          sub={`${stats.conversionPct}% conversion`}
          href="/deals"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="inline-flex items-center gap-1 rounded-md px-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
      >
        <ChevronDown size={14} className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />
        {showMore ? 'Fewer metrics' : 'More metrics'}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 animate-in fade-in">
          <KpiCard
            icon={<Flame size={16} className="text-clay" />}
            iconBg="bg-clay-soft"
            label="Hot leads"
            value={stats.hot.toLocaleString()}
            sub="Marked as Hot"
            href="/leads-management"
          />
          <KpiCard
            icon={<AlertCircle size={16} className="text-dusk" />}
            iconBg="bg-dusk-soft"
            label="Unassigned"
            value={stats.unassigned.toLocaleString()}
            sub={`of ${stats.total.toLocaleString()} total`}
            href="/leads-management"
          />
          <KpiCard
            icon={<CalendarClock size={16} className="text-teal" />}
            iconBg="bg-teal-soft"
            label="Upcoming follow-ups"
            value={fuCounts.upcoming.toLocaleString()}
            href="/follow-ups?tab=upcoming"
          />
          <KpiCard
            icon={<MapPin size={16} className="text-dusk" />}
            iconBg="bg-dusk-soft"
            label="Site visits"
            value={visits.scheduled.toLocaleString()}
            sub={`${visits.completed.toLocaleString()} completed`}
            href="/locations"
          />
          <KpiCard
            icon={<Wallet size={16} className="text-teal-ink" />}
            iconBg="bg-teal-soft"
            label="Revenue"
            value={`EGP ${stats.revenue.toLocaleString()}`}
            href="/reports"
          />
          <KpiCard
            icon={<TrendingUp size={16} className="text-sage" />}
            iconBg="bg-sage-soft"
            label="Conversion rate"
            value={`${stats.conversionPct}%`}
            sub="Deals ÷ leads"
            href="/reports"
          />
        </div>
      )}
    </div>
  );
}

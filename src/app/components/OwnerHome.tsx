'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users, UserCheck, UserX, Clock, Handshake, Target, RefreshCw, Trophy, ExternalLink } from 'lucide-react';
import KpiCardsGrid from '@/app/components/KpiCardsGrid';
import DailyLeaderboard from '@/app/components/DailyLeaderboard';
import DashboardTeamFilter from '@/app/components/DashboardTeamFilter';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole } from '@/lib/roles';

interface UnifiedData {
  summary: any;
  leadSummary: any;
  conversionMetrics?: any;
  period: any;
}

/**
 * Owner / admin home. Deliberately small: today's headline numbers, the lead stage cards, and the leaderboard.
 * Everything else lives in its own page (Admin, Reports, Leads) one tap away.
 */
export default function OwnerHome() {
  const { user, profile, loading: authLoading } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [data, setData] = useState<UnifiedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const dataRef = useRef<UnifiedData | null>(null);
  dataRef.current = data;

  const load = useCallback(
    async (silent = false) => {
      if (authLoading) return;
      if (!user || !profile || !isAdminRole(profile.role)) {
        setLoading(false);
        return;
      }
      if (!silent && !dataRef.current) setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/dashboard/unified-master?range=${range}`, { cache: 'no-store', credentials: 'same-origin' });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Failed');
        setData(j);
      } catch (e: any) {
        if (!dataRef.current) setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [range, authLoading, user?.id, profile?.role]
  );

  useEffect(() => {
    if (!authLoading) void load(false);
  }, [load, authLoading]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && !authLoading && isAdminRole(profile?.role)) void load(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, authLoading, profile?.role]);

  if (error && !data) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <button onClick={() => load(false)} className="btn-secondary text-sm inline-flex items-center gap-1">
          <RefreshCw size={14} /> {ar ? 'حاول تاني' : 'Retry'}
        </button>
      </div>
    );
  }
  if (!loading && !data) return null;

  const nf = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US');
  const n = (v: any) => nf.format(Number(v || 0));

  // Plain, one-line labels. Arabic first for the team, English underneath.
  const cards = data
    ? [
        { ar: 'كل الليدز', en: 'Total leads', value: data.leadSummary?.total, icon: Target, tone: 'text-lime-600 bg-lime-500/10' },
        { ar: 'صفقات تمت', en: 'Deals won', value: data.conversionMetrics?.doneDeal, icon: Handshake, tone: 'text-emerald-600 bg-emerald-500/10' },
        { ar: 'حاضرين النهارده', en: 'Present today', value: data.summary?.presentToday, icon: UserCheck, tone: 'text-sky-600 bg-sky-500/10' },
        { ar: 'غايبين', en: 'Absent', value: data.summary?.absentToday, icon: UserX, tone: 'text-red-600 bg-red-500/10' },
        { ar: 'متأخرين', en: 'Late', value: data.summary?.lateToday, icon: Clock, tone: 'text-amber-600 bg-amber-500/10' },
        { ar: 'عدد الفريق', en: 'Team size', value: data.summary?.totalEmployees, icon: Users, tone: 'text-slate-600 bg-slate-500/10' },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {/* Title + period */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{ar ? 'الداشبورد' : 'Dashboard'}</h1>
          {data?.period?.from && (
            <p className="text-sm text-muted-foreground">
              {data.period.from} — {data.period.to}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(['week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                range === r ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {r === 'week' ? (ar ? 'الأسبوع' : 'Week') : ar ? 'الشهر' : 'Month'}
            </button>
          ))}
          <button
            onClick={() => load(false)}
            aria-label={ar ? 'تحديث' : 'Refresh'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* 1. Today in numbers */}
      <section aria-label={ar ? 'الأرقام' : 'Numbers'}>
        {!data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 animate-pulse" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dash-card h-[110px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map((c) => (
              <div key={c.en} className="dash-card p-4">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.tone}`}>
                  <c.icon size={18} />
                </span>
                <p className="mt-3 text-3xl font-extrabold tabular-nums text-foreground">{n(c.value)}</p>
                <p className="text-sm font-semibold text-foreground">{ar ? c.ar : c.en}</p>
                <p className="text-[11px] text-muted-foreground">{ar ? c.en : c.ar}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Lead stages (tap a card to open those leads) */}
      <section aria-label={ar ? 'مراحل الليدز' : 'Lead stages'} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">{ar ? 'الليدز حسب المرحلة' : 'Leads by stage'}</h2>
            <p className="text-sm text-muted-foreground">{ar ? 'اضغط على أي كارت تفتح ليدز المرحلة دي' : 'Tap a card to open those leads'}</p>
          </div>
          <a href="/leads-management" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {ar ? 'كل الليدز' : 'All leads'} <ExternalLink size={13} />
          </a>
        </div>
        <DashboardTeamFilter onChange={(t, a) => { setFilterTeamId(t); setFilterAgentId(a); }} />
        <KpiCardsGrid teamId={filterTeamId || undefined} agentId={filterAgentId || undefined} />
      </section>

      {/* 3. Leaderboard */}
      <section aria-label={ar ? 'ترتيب الفريق' : 'Leaderboard'} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Trophy size={18} className="text-amber-500" /> {ar ? 'ترتيب الفريق' : 'Team leaderboard'}
            </h2>
            <p className="text-sm text-muted-foreground">{ar ? 'مين الأكتر شغل النهارده' : 'Who worked the most today'}</p>
          </div>
          <a href="/admin?tab=productivity" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {ar ? 'الترتيب الكامل' : 'Full ranking'} <ExternalLink size={13} />
          </a>
        </div>
        <DailyLeaderboard />
      </section>
    </div>
  );
}

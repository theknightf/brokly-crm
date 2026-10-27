'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Building,
  Calendar,
  Clock,
  UserCheck,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Banknote,
  MessageCircle,
  Copy,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Flag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusPill } from '@/components/ui/StatusPill';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';

interface LeadProfile {
  lead: any;
  metrics: any;
  callLogs: any[];
  followUps: any[];
  rotations: any[];
  activity: any[];
  duplicates: any[];
  timeline: any[];
  drillLinks: any;
}

const CALLS_COLLAPSED = 6;
const TIMELINE_STEP = 15;

/** Tinted icon chips; full class names so Tailwind keeps them. */
const TONES = {
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
} as const;

const TIMELINE_BADGE: Record<string, string> = {
  call: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rotation: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

function SectionTitle({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="p-4 border-b border-border flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-lime-500/15 text-lime-600 dark:text-lime-400 flex items-center justify-center shrink-0">{icon}</span>
        {children}
      </h2>
      {aside}
    </div>
  );
}

export default function LeadProfileScreen({ leadId }: { leadId: string }) {
  const [data, setData] = useState<LeadProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [timelineCount, setTimelineCount] = useState(TIMELINE_STEP);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/leads/${leadId}/profile`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/employees/list-simple', { cache: 'no-store' }).then(r=>r.json()).then(j=>{
      if (Array.isArray(j.users)) setUsers(j.users);
      else return fetch('/api/admin/analytics?period=day', { cache:'no-store'}).then(r=>r.json()).then(j2=>{
        if (Array.isArray(j2.users)) setUsers(j2.users.map((u:any)=>({id:u.user_id, full_name:u.full_name, email:u.email})));
      });
    }).catch(()=>{});
  }, []);

  const handleAssign = async () => {
    if (!assignTo) { toast.error('Select a sales rep'); return; }
    setAssigning(true);
    try {
      const res = await fetch('/api/leads', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ leadId, assignedTo: assignTo }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error||'Failed');
      toast.success(j.message||'Assigned');
      load();
    } catch (e:any) { toast.error(e.message); } finally { setAssigning(false); }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Lead ID copied');
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading lead profile">
        <div className="dash-card h-44" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5"><div className="dash-card h-72" /><div className="dash-card h-72" /></div>
          <div className="space-y-5"><div className="dash-card h-40" /><div className="dash-card h-40" /></div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="dash-card p-8 text-center max-w-md mx-auto">
        <p className="text-sm text-destructive mb-4">{error}</p>
        <button onClick={load} className="btn-secondary text-sm min-h-[44px] inline-flex items-center gap-1.5"><RefreshCw size={14} aria-hidden /> Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const { lead, metrics, callLogs, duplicates, timeline } = data;
  const initials = (lead.name || 'L').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  const stage = lead.stage || lead.crmStatus || '';
  const hasPhone = !!(lead.phone && String(lead.phone).replace(/\D/g, ''));
  const visibleCalls = showAllCalls ? callLogs : callLogs.slice(0, CALLS_COLLAPSED);
  const visibleTimeline = timeline.slice(0, Math.min(timelineCount, 60));
  const timelineTotal = Math.min(timeline.length, 60);

  const contact: { icon: React.ReactNode; label: string; value: string; mono?: boolean }[] = [
    { icon: <Phone size={14} />, label: 'Phone', value: lead.phone || '', mono: true },
    { icon: <Mail size={14} />, label: 'Email', value: lead.email || '' },
    { icon: <MapPin size={14} />, label: 'Location', value: lead.location || '' },
    { icon: <Building size={14} />, label: 'Project', value: lead.project || lead.developer || '' },
  ];

  const metricCards: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; tone: keyof typeof TONES }[] = [
    { label: 'Total Calls', value: metrics.totalCalls, sub: `${metrics.validCalls} valid • ${metrics.flaggedCalls} flagged`, icon: <Phone size={15} />, tone: 'emerald' },
    { label: 'Pending Follow-ups', value: metrics.followUpsPending, icon: <Calendar size={15} />, tone: 'amber' },
    { label: 'Rotations', value: metrics.rotations, icon: <TrendingUp size={15} />, tone: 'violet' },
    { label: 'Budget', value: lead.budgetMin || lead.budgetMax ? `${lead.budgetMin||0}–${lead.budgetMax||0}` : '—', icon: <Banknote size={15} />, tone: 'sky' },
  ];

  return (
    <div className="space-y-5">
      <a
        href="/leads-management"
        className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden /> Back to Leads
      </a>

      {/* ── Header: who this lead is, how to reach them, where they are in the pipeline ── */}
      <section className="dash-card p-5" aria-labelledby="lead-name">
        <div className="flex gap-4 min-w-0">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lime-400 to-lime-600 text-zinc-950 flex items-center justify-center font-extrabold text-xl shrink-0" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 id="lead-name" className="text-2xl font-extrabold tracking-tight text-foreground break-words">{lead.name}</h1>
              {stage && <StatusPill status={stage} large />}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => copyId(lead.id)}
                title="Copy lead ID"
                aria-label="Copy lead ID"
                className="inline-flex items-center gap-1 font-mono rounded px-1 -mx-1 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ID: {lead.id} <Copy size={11} aria-hidden />
              </button>
              <span>Created {lead.createdAt?.slice(0,10)}</span>
              <span>Updated {lead.updatedAt?.slice(0,10)}</span>
            </p>
          </div>
        </div>

        <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {contact.map((c) => (
            <li key={c.label} className="flex items-center gap-3 rounded-xl border border-border p-3 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-zinc-500/10 text-muted-foreground flex items-center justify-center shrink-0" aria-hidden>{c.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">{c.label}</span>
                <span className={`block text-sm font-medium text-foreground truncate ${c.mono ? 'font-mono' : ''}`} dir={c.mono ? 'ltr' : undefined}>
                  {c.value || <span className="text-muted-foreground font-normal">—</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {hasPhone && (
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`tel:${String(lead.phone).replace(/[^0-9+]/g, '')}`} className="btn-primary min-h-[44px] inline-flex items-center gap-2 text-sm">
              <Phone size={15} aria-hidden /> Call
            </a>
            <a
              href={getWhatsAppLinkForLead(lead.phone, lead.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary min-h-[44px] inline-flex items-center gap-2 text-sm"
            >
              <MessageCircle size={15} aria-hidden /> WhatsApp
            </a>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ── Side column: the numbers that matter, ownership, duplicates ── */}
        <aside className="space-y-5 lg:order-2" aria-label="Lead summary">
          <section className="grid grid-cols-2 gap-3" aria-label="Key metrics">
            {metricCards.map((c) => (
              <div key={c.label} className="dash-card p-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${TONES[c.tone]}`} aria-hidden>{c.icon}</div>
                <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight text-foreground break-words">{c.value}</p>
                {c.sub && <p className="mt-0.5 text-xs text-muted-foreground">{c.sub}</p>}
              </div>
            ))}
          </section>

          <section className="dash-card" aria-labelledby="assign-title">
            <SectionTitle icon={<UserCheck size={15} aria-hidden />}><span id="assign-title">Assign to (1-click dropdown)</span></SectionTitle>
            <div className="p-4 space-y-3">
              <div>
                <label htmlFor="assign-select" className="sr-only">Sales rep</label>
                <select id="assign-select" value={assignTo} onChange={e=>setAssignTo(e.target.value)} className="input-base text-sm [@media(pointer:coarse)]:h-11">
                  <option value="">Select rep…</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                </select>
              </div>
              <button onClick={handleAssign} disabled={assigning || !assignTo} className="btn-primary w-full min-h-[44px] text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {assigning ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <UserCheck size={14} aria-hidden />} Assign
              </button>
              {lead.assignedToName && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <UserCheck size={13} aria-hidden /> Currently: <strong className="font-semibold">{lead.assignedToName}</strong>
                  <a href={data.drillLinks.employee360||'#'} className="text-lime-700 dark:text-lime-400 hover:underline">360 →</a>
                </p>
              )}
            </div>
          </section>

          {duplicates.length > 0 && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4" aria-labelledby="dup-title">
              <h2 id="dup-title" className="text-sm font-bold flex items-center gap-2 text-amber-800 dark:text-amber-200"><AlertTriangle size={15} aria-hidden /> Duplicates detected — global deduplication</h2>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">This phone/email matches existing lead(s). Click to view canonical profile.</p>
              <ul className="space-y-1.5 mt-3">
                {duplicates.map((d:any)=>(
                  <li key={d.id}>
                    <a href={d.profileLink} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-card border border-amber-500/30 hover:border-amber-500/60 text-sm min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="font-medium truncate">{d.name} • {d.phone||d.email}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">{d.status} <ExternalLink size={12} aria-hidden /></span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        {/* ── Main column: what has happened with this lead ── */}
        <div className="lg:col-span-2 space-y-5 lg:order-1">
          <section className="dash-card overflow-hidden" aria-labelledby="calls-title">
            <SectionTitle
              icon={<Phone size={15} aria-hidden />}
              aside={<span className="text-xs text-muted-foreground tabular-nums">{callLogs.length} calls</span>}
            >
              <span id="calls-title">Call History • Anti-Fraud Validated</span>
            </SectionTitle>
            {callLogs.length===0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 px-4">No calls yet. Log one from LeadQuickActions or ActiveCallTimer.</p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {visibleCalls.map((c:any)=>{
                    const invalid = c.is_valid===false;
                    const flagged = !invalid && !!c.is_flagged;
                    return (
                      <li key={c.id} className={`p-4 flex items-start justify-between gap-3 ${flagged ? 'bg-amber-500/10' : invalid ? 'bg-red-500/10' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-2">
                            {c.outcome}
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${invalid ? 'bg-red-500/15 text-red-700 dark:text-red-300' : flagged ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
                              {invalid ? <XCircle size={11} aria-hidden /> : flagged ? <Flag size={11} aria-hidden /> : <CheckCircle2 size={11} aria-hidden />}
                              {invalid ? 'Invalid <30s' : flagged ? 'Flagged >45m' : 'Valid'}
                            </span>
                            <span className="text-xs font-normal text-muted-foreground font-mono tabular-nums">{c.duration_seconds}s</span>
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{c.notes||'—'}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">{new Date(c.created_at).toLocaleString()} • {c.channel} • {c.direction}</p>
                          {c.flag_reason && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">⚑ {c.flag_reason}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{c.agent_name||''}</span>
                      </li>
                    );
                  })}
                </ul>
                {callLogs.length > CALLS_COLLAPSED && (
                  <button
                    type="button"
                    onClick={() => setShowAllCalls((v) => !v)}
                    aria-expanded={showAllCalls}
                    className="w-full min-h-[44px] border-t border-border text-sm font-medium text-lime-700 dark:text-lime-400 hover:bg-zinc-500/10 inline-flex items-center justify-center gap-1.5 focus:outline-none focus-visible:bg-zinc-500/10"
                  >
                    {showAllCalls ? <>Show less <ChevronUp size={14} aria-hidden /></> : <>Show all {callLogs.length} calls <ChevronDown size={14} aria-hidden /></>}
                  </button>
                )}
              </>
            )}
          </section>

          <section className="dash-card overflow-hidden" aria-labelledby="timeline-title">
            <SectionTitle
              icon={<Clock size={15} aria-hidden />}
              aside={<span className="text-xs text-muted-foreground tabular-nums">{visibleTimeline.length} / {timelineTotal}</span>}
            >
              <span id="timeline-title">Unified Timeline</span>
            </SectionTitle>
            {visibleTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 px-4">No activity yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {visibleTimeline.map((t:any,i:number)=>(
                  <li key={i} className="px-4 py-3 flex gap-3">
                    <span className="w-[7.5rem] shrink-0 font-mono text-xs text-muted-foreground tabular-nums pt-0.5">{String(t.at).slice(0,16).replace('T',' ')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${TIMELINE_BADGE[t.type] || 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'}`}>{t.type}</span>
                        <span className="text-sm font-medium text-foreground break-words">{t.label}</span>
                      </span>
                      {t.detail && <span className="block text-xs text-muted-foreground mt-0.5 break-words">{t.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {timelineCount < timelineTotal && (
              <button
                type="button"
                onClick={() => setTimelineCount((n) => n + TIMELINE_STEP)}
                className="w-full min-h-[44px] border-t border-border text-sm font-medium text-lime-700 dark:text-lime-400 hover:bg-zinc-500/10 inline-flex items-center justify-center gap-1.5 focus:outline-none focus-visible:bg-zinc-500/10"
              >
                Show more <ChevronDown size={14} aria-hidden />
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

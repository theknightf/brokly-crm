'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, Check, ClipboardList, Copy, Loader2, MessageCircle, MessageSquare, Activity, Phone, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { StatusPill } from '@/components/ui/StatusPill';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { leadsService } from '@/lib/services/crmService';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate, fmtTime, fmtNextAction, isOverdue, cairoDay } from '@/lib/cairoDate';
import type { Lead } from '@/app/leads-management/components/mockLeads';
import LeadNotesSection from '@/app/leads-management/components/LeadNotesSection';
import LeadEventsTimeline from '@/app/leads-management/components/LeadEventsTimeline';

/**
 * Phone layout of /leads/[id]: sticky header (name, stage, call, WhatsApp) + tabs Info / Notes / Activity.
 * `?tab=notes` / `?tab=activity` open a tab directly. Notes and Activity load when their tab is opened.
 * Desktop keeps LeadProfileScreen; this file is only rendered below 640px.
 */

type Tab = 'info' | 'notes' | 'activity';
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'info', label: 'Info', icon: <ClipboardList size={15} aria-hidden /> },
  { key: 'notes', label: 'Notes', icon: <MessageSquare size={15} aria-hidden /> },
  { key: 'activity', label: 'Activity', icon: <Activity size={15} aria-hidden /> },
];

export default function MobileLeadProfile({ leadId }: { leadId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const initialTab = (['info', 'notes', 'activity'] as Tab[]).includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'info';
  const [tab, setTabState] = useState<Tab>(initialTab);
  // Notes / Activity mount the first time they are opened, then stay mounted (no reload when switching back).
  const [opened, setOpened] = useState<Record<Tab, boolean>>({ info: true, notes: initialTab === 'notes', activity: initialTab === 'activity' });
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [due, setDue] = useState('');
  const [savingDue, setSavingDue] = useState(false);

  const setTab = (t: Tab) => {
    setTabState(t);
    setOpened((o) => ({ ...o, [t]: true }));
    // Keep the URL shareable without adding history entries.
    const url = new URL(window.location.href);
    if (t === 'info') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.toString());
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const l = (await leadsService.getById(leadId)) as Lead | null;
      if (!l) throw new Error('Lead not found or you do not have access to it.');
      setLead(l);
      setDue(l.followUpDue ? String(l.followUpDue).slice(0, 10) : '');
    } catch (e: any) {
      setError(e?.message || 'Could not load the lead.');
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDue = async (value: string | null) => {
    if (!lead) return;
    setSavingDue(true);
    try {
      if (value) {
        await leadsService.scheduleFollowUp(lead.id, value, user?.id || null);
      } else {
        const { error: e } = await createClient().from('leads').update({ follow_up_due: null }).eq('id', lead.id);
        if (e) throw e;
      }
      setLead({ ...lead, followUpDue: value || undefined });
      setDue(value || '');
      toast.success(value ? `Next action date: ${fmtDate(value)}` : 'Next action date cleared');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the next action date');
    } finally {
      setSavingDue(false);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex min-h-[44px] items-center gap-1.5 text-sm">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const overdue = !!lead && isOverdue(lead.followUpDue, lead.status);
  const assigned =
    lead && lead.assignedToNames && lead.assignedToNames.length > 0 ? lead.assignedToNames.join(' & ') : lead?.assignedToName || '';

  return (
    // Full width inside the page padding (AppLayout uses px-6 on phones).
    <div className="-mx-6 min-h-[70dvh] bg-background sm:hidden">
      {/* Sticky header: stays while switching tabs */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 pt-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/leads-management'))}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft size={20} className="rtl:rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            {lead ? (
              <>
                <h1 className="truncate text-base font-bold text-foreground" dir="auto">
                  {lead.name || lead.phone || 'Lead'}
                </h1>
                <div className="mt-0.5">
                  <StatusPill status={lead.status || 'Fresh Leads'} />
                </div>
              </>
            ) : (
              <div className="space-y-1.5" aria-hidden>
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
              </div>
            )}
          </div>
          {lead?.phone && (
            <>
              <a
                href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
                aria-label="Call"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-500/15 text-lime-700 dark:text-lime-300"
              >
                <Phone size={18} />
              </a>
              <a
                href={getWhatsAppLinkForLead(lead.phone, lead.name)}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              >
                <MessageCircle size={18} />
              </a>
            </>
          )}
        </div>
        <nav className="mt-2 flex px-2" role="tablist" aria-label="Lead sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold ${
                tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
              }`}
            >
              {t.icon}
              {t.label}
              {t.key === 'notes' && noteCount != null && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{noteCount}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="px-4 py-4">
        {/* ── Info ── */}
        <div hidden={tab !== 'info'} className="space-y-4">
          {!lead ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <>
              <section aria-label="Dates" className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Created</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{fmtDate(lead.createdAtIso || lead.createdAt)}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{fmtTime(lead.createdAtIso)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Assigned</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{fmtDate(lead.assignedAt)}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{fmtTime(lead.assignedAt)}</p>
                </div>
              </section>

              {/* Next action date: native date picker, saved right away, red when overdue */}
              <section
                aria-label="Next action date"
                className={`rounded-2xl border p-3.5 ${overdue ? 'border-red-500/50 bg-red-500/5' : 'border-border bg-card'}`}
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <CalendarClock size={15} className={overdue ? 'text-red-500' : 'text-primary'} />
                  <p className="text-sm font-semibold text-foreground">Next action date</p>
                  <span className={`ms-auto text-xs font-semibold ${overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    {lead.followUpDue ? `${overdue ? 'Overdue · ' : ''}${fmtNextAction(lead.followUpDue)}` : 'Not set'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={due}
                    min={cairoDay()}
                    onChange={(e) => setDue(e.target.value)}
                    aria-label="Next action date"
                    className={`input-base h-12 min-h-[48px] flex-1 text-base ${overdue ? 'border-red-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => void saveDue(due || null)}
                    disabled={savingDue || due === (lead.followUpDue ? String(lead.followUpDue).slice(0, 10) : '')}
                    className="flex h-12 min-w-[48px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    {savingDue ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Save
                  </button>
                  {lead.followUpDue && (
                    <button
                      type="button"
                      onClick={() => void saveDue(null)}
                      disabled={savingDue}
                      aria-label="Clear next action date"
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-muted-foreground"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </section>

              {/* Details (what the lead page showed before) */}
              <section aria-label="Details" className="space-y-2">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Details</h2>
                {lead.phone && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Phone</p>
                      <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="block truncate text-sm font-semibold text-primary">
                        {lead.phone}
                      </a>
                    </div>
                    <button
                      type="button"
                      aria-label="Copy phone number"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lead.phone);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground"
                    >
                      {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Phone 2', lead.phone2],
                    ['Email', lead.email],
                    ['Assigned to', assigned || 'Unassigned'],
                    ['Source', lead.source],
                    ['Project', lead.project || lead.developer],
                    ['Location', lead.location],
                    ['Priority', lead.priority],
                    ['Rating', lead.leadRating],
                    ['Team', lead.team],
                    ['Budget', lead.budgetMin || lead.budgetMax ? `${(lead.budgetMin || 0).toLocaleString()}–${(lead.budgetMax || 0).toLocaleString()}` : ''],
                  ]
                    .filter(([, v]) => v && String(v).trim())
                    .map(([k, v]) => (
                      <div key={String(k)} className="min-w-0 rounded-xl border border-border bg-card px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{k}</p>
                        <p className="truncate text-sm font-medium text-foreground" dir="auto" title={String(v)}>
                          {String(v)}
                        </p>
                      </div>
                    ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* ── Notes (loaded when first opened) ── */}
        {opened.notes && (
          <div hidden={tab !== 'notes'}>
            <LeadNotesSection
              leadId={leadId}
              leadNotes={lead?.notes}
              onCount={setNoteCount}
              composer="bottom"
              stickyTopClass="none"
              pageSize={30}
            />
          </div>
        )}

        {/* ── Activity (loaded when first opened) ── */}
        {opened.activity && (
          <div hidden={tab !== 'activity'}>
            <LeadEventsTimeline leadId={leadId} onOpenNote={() => setTab('notes')} />
          </div>
        )}
      </div>
    </div>
  );
}

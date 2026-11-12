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

  const initials =
    (lead?.name || '')
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '';

  /** One row of a grouped list: label on one side, value on the other. */
  const Row = ({ label, value, href, ltr }: { label: string; value?: string | null; href?: string; ltr?: boolean }) =>
    value && String(value).trim() ? (
      <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2">
        <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
        {href ? (
          <a href={href} dir={ltr ? 'ltr' : 'auto'} className="min-w-0 truncate text-end text-sm font-semibold text-primary">
            {value}
          </a>
        ) : (
          <span dir={ltr ? 'ltr' : 'auto'} className="min-w-0 truncate text-end text-sm font-medium text-foreground" title={String(value)}>
            {value}
          </span>
        )}
      </div>
    ) : null;

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => {
    const items = React.Children.toArray(children).filter(Boolean);
    if (!items.length) return null;
    return (
      <section aria-label={title}>
        <h2 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{items}</div>
      </section>
    );
  };

  return (
    // Full width inside the page padding (AppLayout uses px-6 on phones).
    <div className="-mx-6 min-h-[70dvh] bg-background sm:hidden">
      {/* Sticky header: who, stage, call / WhatsApp, tabs — stays while switching tabs */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="flex items-center gap-3 px-3 pt-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/leads-management'))}
            aria-label="Back"
            className="-ms-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft size={20} className="rtl:rotate-180" />
          </button>
          {lead ? (
            <>
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-500/15 text-sm font-bold text-lime-700 dark:text-lime-300"
                aria-hidden
              >
                {initials || <Phone size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-bold leading-tight text-foreground" dir="auto">
                  {lead.name || lead.phone || 'Lead'}
                </h1>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill status={lead.status || 'Fresh Leads'} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center gap-3" aria-hidden>
              <span className="h-11 w-11 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
          )}
        </div>

        {/* Call / WhatsApp: big and labelled */}
        <div className="grid grid-cols-2 gap-2 px-3 pt-3">
          <a
            href={lead?.phone ? `tel:${lead.phone.replace(/[^\d+]/g, '')}` : undefined}
            aria-disabled={!lead?.phone}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:scale-[0.98] ${
              lead?.phone ? '' : 'pointer-events-none opacity-40'
            }`}
          >
            <Phone size={17} /> Call
          </a>
          <a
            href={lead?.phone ? getWhatsAppLinkForLead(lead.phone, lead.name) : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!lead?.phone}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-foreground active:scale-[0.98] ${
              lead?.phone ? '' : 'pointer-events-none opacity-40'
            }`}
          >
            <MessageCircle size={17} className="text-[#25D366]" /> WhatsApp
          </a>
        </div>

        {/* Tabs as a segmented control */}
        <nav className="px-3 py-3" aria-label="Lead sections">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {t.icon}
                {t.label}
                {t.key === 'notes' && noteCount != null && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[11px] tabular-nums text-primary">{noteCount}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <div className="px-4 py-4">
        {/* ── Info ── */}
        <div hidden={tab !== 'info'} className="space-y-5">
          {!lead ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <>
              {/* Next action: the one thing to act on, first */}
              <section
                aria-label="Next action date"
                className={`rounded-2xl border p-4 ${
                  overdue ? 'border-red-500/50 bg-red-500/10' : lead.followUpDue ? 'border-primary/30 bg-primary/5' : 'border-dashed border-border bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      <CalendarClock size={14} /> {overdue ? 'Next action · overdue' : 'Next action'}
                    </p>
                    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${overdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                      {lead.followUpDue ? fmtNextAction(lead.followUpDue) : 'Not set'}
                    </p>
                    {lead.followUpDue && <p className="text-xs tabular-nums text-muted-foreground">{fmtDate(lead.followUpDue)}</p>}
                  </div>
                  {lead.followUpDue && (
                    <button
                      type="button"
                      onClick={() => void saveDue(null)}
                      disabled={savingDue}
                      aria-label="Clear next action date"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="date"
                    value={due}
                    min={cairoDay()}
                    onChange={(e) => setDue(e.target.value)}
                    aria-label="Next action date"
                    className="input-base h-12 min-h-[48px] flex-1 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => void saveDue(due || null)}
                    disabled={savingDue || due === (lead.followUpDue ? String(lead.followUpDue).slice(0, 10) : '')}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-40"
                  >
                    {savingDue ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Save
                  </button>
                </div>
              </section>

              <Group title="Contact">
                {lead.phone && (
                  <div className="flex min-h-[48px] items-center justify-between gap-3 ps-4 pe-1.5">
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <span className="flex min-w-0 items-center gap-1">
                      <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="truncate text-sm font-semibold text-primary">
                        {lead.phone}
                      </a>
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
                    </span>
                  </div>
                )}
                <Row label="Phone 2" value={lead.phone2} href={lead.phone2 ? `tel:${lead.phone2.replace(/[^\d+]/g, '')}` : undefined} ltr />
                <Row label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} ltr />
                <Row label="Location" value={lead.location} />
              </Group>

              <Group title="Lead">
                <Row label="Assigned to" value={assigned || 'Unassigned'} />
                <Row label="Source" value={lead.source} />
                <Row label="Project" value={lead.project || lead.developer} />
                <Row
                  label="Budget"
                  value={lead.budgetMin || lead.budgetMax ? `${(lead.budgetMin || 0).toLocaleString()} – ${(lead.budgetMax || 0).toLocaleString()} EGP` : ''}
                />
                <Row label="Priority" value={lead.priority && lead.priority !== 'Normal' ? lead.priority : ''} />
                <Row label="Rating" value={lead.leadRating} />
                <Row label="Team" value={lead.team} />
              </Group>

              <Group title="Dates">
                <Row label="Created" value={lead.createdAtIso || lead.createdAt ? `${fmtDate(lead.createdAtIso || lead.createdAt)}${fmtTime(lead.createdAtIso) ? ` · ${fmtTime(lead.createdAtIso)}` : ''}` : ''} />
                <Row label="Assigned" value={lead.assignedAt ? `${fmtDate(lead.assignedAt)} · ${fmtTime(lead.assignedAt)}` : ''} />
              </Group>
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

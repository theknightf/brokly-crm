'use client';
import React, { useState, useEffect } from 'react';
import {
  FollowUp,
  FollowUpStatus,
  FollowUpType,
  FollowUpPriority,
  ContactType,
  RelationshipStatus,
  ALL_FOLLOW_UP_TYPES,
  ALL_PRIORITIES,
} from './mockFollowUps';
import { getActiveAgentNames } from '@/app/teams/components/mockTeamMembers';
import { leadsService, teamsService } from '@/lib/services/crmService';
import { Link2, Search, Loader2, UserCircle2 } from 'lucide-react';

interface FollowUpFormProps {
  initial?: Partial<FollowUp>;
  onSubmit: (data: FollowUp) => void;
  onCancel: () => void;
}

interface LeadResult {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyType: string;
  project: string;
  unit: string;
}

export default function FollowUpForm({ initial, onSubmit, onCancel }: FollowUpFormProps) {
  const [agentList, setAgentList] = useState<string[]>(() => getActiveAgentNames());

  useEffect(() => {
    const refresh = () => setAgentList(getActiveAgentNames());
    window.addEventListener('team-members-updated', refresh);
    // Prefer the real user list; fall back to the in-memory team members only
    // when the API/database is unavailable.
    teamsService
      .getAssignableUsers()
      .then((users: { id: string; name: string }[]) => {
        const names = (users || []).map((u) => u.name).filter(Boolean);
        if (names.length > 0) setAgentList(names);
      })
      .catch(() => {});
    return () => window.removeEventListener('team-members-updated', refresh);
  }, []);

  const [form, setForm] = useState({
    title: initial?.title ?? '',
    contactName: initial?.contactName ?? '',
    contactType: (initial?.contactType ?? 'Lead') as ContactType,
    contactPhone: initial?.contactPhone ?? '',
    contactEmail: initial?.contactEmail ?? '',
    type: (initial?.type ?? 'Call') as FollowUpType,
    status: (initial?.status ?? 'Pending') as FollowUpStatus,
    priority: (initial?.priority ?? 'Medium') as FollowUpPriority,
    dueDate: initial?.dueDate ?? new Date().toISOString().split('T')[0],
    dueTime: initial?.dueTime ?? new Date().toTimeString().slice(0, 5),
    agent: initial?.agent ?? '',
    notes: initial?.notes ?? '',
    propertyInterest: initial?.propertyInterest ?? '',
    relationshipStatus: (initial?.relationshipStatus ?? '') as RelationshipStatus | '',
    leadId: initial?.leadId ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkedLeadName, setLinkedLeadName] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<LeadResult[]>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);

  useEffect(() => {
    if (!form.leadId) return;
    leadsService
      .getById(form.leadId)
      .then((lead: any) => {
        if (lead) setLinkedLeadName(lead.name || '');
      })
      .catch(() => {});
  }, [form.leadId]);

  useEffect(() => {
    const q = leadSearch.trim();
    if (q.length < 2) {
      setLeadResults([]);
      return;
    }
    let cancelled = false;
    setLeadSearching(true);
    const t = setTimeout(() => {
      leadsService
        .search(q)
        .then((results) => {
          if (!cancelled) setLeadResults(results as LeadResult[]);
        })
        .catch(() => {
          if (!cancelled) setLeadResults([]);
        })
        .finally(() => {
          if (!cancelled) setLeadSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [leadSearch]);

  const set = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  const linkLead = (r: LeadResult) => {
    setForm((p) => {
      const next = { ...p, leadId: r.id };
      if (!next.contactName.trim()) next.contactName = r.name;
      if (!next.contactPhone.trim()) next.contactPhone = r.phone;
      if (!next.contactEmail.trim()) next.contactEmail = r.email;
      if (!next.propertyInterest.trim()) {
        const interest = [r.project, r.unit, r.propertyType].filter(Boolean).join(' – ');
        next.propertyInterest = interest || r.propertyType;
      }
      return next;
    });
    setLinkedLeadName(r.name);
    setLeadSearch('');
    setLeadResults([]);
    setLeadSearchOpen(false);
  };

  const clearLeadLink = () => {
    setForm((p) => ({ ...p, leadId: '' }));
    setLinkedLeadName('');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.contactName.trim()) e.contactName = 'Contact name is required';
    if (!form.dueDate) e.dueDate = 'Due date is required';
    if (!form.dueTime) e.dueTime = 'Due time is required';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    const now = new Date().toISOString().split('T')[0];
    onSubmit({
      id: initial?.id ?? `fu-${Date.now()}`,
      ...form,
      leadId: form.leadId || undefined,
      agentInitials: form.agent
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
      relationshipStatus: form.relationshipStatus || undefined,
      createdAt: initial?.createdAt ?? now,
      completedAt: form.status === 'Completed' ? now : undefined,
    });
  };

  const Field = ({
    label,
    error,
    children,
  }: {
    label: string;
    error?: string;
    children: React.ReactNode;
  }) => (
    <div>
      <label className="label-base">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Follow-up Title *" error={errors.title}>
            <input
              autoFocus
              className="input-base"
              placeholder="e.g. Follow up on site visit feedback"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <label className="label-base">Quick type</label>
          <div className="flex flex-wrap gap-2">
            {(['Call', 'WhatsApp', 'Site Visit', 'Meeting'] as FollowUpType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('type', t)}
                className={`btn-press px-3 py-1.5 rounded-full text-sm font-medium border transition-colors active:scale-[0.97] ${
                  form.type === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Field label="Contact Name *" error={errors.contactName}>
          <input
            className="input-base"
            placeholder="Full name"
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
          />
        </Field>

        <Field label="Contact Type">
          <select
            className="input-base"
            value={form.contactType}
            onChange={(e) => {
              const v = e.target.value;
              set('contactType', v);
              if (v === 'Customer') clearLeadLink();
            }}
          >
            <option value="Lead">Lead</option>
            <option value="Customer">Customer</option>
          </select>
        </Field>

        <Field label="Phone">
          <input
            className="input-base"
            placeholder="+91-XXXXX-XXXXX"
            value={form.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
          />
        </Field>

        <Field label="Email">
          <input
            className="input-base"
            type="email"
            placeholder="email@example.com"
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
          />
        </Field>

        {form.contactType === 'Lead' && (
          <div className="sm:col-span-2 rounded-xl border border-border bg-muted/40 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Link to a lead</span>
            </div>

            {form.leadId ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
                <UserCircle2 size={15} className="flex-shrink-0" />
                <span className="truncate font-medium">
                  Linked lead: {linkedLeadName || 'Linked'}
                </span>
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setLeadSearch('');
                      setLeadSearchOpen(true);
                    }}
                    className="text-xs font-semibold hover:underline"
                  >
                    Select another
                  </button>
                  <button
                    type="button"
                    onClick={clearLeadLink}
                    className="text-xs font-semibold text-emerald-700/70 hover:text-emerald-700 hover:underline"
                  >
                    Remove link
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick a lead to keep this follow-up linked. We won't create a duplicate lead.
              </p>
            )}

            {(!form.leadId || leadSearchOpen) && (
              <div className="relative">
                <input
                  className="input-base pl-9"
                  placeholder="Search leads by name, phone, email, project or unit…"
                  value={leadSearch}
                  onChange={(e) => {
                    setLeadSearch(e.target.value);
                    setLeadSearchOpen(true);
                  }}
                  onFocus={() => setLeadSearchOpen(true)}
                />
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                {leadSearching && (
                  <Loader2
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary"
                  />
                )}
                {leadSearchOpen && leadSearch.trim().length >= 2 && (
                  <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl shadow-modal overflow-y-auto max-h-56 fade-in">
                    {leadResults.length === 0 && !leadSearching ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No leads found</p>
                    ) : (
                      leadResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => linkLead(r)}
                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                        >
                          <span className="block text-sm font-medium text-foreground">
                            {r.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {[r.project, r.unit, r.propertyType].filter(Boolean).join(' · ') ||
                              [r.phone, r.email].filter(Boolean).join(' · ')}
                          </span>
                          <span className="block text-[11px] text-muted-foreground/80">
                            {r.phone} · {r.email}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Field label="Property Interest">
          <input
            className="input-base"
            placeholder="e.g. 3BHK Apartment – Powai"
            value={form.propertyInterest}
            onChange={(e) => set('propertyInterest', e.target.value)}
          />
        </Field>

        <Field label="Follow-up Type">
          <select
            className="input-base"
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
          >
            {ALL_FOLLOW_UP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Due Date *" error={errors.dueDate}>
          <input
            className="input-base"
            type="date"
            value={form.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
          />
        </Field>

        <Field label="Due Time *" error={errors.dueTime}>
          <input
            className="input-base"
            type="time"
            value={form.dueTime}
            onChange={(e) => set('dueTime', e.target.value)}
          />
        </Field>

        <Field label="Assigned Agent">
          <select
            className="input-base"
            value={form.agent}
            onChange={(e) => set('agent', e.target.value)}
          >
            {agentList.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <select
            className="input-base"
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
          >
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            className="input-base"
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {(
              ['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'] as FollowUpStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea
              className="input-base resize-none"
              rows={3}
              placeholder="Add any relevant notes…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {initial?.id ? 'Save Changes' : 'Schedule Follow-up'}
        </button>
      </div>
    </form>
  );
}

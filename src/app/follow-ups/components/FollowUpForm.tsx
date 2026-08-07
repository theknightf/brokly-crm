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

interface FollowUpFormProps {
  initial?: Partial<FollowUp>;
  onSubmit: (data: FollowUp) => void;
  onCancel: () => void;
}

export default function FollowUpForm({ initial, onSubmit, onCancel }: FollowUpFormProps) {
  const [agentList, setAgentList] = useState<string[]>(() => getActiveAgentNames());

  useEffect(() => {
    const refresh = () => setAgentList(getActiveAgentNames());
    window.addEventListener('team-members-updated', refresh);
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
    dueDate: initial?.dueDate ?? '',
    dueTime: initial?.dueTime ?? '',
    agent: initial?.agent ?? getActiveAgentNames()[1] ?? 'Arjun Sharma',
    notes: initial?.notes ?? '',
    propertyInterest: initial?.propertyInterest ?? '',
    relationshipStatus: (initial?.relationshipStatus ?? '') as RelationshipStatus | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
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
              className="input-base"
              placeholder="e.g. Follow up on site visit feedback"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
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
            onChange={(e) => set('contactType', e.target.value)}
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

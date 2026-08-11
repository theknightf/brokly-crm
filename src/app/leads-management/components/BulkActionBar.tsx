'use client';
import React, { useState, useEffect } from 'react';
import {
  Trash2,
  UserCheck,
  X,
  ChevronDown,
  Loader2,
  MessageCircle,
  ExternalLink,
  Send,
  Users,
  Mail,
  Smartphone,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { teamsService, messageLogsService } from '@/lib/services/crmService';

interface AssignableUser {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
}

export interface BulkLead {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

interface BulkActionBarProps {
  selectedCount: number;
  selectedLeads: BulkLead[];
  onDelete: () => void;
  onAssign: (userId: string, userName: string) => void;
  onAssignTeam: (teamName: string) => void;
  onClear: () => void;
}

function waLink(phone?: string, message?: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '#';
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

const personalize = (template: string, lead: BulkLead) =>
  template
    .replace(/\{customer_name\}/g, lead.name || 'customer')
    .replace(/\{phone\}/g, lead.phone || '');

export default function BulkActionBar({
  selectedCount,
  selectedLeads,
  onDelete,
  onAssign,
  onAssignTeam,
  onClear,
}: BulkActionBarProps) {
  const [open, setOpen] = useState<'none' | 'whatsapp' | 'assign' | 'team'>('none');
  const [composer, setComposer] = useState<'none' | 'email' | 'sms'>('none');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [waMessage, setWaMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ sent: number; failed: number } | null>(null);

  const withPhone = selectedLeads.filter((l) => l.phone);
  const withEmail = selectedLeads.filter((l) => l.email);
  const withSms = selectedLeads.filter((l) => l.phone);

  useEffect(() => {
    if (open !== 'assign' || users.length > 0) return;
    setLoadingUsers(true);
    teamsService
      .getAssignableUsers()
      .then((data) => setUsers(data as AssignableUser[]))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open, users.length]);

  useEffect(() => {
    if (open !== 'team' || teams.length > 0) return;
    setLoadingTeams(true);
    teamsService
      .getAll()
      .then((data) => setTeams(data as TeamOption[]))
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [open, teams.length]);

  const openAllWhatsApp = () => {
    const msg = waMessage.trim();
    withPhone.forEach((l, i) => {
      setTimeout(() => window.open(waLink(l.phone, msg), '_blank'), i * 400);
    });
  };

  const handleSend = async () => {
    const isEmail = composer === 'email';
    const targets = isEmail ? withEmail : withSms;
    const template = message.trim();
    if (!template) {
      toast.error('Message is required');
      return;
    }
    if (isEmail && !subject.trim()) {
      toast.error('Subject is required for emails');
      return;
    }
    setSending(true);
    setResults(null);
    let sent = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const lead of targets) {
      const body = personalize(template, lead);
      try {
        if (isEmail) {
          await messageLogsService.sendEmail({
            to: lead.email!,
            name: lead.name,
            subject: subject.trim(),
            html: body.replace(/\n/g, '<br/>'),
            entityType: 'lead',
            entityId: lead.id,
          });
        } else {
          await messageLogsService.sendSms({
            to: lead.phone!,
            name: lead.name,
            message: body,
            entityType: 'lead',
            entityId: lead.id,
          });
        }
        sent += 1;
      } catch (err: any) {
        failed += 1;
        if (failures.length < 3) failures.push(`${lead.name || lead.phone}: ${err?.message || 'failed'}`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    setSending(false);
    setResults({ sent, failed });
    if (failed === 0) {
      toast.success(`${sent} ${isEmail ? 'email' : 'SMS'}${sent === 1 ? '' : 's'} sent`);
      setComposer('none');
      setSubject('');
      setMessage('');
    } else {
      toast.error(`${sent} sent, ${failed} failed — ${failures.join(' · ')}`);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 slide-up-enter">
        <div className="bg-foreground text-background rounded-2xl shadow-modal px-5 py-3 flex items-center gap-4 min-w-[380px] max-w-[94vw] overflow-x-auto">
          <span className="text-sm font-semibold flex-shrink-0">
            {selectedCount} lead{selectedCount !== 1 ? 's' : ''} selected
          </span>

          <div className="h-4 w-px bg-background/20 flex-shrink-0" />

          {/* WhatsApp bulk */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setOpen((o) => (o === 'whatsapp' ? 'none' : 'whatsapp'))}
              disabled={withPhone.length === 0}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200 transition-colors disabled:opacity-40"
              title={
                withPhone.length === 0
                  ? 'No selected lead has a phone number'
                  : `Open WhatsApp for ${withPhone.length} leads`
              }
            >
              <MessageCircle size={15} />
              WhatsApp
              {withPhone.length > 0 && <ChevronDown size={13} />}
            </button>
            {open === 'whatsapp' && withPhone.length > 0 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen('none')} />
                <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-modal min-w-[340px] max-h-[80vh] overflow-y-auto py-1 z-50 fade-in">
                  <div className="px-3 pt-3 pb-2 border-b border-border">
                    <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                      <Send size={11} />
                      Forward message to all {withPhone.length} leads
                    </p>
                    <textarea
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      placeholder="Type a message to forward… (optional — leave blank to open blank chats)"
                      rows={3}
                      className="w-full border border-input bg-background text-foreground text-xs rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                  <div className="px-3 py-2 border-b border-border sticky top-0 bg-card">
                    <button
                      onClick={openAllWhatsApp}
                      className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors"
                    >
                      <ExternalLink size={13} />
                      {waMessage.trim()
                        ? `Send message to all (${withPhone.length}) — one tab per lead`
                        : `Open all (${withPhone.length}) — one tab per lead`}
                    </button>
                    <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                      Your browser may ask to allow multiple tabs.
                    </p>
                  </div>
                  {withPhone.map((l) => (
                    <a
                      key={l.id}
                      href={waLink(l.phone, waMessage.trim())}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <MessageCircle size={13} className="text-emerald-600 flex-shrink-0" />
                      <span className="truncate min-w-0">{l.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {l.phone}
                      </span>
                      <ExternalLink size={11} className="text-muted-foreground/50 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-background/20 flex-shrink-0" />

          {/* Assign user */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setOpen((o) => (o === 'assign' ? 'none' : 'assign'))}
              className="flex items-center gap-1.5 text-sm font-medium text-background/80 hover:text-background transition-colors"
            >
              <UserCheck size={15} />
              Assign
              <ChevronDown size={13} />
            </button>
            {open === 'assign' && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen('none')} />
                <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-2xl min-w-[200px] max-h-56 overflow-y-auto py-1 z-50 fade-in">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </div>
                  ) : users.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No assignable users</p>
                  ) : (
                    users.map((u) => (
                      <button
                        key={`bulk-user-${u.id}`}
                        onClick={() => {
                          onAssign(u.id, u.name);
                          setOpen('none');
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        {u.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Assign team */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setOpen((o) => (o === 'team' ? 'none' : 'team'))}
              className="flex items-center gap-1.5 text-sm font-medium text-background/80 hover:text-background transition-colors"
            >
              <Users size={15} />
              Team
              <ChevronDown size={13} />
            </button>
            {open === 'team' && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen('none')} />
                <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-2xl min-w-[200px] max-h-56 overflow-y-auto py-1 z-50 fade-in">
                  {loadingTeams ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </div>
                  ) : teams.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No teams yet</p>
                  ) : (
                    teams.map((t) => (
                      <button
                        key={`bulk-team-${t.id}`}
                        onClick={() => {
                          onAssignTeam(t.name);
                          setOpen('none');
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        {t.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-background/20 flex-shrink-0" />

          {/* Bulk email / SMS */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => {
                setComposer('email');
                setOpen('none');
              }}
              disabled={withEmail.length === 0}
              className="flex items-center gap-1.5 text-sm font-medium text-background/80 hover:text-background transition-colors disabled:opacity-40"
              title={withEmail.length === 0 ? 'No selected lead has an email' : `Email ${withEmail.length} leads`}
            >
              <Mail size={15} />
              <span className="hidden md:inline">Email</span>
            </button>
            <button
              onClick={() => {
                setComposer('sms');
                setOpen('none');
              }}
              disabled={withSms.length === 0}
              className="flex items-center gap-1.5 text-sm font-medium text-background/80 hover:text-background transition-colors disabled:opacity-40"
              title={withSms.length === 0 ? 'No selected lead has a phone' : `SMS ${withSms.length} leads`}
            >
              <Smartphone size={15} />
              <span className="hidden md:inline">SMS</span>
            </button>
          </div>

          <div className="h-4 w-px bg-background/20 flex-shrink-0" />

          {/* Delete */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
            >
              <Trash2 size={15} />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-red-400">Confirm delete?</span>
              <button
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
                className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg font-semibold hover:bg-red-400 transition-colors"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-background/60 hover:text-background transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-background/20 flex-shrink-0" />

          {/* Clear */}
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-sm text-background/60 hover:text-background transition-colors flex-shrink-0"
            aria-label="Clear selection"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Bulk email/SMS composer */}
      {composer !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setComposer('none')} />
          <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-lg fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  {composer === 'email' ? <Mail size={17} /> : <Smartphone size={17} />}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Bulk {composer === 'email' ? 'Email' : 'SMS'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {composer === 'email'
                      ? `${withEmail.length} recipient${withEmail.length === 1 ? '' : 's'} with an email address`
                      : `${withSms.length} recipient${withSms.length === 1 ? '' : 's'} with a phone number`}
                  </p>
                </div>
              </div>
              <button onClick={() => setComposer('none')} className="btn-ghost p-1.5 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {composer === 'email' && (
                <div>
                  <label className="label-base">Subject</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="input-base w-full"
                    placeholder="Exciting new offers at our latest project"
                  />
                </div>
              )}
              <div>
                <label className="label-base">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="input-base w-full resize-none"
                  placeholder={
                    composer === 'email'
                      ? 'Hello {customer_name}, we have great news…'
                      : 'Hi {customer_name}, visit our new project today!'
                  }
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Available tokens: <code className="bg-muted px-1 py-0.5 rounded">{'{customer_name}'}</code>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">{'{phone}'}</code> — replaced per lead.
                </p>
              </div>

              {results && (
                <div
                  className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 ${
                    results.failed === 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {results.failed === 0 ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <XCircle size={15} />
                  )}
                  {results.sent} sent, {results.failed} failed
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setComposer('none')} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="btn-primary flex items-center gap-2"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sending
                    ? 'Sending…'
                    : `Send ${composer === 'email' ? withEmail.length : withSms.length} message${withSms.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

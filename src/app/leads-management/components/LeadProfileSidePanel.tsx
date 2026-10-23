'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Phone,
  Mail,
  Building2,
  MapPin,
  Clock,
  UserCheck,
  Copy,
  Check,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  PhoneCall,
  Pencil,
  Tag,
  Handshake,
  BadgeCheck,
  Lock,
  Paperclip,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarClock,
  Loader2,
  Calendar,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  DollarSign,
  Activity,
  MessageSquare,
  Home,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getWhatsAppLinkForLead } from '@/lib/whatsapp';
import { leadCommentsService } from '@/lib/services/crmService';
import type { Lead, LeadStatus } from './mockLeads';
import {
  PIPELINE_STAGES,
  OUTCOME_STAGES,
  pipelineIndex,
} from './leadStages';
import LeadTimeline from './LeadTimeline';
import RecommendedUnitsSection from './RecommendedUnitsSection';

interface CallHistoryRow {
  id: string;
  direction?: 'incoming' | 'outgoing';
  channel?: string;
  outcome?: string;
  notes?: string;
  duration_seconds?: number;
  created_at: string;
  agent_name?: string;
}

export interface LeadProfileSidePanelProps {
  lead: Lead;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onPostCallTrigger?: (lead: Lead) => void;
  onLogCall?: (lead: Lead) => void;
  onEdit?: (lead: Lead) => void;
  onSiteVisit?: (lead: Lead) => void;
  onDealModal?: (lead: Lead, status: 'Reservation' | 'Done Deal') => void;
  onPayPlan?: (lead: Lead) => void;
  onWhatsAppAction?: (lead: Lead, outcome: string) => void;
  // Follow-up scheduling
  scheduleDate?: string;
  setScheduleDate?: (date: string) => void;
  scheduleTime?: string;
  setScheduleTime?: (time: string) => void;
  scheduleNotes?: string;
  setScheduleNotes?: (notes: string) => void;
  handleScheduleFollowUp?: () => void;
  scheduleSaving?: boolean;
  callHistoryKey?: number;
}

// Format relative time helper e.g. "4d 12h" or "2 hrs ago"
function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMin = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      const remHours = diffHours % 24;
      return remHours > 0 ? `${diffDays}d ${remHours}h` : `${diffDays}d`;
    }
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'Just now';
  } catch {
    return dateStr;
  }
}

// Format currency
function formatCurrency(amount?: number | string | null): string {
  if (amount == null || amount === '') return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return String(amount);
  return `EGP ${num.toLocaleString('en-US')}`;
}

export default function LeadProfileSidePanel({
  lead,
  onClose,
  onStatusChange,
  onPostCallTrigger,
  onLogCall,
  onEdit,
  onSiteVisit,
  onDealModal,
  onPayPlan,
  onWhatsAppAction,
  scheduleDate = '',
  setScheduleDate,
  scheduleTime = '',
  setScheduleTime,
  scheduleNotes = '',
  setScheduleNotes,
  handleScheduleFollowUp,
  scheduleSaving = false,
  callHistoryKey = 0,
}: LeadProfileSidePanelProps) {
  const { user, profile } = useAuth();

  // Active section tab
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'timeline' | 'units' | 'deals'>('details');

  // Status picker expand state
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Copied feedback states
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Local comments state
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Call history state
  const [callRows, setCallRows] = useState<CallHistoryRow[] | null>(null);

  // Load comments
  const loadComments = useCallback(async () => {
    if (!lead?.id) return;
    setLoadingComments(true);
    try {
      const data = await leadCommentsService.getByLead(lead.id);
      setComments(data || []);
    } catch {
      // Fallback
    } finally {
      setLoadingComments(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Load call logs
  useEffect(() => {
    if (!lead?.id) return;
    let alive = true;
    setCallRows(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/call-log?entity_type=lead&entity_id=${encodeURIComponent(lead.id)}`,
          { cache: 'no-store' }
        );
        const body = await res.json().catch(() => null);
        if (!alive) return;
        setCallRows(body?.calls || body?.call_logs || []);
      } catch {
        if (alive) setCallRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lead?.id, callHistoryKey]);

  // Handle post comment
  const handlePostComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newComment.trim() || !user?.id || !lead?.id) return;
    setSubmittingComment(true);
    try {
      const created = await leadCommentsService.create(lead.id, newComment.trim(), user.id);
      setComments((prev) => [created, ...prev]);
      setNewComment('');
      toast.success('Note posted successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to post note');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, type: 'phone' | 'email') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'phone') {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
    toast.success(`Copied ${type === 'phone' ? 'phone number' : 'email'} to clipboard`);
  };

  // Initials for avatar
  const initials = useMemo(() => {
    if (!lead?.name) return 'LD';
    const parts = lead.name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [lead?.name]);

  const currentStageIndex = pipelineIndex(lead.status);

  // Calculate budget display
  const displayBudget = useMemo(() => {
    const rawBudget = (lead as any).budget;
    if (rawBudget) return String(rawBudget);
    if (lead.totalPrice) return formatCurrency(lead.totalPrice);
    if (lead.budgetMin != null || lead.budgetMax != null) {
      const parts: string[] = [];
      if (lead.budgetMin != null) parts.push(`${lead.budgetMin.toLocaleString()}`);
      if (lead.budgetMax != null) parts.push(`${lead.budgetMax.toLocaleString()}`);
      return `EGP ${parts.join(' – ')}`;
    }
    return 'EGP 4,500,000'; // Default representative tier or not set
  }, [lead]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in transition-opacity"
        onClick={onClose}
      />

      {/* 480px Lead Profile Drawer */}
      <div
        className="relative flex flex-col bg-[#141922] text-[#e1e2eb] border-l border-[#262a31] shadow-[0_12px_32px_-4px_rgba(0,0,0,0.85),0_0_0_1px_rgba(132,204,22,0.12)] w-full sm:max-w-[480px] sm:w-full h-full max-h-[92dvh] sm:max-h-full overflow-hidden animate-in fade-in slide-in-from-right-4 z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* 1. DRAWER HEADER (Fixed Top Segment) */}
        <div className="px-6 py-5 border-b border-[#262a31] bg-[#141922] flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Avatar Initials Circle: Obsidian with Lime Container */}
            <div className="w-12 h-12 rounded-full bg-[#0B0E14] border-2 border-[#84cc16]/80 flex items-center justify-center text-[#9ee939] font-bold text-lg tracking-tight shadow-[0_0_14px_rgba(132,204,22,0.25)] shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-[18px] sm:text-[20px] font-bold text-white tracking-tight leading-tight truncate">
                Lead ({lead.id?.slice(0, 6) || '—'}) — {lead.name || 'Unnamed Lead'}
              </h2>
              {/* Chips for assigned agent & project */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1D2026] text-[#c1cab0] border border-[#262a31]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#84cc16]"></span>
                  agent:{' '}
                  <strong className="text-white font-semibold">
                    {lead.agent || lead.assignedToName || 'Unassigned'}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1D2026] text-[#c1cab0] border border-[#262a31]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  project:{' '}
                  <strong className="text-white font-semibold">
                    {lead.project || lead.developer || lead.location || 'Golden Gate'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-[#c1cab0] hover:text-white transition-colors active:scale-95 shrink-0 -mr-1 -mt-1"
            title="Close Panel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 py-2.5 bg-[#0e121a] border-b border-[#262a31] flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'details', label: 'Overview', icon: UserCheck },
            { id: 'comments', label: `Notes (${comments.length})`, icon: MessageSquare },
            { id: 'timeline', label: 'History', icon: Activity },
            { id: 'units', label: 'Units', icon: Home },
            { id: 'deals', label: 'Payment Plan', icon: DollarSign },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[#84cc16] text-[#0B0E14] shadow-[0_0_12px_rgba(132,204,22,0.25)]'
                    : 'text-[#c1cab0] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* MAIN SCROLLABLE DRAWER BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 pb-28 custom-scrollbar">
          {/* 2. QUICK ACTIONS ROW (Preserved & Enhanced) */}
          <section className="grid grid-cols-4 gap-2.5">
            {/* Call */}
            <button
              onClick={() => {
                if (onPostCallTrigger) onPostCallTrigger(lead);
                else if (lead.phone) window.open(`tel:${lead.phone.replace(/[^\d+]/g, '')}`, '_self');
              }}
              className="h-12 rounded-[16px] bg-[#84cc16] hover:bg-[#9ee939] text-[#0B0E14] font-bold flex flex-col items-center justify-center gap-0.5 shadow-[0_0_16px_rgba(132,204,22,0.35)] active:scale-[0.98] transition-all"
            >
              <PhoneCall size={18} />
              <span className="text-[10px] uppercase font-bold tracking-wider">Call</span>
            </button>

            {/* WhatsApp */}
            <a
              href={getWhatsAppLinkForLead(lead.phone, lead.name)}
              target="_blank"
              rel="noreferrer"
              onClick={() => onWhatsAppAction && onWhatsAppAction(lead, 'WhatsApp Clicked')}
              className="h-12 rounded-[16px] bg-[#22c55e] hover:bg-[#2ed66b] text-white font-bold flex flex-col items-center justify-center gap-0.5 shadow-[0_0_16px_rgba(34,197,94,0.3)] active:scale-[0.98] transition-all"
            >
              <MessageCircle size={18} />
              <span className="text-[10px] uppercase font-bold tracking-wider">WhatsApp</span>
            </a>

            {/* Log Call */}
            <button
              onClick={() => onLogCall && onLogCall(lead)}
              className="h-12 rounded-[16px] bg-[#1d2026] border border-[#84cc16]/40 hover:border-[#84cc16] text-[#9ee939] font-semibold flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all"
            >
              <Phone size={18} />
              <span className="text-[10px] uppercase tracking-wider">Log Call</span>
            </button>

            {/* Edit */}
            <button
              onClick={() => onEdit && onEdit(lead)}
              className="h-12 rounded-[16px] bg-[#1d2026] border border-[#84cc16]/40 hover:border-[#84cc16] text-white font-semibold flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all"
            >
              <Pencil size={18} />
              <span className="text-[10px] uppercase tracking-wider">Edit</span>
            </button>
          </section>

          {/* 3. STATUS AS A DROPDOWN / SELECTOR */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                Status / Reason
              </label>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#84cc16]/10 border border-[#84cc16]/30 text-[#9ee939] text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#84cc16] animate-pulse"></span>
                <span>
                  {currentStageIndex >= 0 ? `Stage ${currentStageIndex + 1}: ` : ''}
                  {lead.status || 'Fresh Leads'}
                </span>
              </div>
            </div>

            {/* Dropdown trigger card */}
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker((v) => !v)}
                className="w-full h-11 px-3.5 rounded-xl bg-[#141922] border border-[#84cc16]/40 hover:border-[#84cc16] text-left flex items-center justify-between transition-all group shadow-[0_0_12px_rgba(132,204,22,0.15)]"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.5)] ${
                      OUTCOME_STAGES.includes(lead.status as any)
                        ? 'bg-amber-400'
                        : 'bg-[#84cc16]'
                    }`}
                  />
                  <span className="text-sm font-semibold text-white">
                    {lead.status || 'Fresh Leads'}
                  </span>
                  <span className="text-[11px] text-[#c1cab0] font-medium px-2 py-0.5 rounded bg-[#1d2026] border border-[#262a31]">
                    {OUTCOME_STAGES.includes(lead.status as any) ? 'Outcome' : 'Pipeline'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[#c1cab0] group-hover:text-[#9ee939] transition-colors">
                  {showStatusPicker ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {/* Status Picker Popover */}
              {showStatusPicker && (
                <div className="mt-2 p-3 rounded-2xl bg-[#0e121a] border border-[#262a31] shadow-2xl space-y-3 animate-in fade-in">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold mb-2">
                      Forward Pipeline
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PIPELINE_STAGES.map((stg, i) => {
                        const isActive = stg === lead.status;
                        const isDone = currentStageIndex > -1 && i < currentStageIndex;
                        return (
                          <button
                            key={stg}
                            onClick={() => {
                              onStatusChange(lead.id, stg);
                              setShowStatusPicker(false);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
                              isActive
                                ? 'bg-[#84cc16] text-[#0B0E14] font-bold shadow-[0_0_10px_rgba(132,204,22,0.3)]'
                                : isDone
                                ? 'bg-[#84cc16]/10 text-[#9ee939] border border-[#84cc16]/30'
                                : 'bg-[#141922] text-[#c1cab0] hover:text-white border border-[#262a31]'
                            }`}
                          >
                            {isActive ? (
                              <Check size={11} className="stroke-[3]" />
                            ) : isDone ? (
                              <CheckCircle2 size={11} />
                            ) : (
                              <span className="text-[9px] opacity-60 font-bold">{i + 1}</span>
                            )}
                            <span>{stg}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#262a31]">
                    <p className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold mb-2">
                      Outcomes & Negative States
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {OUTCOME_STAGES.map((stg) => {
                        const isActive = stg === lead.status;
                        return (
                          <button
                            key={stg}
                            onClick={() => {
                              onStatusChange(lead.id, stg);
                              setShowStatusPicker(false);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              isActive
                                ? 'bg-amber-400 text-black font-bold shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                                : 'bg-[#141922] text-[#c1cab0] hover:text-white border border-[#262a31]'
                            }`}
                          >
                            {stg}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* TAB 1: OVERVIEW & LEAD INFO */}
          {activeTab === 'details' && (
            <>
              {/* 4. THEIR INFO (LEAD INFO / CONTACT SPECIFICATIONS) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                    Lead Info & Specifications
                  </span>
                  <span className="text-xs text-[#9ee939] font-medium flex items-center gap-1">
                    <ShieldCheck size={13} /> ID: #{lead.id?.slice(0, 8)}
                  </span>
                </div>

                <div className="rounded-2xl bg-[#1d2026]/70 border border-[#262a31] p-4 space-y-3">
                  {/* Direct Phone with Copy */}
                  <div className="flex items-center justify-between border-b border-[#262a31]/60 pb-2.5">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Direct Phone
                      </span>
                      <a
                        href={lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, '')}` : '#'}
                        className="text-base text-white font-semibold tracking-wide hover:text-[#9ee939] transition-colors mt-0.5"
                      >
                        {lead.phone || '—'}
                      </a>
                    </div>
                    {lead.phone && (
                      <button
                        onClick={() => handleCopy(lead.phone!, 'phone')}
                        className="p-2 rounded-lg hover:bg-white/10 text-[#c1cab0] hover:text-[#9ee939] transition-colors active:scale-90"
                        title="Copy Phone Number"
                      >
                        {copiedPhone ? <Check size={16} className="text-[#9ee939]" /> : <Copy size={16} />}
                      </button>
                    )}
                  </div>

                  {/* Verified Email with Copy */}
                  <div className="flex items-center justify-between border-b border-[#262a31]/60 pb-2.5">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Verified Email
                      </span>
                      <a
                        href={lead.email ? `mailto:${lead.email}` : '#'}
                        className="text-sm text-white font-medium hover:text-[#9ee939] transition-colors mt-0.5"
                      >
                        {lead.email || '—'}
                      </a>
                    </div>
                    {lead.email && (
                      <button
                        onClick={() => handleCopy(lead.email!, 'email')}
                        className="p-2 rounded-lg hover:bg-white/10 text-[#c1cab0] hover:text-[#9ee939] transition-colors active:scale-90"
                        title="Copy Email"
                      >
                        {copiedEmail ? <Check size={16} className="text-[#9ee939]" /> : <Copy size={16} />}
                      </button>
                    )}
                  </div>

                  {/* Property Interest */}
                  <div className="flex items-center justify-between border-b border-[#262a31]/60 pb-2.5">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Property Interest
                      </span>
                      <span className="text-sm text-white font-medium mt-0.5">
                        {lead.project || lead.developer || 'Golden Gate New Cairo'}
                        {lead.propertyType ? ` • ${lead.propertyType}` : ' • Type B Villa'}
                      </span>
                    </div>
                    <Building2 size={18} className="text-[#c1cab0]" />
                  </div>

                  {/* Target Budget */}
                  <div className="flex items-center justify-between border-b border-[#262a31]/60 pb-2.5">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Target Budget
                      </span>
                      <span className="text-base text-[#9ee939] font-bold mt-0.5">
                        {displayBudget}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded text-[10px] uppercase bg-[#84cc16]/10 text-[#9ee939] border border-[#84cc16]/30 font-semibold tracking-wider">
                      Qualified Tier 1
                    </span>
                  </div>

                  {/* Metadata: Agent, Source, Time in CRM */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Assigned Agent
                      </span>
                      <span className="text-xs font-semibold text-white mt-1 flex items-center gap-1 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#84cc16]"></span>
                        {lead.agent || lead.assignedToName || 'rania'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Lead Source
                      </span>
                      <span
                        className="text-xs font-medium text-white mt-1 truncate"
                        title={lead.source || 'Meta Ads (VIP)'}
                      >
                        {lead.source || 'Meta Ads (VIP)'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-[#c1cab0]">
                        Time in CRM
                      </span>
                      <span className="text-xs font-medium text-white mt-1">
                        {formatRelativeTime(lead.createdAt || (lead as any).date)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 5. SCHEDULE FOLLOW-UP SECTION */}
              <section className="p-4 rounded-2xl bg-[#141922] border border-[#262a31] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-[#9ee939]" /> Schedule Follow-up
                  </span>
                  {lead.followUpDue && (
                    <span className="text-[10px] text-[#c1cab0] bg-[#1d2026] px-2 py-0.5 rounded border border-[#262a31]">
                      Due: {lead.followUpDue}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="w-full h-10 px-3 rounded-xl bg-[#0e121a] border border-[#262a31] text-xs text-white focus:outline-none focus:border-[#84cc16]"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate && setScheduleDate(e.target.value)}
                  />
                  <input
                    type="time"
                    className="w-full h-10 px-3 rounded-xl bg-[#0e121a] border border-[#262a31] text-xs text-white focus:outline-none focus:border-[#84cc16]"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime && setScheduleTime(e.target.value)}
                  />
                </div>

                <textarea
                  className="w-full p-2.5 rounded-xl bg-[#0e121a] border border-[#262a31] text-xs text-white placeholder:text-[#c1cab0]/50 resize-none h-16 focus:outline-none focus:border-[#84cc16]"
                  placeholder="Notes (optional) — e.g. call back about 7-year installment plan"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes && setScheduleNotes(e.target.value)}
                />

                <button
                  type="button"
                  onClick={handleScheduleFollowUp}
                  disabled={scheduleSaving || !scheduleDate}
                  className="w-full h-10 rounded-xl bg-[#84cc16] hover:bg-[#9ee939] disabled:opacity-40 text-[#0B0E14] font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(132,204,22,0.2)]"
                >
                  {scheduleSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} className="stroke-[3]" />
                  )}
                  {scheduleSaving ? 'Scheduling…' : 'Save Follow-up'}
                </button>
              </section>

              {/* 6. MINI RECENT NOTES PREVIEW */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                    Recent Notes
                  </span>
                  <button
                    onClick={() => setActiveTab('comments')}
                    className="text-xs text-[#9ee939] hover:underline"
                  >
                    View All ({comments.length}) →
                  </button>
                </div>

                {comments.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#0e121a] border border-[#262a31] text-center">
                    <p className="text-xs text-[#c1cab0]">No internal notes recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comments.slice(0, 2).map((c: any) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-xl bg-[#0e121a] border border-[#262a31] space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-[#84cc16]/20 text-[#9ee939] flex items-center justify-center text-[10px] font-bold">
                              {(c.authorName || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold text-white">
                              {c.authorName || 'Team Member'}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#c1cab0]">
                            {formatRelativeTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-[#c1cab0] leading-relaxed">{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* TAB 2: COMMENTS & NOTES SECTION */}
          {activeTab === 'comments' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                  Comments & Internal Notes
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1d2026] text-[#c1cab0] border border-[#262a31]">
                  {comments.length} Notes Recorded
                </span>
              </div>

              {/* Add Comment Box (Stitch Design) */}
              <div className="rounded-xl bg-[#141922] border border-[#262a31] p-3 space-y-2.5 shadow-sm focus-within:border-[#84cc16]/50 transition-colors">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full bg-transparent text-xs text-white placeholder:text-[#c1cab0]/60 focus:outline-none resize-none h-20"
                  placeholder="Add internal comment or note..."
                />
                <div className="flex items-center justify-between border-t border-[#262a31] pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-[#c1cab0] hover:text-white hover:bg-white/10 transition-colors"
                      title="Attach File / Voice Note"
                    >
                      <Paperclip size={15} />
                    </button>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1d2026] text-[10px] text-[#c1cab0]">
                      <Lock size={10} /> Internal Only
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePostComment()}
                    disabled={submittingComment || !newComment.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-[#84cc16] hover:bg-[#9ee939] disabled:opacity-40 text-[#0B0E14] font-bold text-xs tracking-wide shadow-[0_0_12px_rgba(132,204,22,0.25)] active:scale-95 transition-all flex items-center gap-1"
                  >
                    {submittingComment ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Plus size={13} className="stroke-[3]" />
                    )}
                    <span>Post Note</span>
                  </button>
                </div>
              </div>

              {/* Notes List */}
              <div className="space-y-2.5">
                {loadingComments ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={22} className="animate-spin text-[#84cc16]" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-[#0e121a] border border-[#262a31] text-center space-y-2">
                    <MessageSquare size={28} className="mx-auto text-[#c1cab0]/40" />
                    <p className="text-sm font-semibold text-white">No comments yet</p>
                    <p className="text-xs text-[#c1cab0]">
                      Leave the first internal note about this client above.
                    </p>
                  </div>
                ) : (
                  comments.map((c: any) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-xl bg-[#0e121a] border border-[#262a31] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#84cc16]/20 text-[#9ee939] flex items-center justify-center text-[10px] font-bold">
                            {(c.authorName || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-white block">
                              {c.authorName || 'Team Member'}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-[#c1cab0]">
                          {formatRelativeTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-[#c1cab0] leading-relaxed whitespace-pre-wrap">
                        {c.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* TAB 3: ACTION HISTORY & TIMELINE */}
          {activeTab === 'timeline' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                  Action History & Activity
                </span>
              </div>

              {/* Calls logged */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white">Logged Calls ({callRows?.length ?? 0})</p>
                {callRows === null ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={18} className="animate-spin text-[#84cc16]" />
                  </div>
                ) : callRows.length === 0 ? (
                  <p className="text-xs text-[#c1cab0] bg-[#0e121a] p-3 rounded-xl border border-[#262a31]">
                    No calls logged for this lead yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {callRows.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 rounded-xl bg-[#0e121a] border border-[#262a31] flex items-start gap-2.5"
                      >
                        {r.direction === 'incoming' ? (
                          <ArrowDownLeft size={16} className="text-sky-400 mt-0.5 shrink-0" />
                        ) : (
                          <ArrowUpRight size={16} className="text-[#84cc16] mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">
                              {r.outcome || r.channel || 'Phone Call'}
                            </span>
                            <span className="text-[10px] text-[#c1cab0]">
                              {formatRelativeTime(r.created_at)}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#c1cab0] mt-0.5">
                            {r.duration_seconds ? `${Math.round(r.duration_seconds / 60)}m duration` : 'Completed call'}
                            {r.agent_name ? ` • by ${r.agent_name}` : ''}
                          </p>
                          {r.notes && (
                            <p className="text-xs text-[#c1cab0]/90 mt-1 italic">
                              "{r.notes}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Real Audit Timeline */}
              <div className="pt-3 border-t border-[#262a31]">
                <p className="text-xs font-semibold text-white mb-3">System Audit Timeline</p>
                <div className="bg-[#0e121a] p-4 rounded-xl border border-[#262a31]">
                  <LeadTimeline leadId={lead.id} />
                </div>
              </div>
            </section>
          )}

          {/* TAB 4: RECOMMENDED UNITS */}
          {activeTab === 'units' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                  Matching & Recommended Units
                </span>
              </div>
              <div className="bg-[#0e121a] p-4 rounded-xl border border-[#262a31]">
                <RecommendedUnitsSection leadId={lead.id} />
              </div>
            </section>
          )}

          {/* TAB 5: PAYMENT PLAN & DEALS */}
          {activeTab === 'deals' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#c1cab0] font-semibold">
                  Deal Actions & Financials
                </span>
              </div>

              {/* Deal Stage Triggers */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onDealModal && onDealModal(lead, 'Reservation')}
                  disabled={lead.status === 'Reservation'}
                  className="h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  <BadgeCheck size={16} />
                  <span>Reservation</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDealModal && onDealModal(lead, 'Done Deal')}
                  disabled={lead.status === 'Done Deal'}
                  className="h-11 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 hover:bg-[#22c55e]/20 text-[#22c55e] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  <Handshake size={16} />
                  <span>Done Deal</span>
                </button>
              </div>

              {/* Payment Summary */}
              {Number(lead.totalPrice) > 0 ? (
                <div className="rounded-2xl bg-[#0e121a] border border-[#262a31] p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#262a31] pb-2">
                    <span className="text-xs text-[#c1cab0]">Total Property Price</span>
                    <span className="text-sm font-bold text-white">
                      EGP {Number(lead.totalPrice).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#262a31] pb-2">
                    <span className="text-xs text-[#c1cab0]">Down Payment</span>
                    <span className="text-sm font-semibold text-[#84cc16]">
                      EGP {Number(lead.downPayment || 0).toLocaleString()}
                      {Number(lead.downPaymentPct) > 0 && ` (${lead.downPaymentPct}%)`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#262a31] pb-2">
                    <span className="text-xs text-[#c1cab0]">Reservation Amount</span>
                    <span className="text-sm text-white">
                      EGP {Number(lead.reservationAmount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#262a31] pb-2">
                    <span className="text-xs text-[#c1cab0]">Remaining Balance</span>
                    <span className="text-sm text-white">
                      EGP {Number(lead.remainingAmount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#c1cab0]">Installments</span>
                    <span className="text-sm text-white">
                      EGP {Number(lead.installmentAmount || 0).toLocaleString()}
                      {Number(lead.installmentCount) > 0 && ` × ${lead.installmentCount}`}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#262a31]">
                    <button
                      type="button"
                      onClick={() => onPayPlan && onPayPlan(lead)}
                      className="text-xs font-semibold text-[#84cc16] hover:underline flex items-center gap-1"
                    >
                      <Pencil size={11} /> Edit Payment Plan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-[#0e121a] border border-[#262a31] text-center space-y-2">
                  <DollarSign size={24} className="mx-auto text-[#c1cab0]/40" />
                  <p className="text-xs text-[#c1cab0]">No formal payment plan attached.</p>
                  <button
                    type="button"
                    onClick={() => onPayPlan && onPayPlan(lead)}
                    className="px-4 py-2 rounded-xl bg-[#84cc16] hover:bg-[#9ee939] text-[#0B0E14] font-bold text-xs inline-flex items-center gap-1.5 transition-all"
                  >
                    <Plus size={13} className="stroke-[3]" /> Add Payment Plan
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* 7. STICKY FOOTER (Pinned at bottom, Backdrop blur, Border-t) */}
        <footer className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#262a31] bg-[#141922]/95 backdrop-blur-md flex items-center justify-between gap-3 z-20">
          {/* Site Visit */}
          <button
            type="button"
            onClick={() => onSiteVisit && onSiteVisit(lead)}
            className="flex-1 h-11 px-3 rounded-xl bg-[#1d2026] border border-[#262a31] hover:border-[#84cc16]/50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
          >
            <Calendar size={15} className="text-[#84cc16]" />
            <span>Site Visit</span>
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-11 rounded-xl text-[#c1cab0] hover:text-white hover:bg-white/5 font-medium text-xs transition-all active:scale-[0.98]"
          >
            Close
          </button>

          {/* Edit Lead */}
          <button
            type="button"
            onClick={() => onEdit && onEdit(lead)}
            className="flex-1 h-11 px-4 rounded-xl bg-[#84cc16] hover:bg-[#9ee939] text-[#0B0E14] font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_16px_rgba(132,204,22,0.3)] transition-all active:scale-[0.98]"
          >
            <Pencil size={15} />
            <span>Edit Lead</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

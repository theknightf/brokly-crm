'use client';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Phone, MessageCircle, Pencil, MapPin, Building2, Trash2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { Lead, LeadStatus } from './mockLeads';
import { PIPELINE_STAGES, nextPipelineStage, prevPipelineStage, pipelineIndex } from './leadStages';
import { isAdminRole } from '@/lib/roles';

interface LeadBoardProps {
  leads: Lead[];
  onView: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onDelete: (id: string) => void;
  isAdmin?: boolean;
}

const formatBudget = (min?: number, max?: number) => {
  if (min == null && max == null) return '—';
  const parts: string[] = [];
  if (min != null) parts.push(`${min.toLocaleString()}L`);
  if (max != null) parts.push(`${max.toLocaleString()}L`);
  return `₹${parts.join('–')}`;
};

function BoardCard({
  lead,
  onView,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  lead: Lead;
  onView: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onDelete: (id: string) => void;
}) {
  const inPipeline = pipelineIndex(lead.status) >= 0;
  const prev = inPipeline ? prevPipelineStage(lead.status) : undefined;
  const next = inPipeline ? nextPipelineStage(lead.status) : 'Fresh Leads';
  const initials = (lead.name || lead.id)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      onClick={() => onView(lead)}
      className="group bg-card border border-border rounded-2xl p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground text-sm truncate">{lead.name || 'Lead'}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(lead);
          }}
          className="w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Edit lead"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(lead.id);
          }}
          className="w-7 h-7 rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Delete lead"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {lead.location && (
          <span className="inline-flex items-center gap-0.5 truncate">
            <MapPin size={10} className="flex-shrink-0" />
            {lead.location}
          </span>
        )}
        {lead.project && (
          <span className="inline-flex items-center gap-0.5 truncate">
            <Building2 size={10} className="flex-shrink-0" />
            {lead.project}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground tabular-nums truncate">
          {formatBudget(lead.budgetMin, lead.budgetMax)}
        </span>
        {lead.source && (
          <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
            {lead.source}
          </span>
        )}
      </div>

      {lead.phone && (
        <div className="mt-2 flex items-center gap-1.5">
          <a
            href={`tel:${lead.phone.replace(/[^0-9+,]/g, '')}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center gap-1 text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            <Phone size={12} />
            Call
          </a>
          <a
            href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center gap-1 text-xs font-semibold hover:bg-emerald-100 transition-colors"
          >
            <MessageCircle size={12} />
            WA
          </a>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
        <button
          disabled={!prev}
          onClick={(e) => {
            e.stopPropagation();
            if (prev) onStatusChange(lead.id, prev);
          }}
          className="w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
          aria-label="Move to previous stage"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="flex-1 text-center text-[10px] text-muted-foreground select-none">move stage</span>
        <button
          disabled={!next}
          onClick={(e) => {
            e.stopPropagation();
            if (next) onStatusChange(lead.id, next);
          }}
          className="w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
          aria-label="Move to next stage"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function LeadBoard({ leads, onView, onEdit, onStatusChange, onDelete, isAdmin = false }: LeadBoardProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingLead = leads.find((l) => l.id === deletingId) || null;
  const columns: { key: string; label: string; stage?: LeadStatus }[] = [
    ...PIPELINE_STAGES.map((s) => ({ key: s, label: s, stage: s })),
    { key: '__other__', label: 'Outcomes' },
  ];
  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
        {columns.map((col) => {
          const colLeads = col.stage
            ? leads.filter((l) => (l.status || 'Fresh Leads') === col.stage)
            : leads.filter((l) => !PIPELINE_STAGES.includes(l.status || 'Fresh Leads'));
          return (
            <div key={col.key} className="w-[272px] flex-shrink-0 flex flex-col max-h-[calc(100vh-260px)]">
              {!isAdmin && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border mb-2 sticky top-0 z-10">
                  {col.stage ? (
                    <StatusBadge status={col.stage} showDot />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="w-2.5 h-2.5 rounded-full bg-clay-soft" />
                      {col.label}
                    </span>
                  )}
                  <span className="ml-auto text-xs font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
                    {colLeads.length}
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {colLeads.length === 0 ? (
                  <div className="border border-dashed border-border rounded-2xl py-10 text-center text-xs text-muted-foreground">
                    Drop leads here
                  )
                ) : (
                  colLeads.map((lead, i) => (
                    <div key={lead.id} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                      <BoardCard lead={lead} onView={onView} onEdit={onEdit} onStatusChange={onStatusChange} onDelete={setDeletingId} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {deletingLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => setDeletingId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground">Delete lead?</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{deletingLead.name || 'this lead'}</span>? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeletingId(null)} className="h-9 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = deletingLead.id;
                  setDeletingId(null);
                  onDelete(id);
                }}
                className="h-9 px-4 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

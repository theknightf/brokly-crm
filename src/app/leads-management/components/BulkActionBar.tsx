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
} from 'lucide-react';
import { teamsService } from '@/lib/services/crmService';

interface AssignableUser {
  id: string;
  name: string;
}

export interface BulkLead {
  id: string;
  name?: string;
  phone?: string;
}

interface BulkActionBarProps {
  selectedCount: number;
  selectedLeads: BulkLead[];
  onDelete: () => void;
  onAssign: (userId: string, userName: string) => void;
  onClear: () => void;
}

function waLink(phone?: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}`;
}

export default function BulkActionBar({
  selectedCount,
  selectedLeads,
  onDelete,
  onAssign,
  onClear,
}: BulkActionBarProps) {
  const [open, setOpen] = useState<'none' | 'whatsapp' | 'assign'>('none');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const withPhone = selectedLeads.filter((l) => l.phone);

  useEffect(() => {
    if (open !== 'assign' || users.length > 0) return;
    setLoadingUsers(true);
    teamsService
      .getAssignableUsers()
      .then((data) => setUsers(data as AssignableUser[]))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open, users.length]);

  const openAllWhatsApp = () => {
    withPhone.forEach((l, i) => {
      setTimeout(() => window.open(waLink(l.phone), '_blank'), i * 400);
    });
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 slide-up-enter">
      <div className="bg-foreground text-background rounded-2xl shadow-modal px-5 py-3 flex items-center gap-4 min-w-[380px] max-w-[94vw]">
        <span className="text-sm font-semibold flex-shrink-0">
          {selectedCount} lead{selectedCount !== 1 ? 's' : ''} selected
        </span>

        <div className="h-4 w-px bg-background/20 flex-shrink-0" />

        {/* WhatsApp bulk */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => (o === 'whatsapp' ? 'none' : 'whatsapp'))}
            disabled={withPhone.length === 0}
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200 transition-colors disabled:opacity-40 flex-shrink-0"
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
              <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-modal min-w-[300px] max-h-72 overflow-y-auto py-1 z-50 fade-in">
                <div className="px-3 py-2 border-b border-border sticky top-0 bg-card">
                  <button
                    onClick={openAllWhatsApp}
                    className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors"
                  >
                    <ExternalLink size={13} />
                    Open all ({withPhone.length}) — one tab per lead
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                    Your browser may ask to allow multiple tabs.
                  </p>
                </div>
                {withPhone.map((l) => (
                  <a
                    key={l.id}
                    href={waLink(l.phone)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <MessageCircle size={13} className="text-emerald-600 flex-shrink-0" />
                    <span className="truncate min-w-0">{l.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {l.phone}
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="h-4 w-px bg-background/20 flex-shrink-0" />

        {/* Assign user */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => (o === 'assign' ? 'none' : 'assign'))}
            className="flex items-center gap-1.5 text-sm font-medium text-background/80 hover:text-background transition-colors"
          >
            <UserCheck size={15} />
            Assign User
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

        <div className="h-4 w-px bg-background/20 flex-shrink-0" />

        {/* Delete */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 size={15} />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
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
  );
}
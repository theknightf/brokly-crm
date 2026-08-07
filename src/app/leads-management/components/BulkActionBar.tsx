'use client';
import React, { useState, useEffect } from 'react';
import { Trash2, UserCheck, X, ChevronDown, Loader2 } from 'lucide-react';
import { teamsService } from '@/lib/services/crmService';

interface AssignableUser {
  id: string;
  name: string;
}

interface BulkActionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onAssign: (userId: string, userName: string) => void;
  onClear: () => void;
}

export default function BulkActionBar({
  selectedCount,
  onDelete,
  onAssign,
  onClear,
}: BulkActionBarProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!assignOpen || users.length > 0) return;
    setLoadingUsers(true);
    teamsService
      .getAssignableUsers()
      .then((data) => setUsers(data as AssignableUser[]))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [assignOpen, users.length]);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 slide-up-enter">
      <div className="bg-foreground text-background rounded-2xl shadow-modal px-5 py-3 flex items-center gap-4 min-w-[380px]">
        <span className="text-sm font-semibold flex-shrink-0">
          {selectedCount} lead{selectedCount !== 1 ? 's' : ''} selected
        </span>

        <div className="h-4 w-px bg-background/20 flex-shrink-0" />

        {/* Assign user */}
        <div className="relative">
          <button
            onClick={() => {
              setAssignOpen((o) => !o);
              setConfirmDelete(false);
            }}
            className="flex items-center gap-1.5 text-sm font-medium text-background/80 hover:text-background transition-colors"
          >
            <UserCheck size={15} />
            Assign User
            <ChevronDown size={13} />
          </button>
          {assignOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAssignOpen(false)} />
              <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-modal min-w-[200px] max-h-56 overflow-y-auto py-1 z-50 fade-in">
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
                        setAssignOpen(false);
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

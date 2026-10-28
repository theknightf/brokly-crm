'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import type { CallItem } from '@/lib/leadWorkShared';
import CallsTab from './CallsTab';
import NotesTab from './NotesTab';
import ActionsTab from './ActionsTab';
import { useEmployeeDrawerData } from './useEmployeeDrawerData';

type TabKey = 'calls' | 'notes' | 'actions';
const TAB_STORAGE_KEY = 'brokly:emp-drawer-tab';

export interface EmployeeDrawerProps {
  open: boolean;
  onClose: () => void;
  employee: { id: string; name: string } | null;
  /** Selected report range (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Totals already shown in the report row, used for the header pills. */
  summary: { calls: number; connected: number; noAnswer: number; statusUpdates?: number };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';

function readStoredTab(): TabKey {
  try {
    const v = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (v === 'calls' || v === 'notes' || v === 'actions') return v;
  } catch {
    /* storage unavailable */
  }
  return 'calls';
}

/** Right-side drawer (left in RTL) with the employee's Calls, Notes and Actions. */
export default function EmployeeDrawer({ open, onClose, employee, from, to, summary }: EmployeeDrawerProps) {
  if (!employee) return null;
  return (
    <DrawerBody
      key={employee.id}
      open={open}
      onClose={onClose}
      employee={employee}
      from={from}
      to={to}
      summary={summary}
    />
  );
}

function DrawerBody({
  open,
  onClose,
  employee,
  from,
  to,
  summary,
}: Omit<EmployeeDrawerProps, 'employee'> & { employee: { id: string; name: string } }) {
  const { user, profile } = useAuth();
  const meId = user?.id || profile?.id || '';
  const role = String(profile?.role || '');
  const isAdmin = isAdminRole(role);
  const isManager = isAdmin || role.trim().toLowerCase() === 'manager';

  const [tab, setTab] = useState<TabKey>('calls');
  const [linkedCallId, setLinkedCallId] = useState('');
  const d = useEmployeeDrawerData(open, employee.id, from, to);

  // Remember the last active tab (read after mount so SSR output stays stable).
  useEffect(() => setTab(readStoredTab()), []);
  const selectTab = useCallback((t: TabKey) => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const startNote = (c: CallItem) => {
    setLinkedCallId(c.id);
    selectTab('notes');
  };
  const startAction = (c: CallItem) => {
    setLinkedCallId(c.id);
    selectTab('actions');
  };

  const counts: Record<TabKey, number> = {
    calls: summary.calls,
    notes: d.notes.length,
    actions: d.actions.upcoming.length + d.actions.history.length,
  };
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'calls', label: 'Calls' },
    { key: 'notes', label: 'Notes' },
    { key: 'actions', label: 'Actions' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee.name}
      subtitle={`${from} → ${to}`}
      size="lg"
      variant="drawer"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-card px-4 pb-0 pt-3 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
            aria-hidden="true"
          >
            {initials(employee.name)}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
            Calls {summary.calls}
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Connected {summary.connected}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            No answer {summary.noAnswer}
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            Status updates {summary.statusUpdates ?? 0}
          </span>
        </div>
        <div role="tablist" aria-label="Employee details" className="-mb-px flex gap-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`emp-tab-${t.key}`}
                aria-selected={active}
                aria-controls={`emp-panel-${t.key}`}
                onClick={() => selectTab(t.key)}
                className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                <span
                  className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums ${
                    active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`emp-panel-${tab}`}
        aria-labelledby={`emp-tab-${tab}`}
        className="px-4 py-4 sm:px-6"
      >
        {tab === 'calls' && (
          <CallsTab
            calls={d.calls}
            loading={d.callsLoading}
            loadingMore={d.callsLoadingMore}
            error={d.callsError}
            hasMore={!!d.callsCursor}
            resultFilter={d.resultFilter}
            dayFilter={d.dayFilter}
            onResultFilter={d.setResultFilter}
            onDayFilter={d.setDayFilter}
            onLoadMore={() => void d.loadMoreCalls()}
            onRetry={() => void d.reloadCalls()}
            onAddNote={startNote}
            onAddAction={startAction}
            rangeFrom={from}
            rangeTo={to}
          />
        )}
        {tab === 'notes' && (
          <NotesTab
            notes={d.notes}
            setNotes={d.setNotes}
            loading={d.notesLoading}
            error={d.notesError}
            onRetry={() => void d.loadNotes()}
            calls={d.calls}
            linkedCallId={linkedCallId}
            onLinkChange={setLinkedCallId}
            meId={meId}
            isAdmin={isAdmin}
          />
        )}
        {tab === 'actions' && (
          <ActionsTab
            data={d.actions}
            setData={d.setActions}
            loading={d.actionsLoading}
            error={d.actionsError}
            onRetry={() => void d.loadActions()}
            onReload={() => void d.loadActions(true)}
            calls={d.calls}
            linkedCallId={linkedCallId}
            onLinkChange={setLinkedCallId}
            employeeId={employee.id}
            employeeName={employee.name}
            meId={meId}
            isManager={isManager}
          />
        )}
      </div>
    </Modal>
  );
}

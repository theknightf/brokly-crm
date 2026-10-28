'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionItem, CallItem, CallResult, HistoryEntry, NoteItem } from '@/lib/leadWorkShared';
import { api } from './shared';

export interface ActionsData {
  upcoming: ActionItem[];
  history: HistoryEntry[];
}

/**
 * All server state of the drawer in one place so the tab badges can show counts before a tab
 * is opened, and so tabs can update the lists optimistically.
 */
export function useEmployeeDrawerData(open: boolean, employeeId: string, from: string, to: string) {
  const base = `/api/employees/${employeeId}`;
  const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  // ── calls ───────────────────────────────────────────────
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [callsCursor, setCallsCursor] = useState<string | null>(null);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsLoadingMore, setCallsLoadingMore] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<CallResult | ''>('');
  const [dayFilter, setDayFilter] = useState('');
  const callsSeq = useRef(0);

  const fetchCalls = useCallback(
    async (cursor: string | null) => {
      const seq = ++callsSeq.current;
      const rangeQs = dayFilter
        ? `from=${dayFilter}&to=${dayFilter}`
        : range;
      const qs = [rangeQs, resultFilter ? `result=${resultFilter}` : '', cursor ? `cursor=${encodeURIComponent(cursor)}` : '']
        .filter(Boolean)
        .join('&');
      if (cursor) setCallsLoadingMore(true);
      else setCallsLoading(true);
      setCallsError(null);
      try {
        const j = await api<{ calls: CallItem[]; nextCursor: string | null }>(`${base}/calls?${qs}`);
        if (seq !== callsSeq.current) return;
        setCalls((prev) => (cursor ? [...prev, ...j.calls] : j.calls));
        setCallsCursor(j.nextCursor);
      } catch (e: any) {
        if (seq === callsSeq.current) setCallsError(e?.message || 'Could not load calls');
      } finally {
        if (seq === callsSeq.current) {
          setCallsLoading(false);
          setCallsLoadingMore(false);
        }
      }
    },
    [base, range, resultFilter, dayFilter]
  );

  useEffect(() => {
    if (open) void fetchCalls(null);
  }, [open, fetchCalls]);

  // ── notes ───────────────────────────────────────────────
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const j = await api<{ notes: NoteItem[] }>(`${base}/notes?${range}`);
      setNotes(j.notes);
    } catch (e: any) {
      setNotesError(e?.message || 'Could not load notes');
    } finally {
      setNotesLoading(false);
    }
  }, [base, range]);

  // ── actions ─────────────────────────────────────────────
  const [actions, setActions] = useState<ActionsData>({ upcoming: [], history: [] });
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsError, setActionsError] = useState<string | null>(null);

  const loadActions = useCallback(
    async (silent = false) => {
      if (!silent) setActionsLoading(true);
      setActionsError(null);
      try {
        const j = await api<ActionsData>(`${base}/actions?${range}`);
        setActions(j);
      } catch (e: any) {
        setActionsError(e?.message || 'Could not load actions');
      } finally {
        setActionsLoading(false);
      }
    },
    [base, range]
  );

  useEffect(() => {
    if (!open) return;
    void loadNotes();
    void loadActions();
  }, [open, loadNotes, loadActions]);

  return {
    calls,
    callsCursor,
    callsLoading,
    callsLoadingMore,
    callsError,
    resultFilter,
    setResultFilter,
    dayFilter,
    setDayFilter,
    reloadCalls: () => fetchCalls(null),
    loadMoreCalls: () => (callsCursor ? fetchCalls(callsCursor) : Promise.resolve()),
    notes,
    setNotes,
    notesLoading,
    notesError,
    loadNotes,
    actions,
    setActions,
    actionsLoading,
    actionsError,
    loadActions,
  };
}

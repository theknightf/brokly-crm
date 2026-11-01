'use client';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { filtersToQuery, getJson } from './utils';
import type {
  AssignedData,
  CallsPage,
  FilterOptions,
  FilterState,
  Loadable,
  OverviewStats,
  SortKey,
  Timeframe,
} from './types';

const idle = <T,>(): Loadable<T> => ({ data: null, loading: true, error: null });

export type LiveStatus = 'connecting' | 'live' | 'offline';

/**
 * All server state of the Analytics dashboard. Every query is re-run when the applied filters
 * change, and again (debounced) whenever a call is written to call_logs (Supabase Realtime,
 * which respects RLS, so people only get events for calls they may see).
 */
export function useAnalyticsData(filters: FilterState, active: boolean) {
  const [frame, setFrame] = useState<Timeframe>('weekly');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'at', dir: 'desc' });
  const [search, setSearch] = useState('');

  const [overview, setOverview] = useState<Loadable<OverviewStats>>(idle());
  const [calls, setCalls] = useState<Loadable<CallsPage>>(idle());
  const [assigned, setAssigned] = useState<Loadable<AssignedData>>(idle());
  const [options, setOptions] = useState<FilterOptions>({ sources: [], channels: [], agents: [] });

  const [refreshKey, setRefreshKey] = useState(0);
  const [live, setLive] = useState<LiveStatus>('connecting');
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const filterQs = filtersToQuery(filters);
  const markSynced = () => setSyncedAt(new Date().toLocaleTimeString('en-GB'));

  // A new filter / search / sort always starts from the first page.
  useEffect(() => setPage(1), [filterQs, search, sort]);

  // Reports only load while the Analytics view is open.
  const failed = useRef<Record<string, string>>({});
  const run = useCallback(
    async <T,>(
      name: string,
      url: string,
      set: Dispatch<SetStateAction<Loadable<T>>>,
      pick: (j: any) => T,
      signal: AbortSignal
    ) => {
      set((s) => ({ ...s, loading: true, error: null }));
      try {
        const j = await getJson<any>(url, signal);
        set({ data: pick(j), loading: false, error: null });
        delete failed.current[name];
        markSynced();
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        const msg = e?.message || 'Could not load the report';
        set((s) => ({ ...s, loading: false, error: msg }));
        // one toast per distinct failure, not one per retry
        if (failed.current[name] !== msg) {
          failed.current[name] = msg;
          toast.error(msg);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!active) return;
    const ac = new AbortController();
    void run<OverviewStats>(
      'overview',
      `/api/reports/analytics/overview?${filtersToQuery(filters, { frame })}`,
      setOverview,
      (j) => j.stats as OverviewStats,
      ac.signal
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filterQs, frame, refreshKey, run]);

  useEffect(() => {
    if (!active) return;
    const ac = new AbortController();
    void run<CallsPage>(
      'calls',
      `/api/reports/analytics/calls?${filtersToQuery(filters, {
        page,
        pageSize,
        sort: sort.key,
        dir: sort.dir,
        search,
      })}`,
      setCalls,
      (j) => j as CallsPage,
      ac.signal
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filterQs, page, pageSize, sort, search, refreshKey, run]);

  useEffect(() => {
    if (!active) return;
    const ac = new AbortController();
    void run<AssignedData>(
      'assigned',
      `/api/reports/analytics/assigned?${filterQs}`,
      setAssigned,
      (j) => j as AssignedData,
      ac.signal
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filterQs, refreshKey, run]);

  // Filter drawer options (real sources, channels, agents) load once.
  useEffect(() => {
    if (!active) return;
    const ac = new AbortController();
    getJson<FilterOptions>('/api/reports/analytics/options', ac.signal)
      .then(setOptions)
      .catch(() => undefined);
    return () => ac.abort();
  }, [active]);

  // ── Realtime: refresh KPIs, charts and the table when calls change ──────────
  useEffect(() => {
    if (!active) return;
    const supabase = createClient();
    let timer: number | undefined;
    const channel = supabase
      .channel('analytics-call-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, (payload: any) => {
        if (payload?.eventType === 'INSERT' && payload?.new?.direction === 'incoming') {
          toast.info('Incoming call logged');
        }
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setRefreshKey((k) => k + 1), 1500);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') setLive('live');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLive('offline');
        else setLive('connecting');
      });
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [active]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }, []);

  return {
    frame,
    setFrame,
    overview,
    calls,
    assigned,
    options,
    page,
    setPage,
    pageSize,
    sort,
    toggleSort,
    search,
    setSearch,
    live,
    syncedAt,
    reload: () => setRefreshKey((k) => k + 1),
  };
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { leadSourcesService } from '@/lib/services/crmService';

export interface LeadSourceRow {
  id: string;
  name: string;
  is_active: boolean;
}

/**
 * The ONE list of lead sources for the whole site (public.lead_sources, the table the Admin tab edits).
 *  - `all`   : every source, retired ones included. Use for FILTERS, so old leads stay reachable.
 *  - `active`: only sources offered for new leads. Use for ADD / EDIT / IMPORT forms.
 * Refreshes by itself when a source is added, renamed, switched off or deleted anywhere in the app.
 */
export function useLeadSources() {
  const [all, setAll] = useState<LeadSourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      leadSourcesService
        .getAll()
        .then((rows: any[]) => {
          if (!alive) return;
          setAll(
            (Array.isArray(rows) ? rows : [])
              .map((r) => ({ id: String(r.id), name: String(r.name || '').trim(), is_active: r.is_active !== false }))
              .filter((r) => r.name)
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        })
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    void load();
    const unsub = leadSourcesService.onSourcesChanged(() => void load());
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const active = useMemo(() => all.filter((s) => s.is_active), [all]);
  const allNames = useMemo(() => all.map((s) => s.name), [all]);
  const activeNames = useMemo(() => active.map((s) => s.name), [active]);
  return { all, active, allNames, activeNames, loading };
}

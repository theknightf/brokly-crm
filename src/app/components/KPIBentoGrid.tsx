'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, GripVertical, ArrowUpRight } from 'lucide-react';
import { leadsService } from '@/lib/services/crmService';
import { ALL_STATUSES, colorClassOf, STATUS_ICONS } from '@/lib/ui';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

interface StatusCardProps {
  status: string;
  count: number;
  total: number;
  colorClass: string;
  interactive: boolean;
}

function StatusCard({ status, count, total, colorClass, interactive }: StatusCardProps) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
  const [bg, text] = colorClass.split(' ');
  const icon = STATUS_ICONS[status] || '📊';

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${bg} bg-opacity-60`}
        >
          {icon}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${text}`}>
          {pct}%
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
            {count.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-tight">{status}</p>
        </div>
        <ArrowUpRight
          size={14}
          className="text-muted-foreground/30 group-hover:text-primary transition-colors flex-shrink-0"
        />
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/leads-management?status=${encodeURIComponent(status)}`}
      title={`Open ${status} in Leads Management`}
      className={`rounded-2xl border border-border bg-card p-4 flex flex-col gap-2 cursor-pointer transition-all hover:shadow-[0_0_18px_rgba(132,204,22,0.25)] hover:border-primary/50 hover:-translate-y-0.5 active:scale-[0.98]`}
    >
      {inner}
    </Link>
  );
}

function sanitize(keys: string[]): string[] {
  return ALL_STATUSES.filter((s) => keys.includes(s));
}

export default function KPIBentoGrid() {
  const { user, profile } = useAuth();
  const isOwnerOrAdmin = isAdminRole(profile?.role);
  const storageKey = user?.id ? `brokly:kpiCardOrder:${user.id}` : null;

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [order, setOrder] = useState<string[]>(ALL_STATUSES);
  const [hydrated, setHydrated] = useState(false);
  const [edit, setEdit] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    leadsService
      .getStatusCounts()
      .then((data: any) => {
        const c = data || {};
        const t = Object.values(c).reduce((sum: number, v: any) => sum + Number(v), 0);
        setCounts(c);
        setTotal(t);
      })
      .catch(() => {
        setCounts({});
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!storageKey) {
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setOrder(sanitize(JSON.parse(raw)));
    } catch {
      // ignore corrupt data
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      // ignore quota/availability errors
    }
  }, [order, hydrated, storageKey]);

  const move = (status: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(status);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const startDrag = (e: React.DragEvent, status: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragged(status);
  };

  const drop = (target: string) => {
    if (!dragged || dragged === target) {
      setDragged(null);
      setOver(null);
      return;
    }
    setOrder((prev) => {
      const next = prev.filter((s) => s !== dragged);
      const ti = next.indexOf(target);
      next.splice(ti, 0, dragged);
      return next;
    });
    setDragged(null);
    setOver(null);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card p-4 h-24 animate-pulse bg-muted/30"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden lg:flex justify-end">
        {isOwnerOrAdmin && (
          <button
            onClick={() => setEdit((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors active:scale-95 ${
              edit ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
            }`}
            aria-pressed={edit}
          >
            {edit ? <Check size={14} /> : <GripVertical size={14} />}
            {edit ? 'Done' : 'Edit cards'}
          </button>
        )}
      </div>

      {/* Total leads hero card */}
      <Link
        href="/leads-management"
        title="Open all leads in Leads Management"
        className="rounded-2xl border border-border bg-card px-6 py-4 flex items-center justify-between cursor-pointer transition-all hover:shadow-[0_0_18px_rgba(132,204,22,0.25)] hover:border-primary/50 active:scale-[0.99]"
      >
        <div>
          <p className="text-sm text-muted-foreground font-medium">Total Leads</p>
          <p className="text-4xl font-bold text-foreground tabular-nums mt-0.5">
            {total.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">All statuses combined</p>
          <p className="text-sm font-semibold text-primary mt-1">
            {ALL_STATUSES.length} stages tracked
          </p>
        </div>
      </Link>

      {/* Status cards grid (admin-reorderable) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {order.map((status) => {
          const colorClass = colorClassOf(status);
          const pos = order.indexOf(status);
          return (
            <div
              key={status}
              className={`relative ${edit ? (over === status ? 'ring-2 ring-primary/60 rounded-2xl' : '') : ''}`}
              onDragOver={(e) => {
                if (!edit) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((k) => (k === status ? null : k))}
              onDrop={(e) => {
                if (!edit) return;
                e.preventDefault();
                drop(status);
              }}
            >
              {edit && (
                <div className="absolute -top-2.5 right-2 z-10 flex items-center gap-0.5 bg-card border border-border rounded-lg px-1 py-0.5 shadow-sm">
                  <span
                    draggable
                    onDragStart={(e) => startDrag(e, status)}
                    onDragEnd={() => {
                      setDragged(null);
                      setOver(null);
                    }}
                    className="cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                    title="Drag to reorder"
                  >
                    <GripVertical size={13} />
                  </span>
                  <button
                    onClick={() => move(status, -1)}
                    disabled={pos === 0}
                    className="p-1 rounded text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                    aria-label={`Move ${status} up`}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => move(status, 1)}
                    disabled={pos === order.length - 1}
                    className="p-1 rounded text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                    aria-label={`Move ${status} down`}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              )}
              <div className={dragged === status ? 'opacity-50' : ''}>
                <StatusCard
                  status={status}
                  count={counts[status] || 0}
                  total={total}
                  colorClass={colorClass}
                  interactive={!edit}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

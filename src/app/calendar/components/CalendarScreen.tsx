'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  Phone,
  MapPin,
  CalendarClock,
  MessageCircle,
  Video,
  Mail,
  CheckCircle2,
  AlertCircle,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { followUpsService } from '@/lib/services/crmService';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_ICON: Record<string, React.ReactNode> = {
  Call: <Phone size={12} />,
  'Site Visit': <MapPin size={12} />,
  Meeting: <CalendarClock size={12} />,
  WhatsApp: <MessageCircle size={12} />,
  Email: <Mail size={12} />,
  'Video Call': <Video size={12} />,
};

function statusCls(status?: string) {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Cancelled') return 'bg-slate-100 text-slate-500';
  return 'bg-blue-50 text-blue-700';
}

export default function CalendarScreen() {
  const [fups, setFups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string>(today.toISOString().split('T')[0]);

  useEffect(() => {
    let mounted = true;
    followUpsService
      .getAll()
      .then((data) => {
        if (mounted) setFups((data || []) as any[]);
      })
      .catch(() => {
        if (mounted) setFups([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = startDow - 1; i >= 0; i--) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(
        `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      );
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const f of fups) {
      const d = (f.dueDate || '').slice(0, 10);
      if (!d) continue;
      (map[d] = map[d] || []).push(f);
    }
    return map;
  }, [fups]);

  const monthCount = useMemo(() => {
    const prefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
    return fups.filter((f) => String(f.dueDate || '').startsWith(prefix)).length;
  }, [fups, cursor]);

  const selectedList = (byDay[selected] || []).sort((a, b) =>
    String(a.dueTime || '').localeCompare(String(b.dueTime || ''))
  );

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your follow-ups and meetings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-muted text-muted-foreground rounded-full px-3 py-1.5">
            {monthCount} follow-ups this month
          </span>
          <button
            onClick={() => {
              const now = new Date();
              setCursor({ y: now.getFullYear(), m: now.getMonth() });
              setSelected(now.toISOString().split('T')[0]);
            }}
            className="btn-secondary !h-9 !px-3 !text-xs"
          >
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Month grid */}
        <div className="card-base !p-0 xl:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <CalendarDays size={15} className="text-primary" />
              {monthLabel}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shift(-1)}
                className="btn-ghost p-1.5"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => shift(1)} className="btn-ghost p-1.5" aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={22} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  if (!d)
                    return <div key={`e-${i}`} className="h-20 sm:h-24 border-b border-border" />;
                  const day = Number(d.slice(8, 10));
                  const items = byDay[d] || [];
                  const isToday = d === today.toISOString().split('T')[0];
                  const isSelected = d === selected;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelected(d)}
                      className={`h-20 sm:h-24 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/40 ${
                        isSelected ? 'bg-secondary/60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                            isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                          }`}
                        >
                          {day}
                        </span>
                        {items.length > 0 && (
                          <span className="text-[10px] font-semibold text-primary tabular-nums">
                            {items.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {items.slice(0, 3).map((f) => (
                          <div
                            key={f.id}
                            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium truncate ${statusCls(
                              f.status
                            )}`}
                          >
                            {TYPE_ICON[f.type] || <CalendarClock size={12} />}
                            <span className="truncate">{f.contactName || f.title}</span>
                          </div>
                        ))}
                        {items.length > 3 && (
                          <p className="text-[10px] text-muted-foreground px-1">
                            +{items.length - 3} more
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Selected day list */}
        <div className="space-y-3">
          <div className="card-base !p-4">
            <h2 className="text-sm font-semibold text-foreground">
              {selected === today.toISOString().split('T')[0] ? 'Today' : selected}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedList.length} follow-up{selectedList.length !== 1 ? 's' : ''} scheduled
            </p>
          </div>
          {selectedList.length === 0 ? (
            <div className="card-base !p-6 text-center">
              <CalendarDays size={20} className="text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-foreground mt-2">No follow-ups</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Nothing scheduled for this day.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedList.map((f) => (
                <div key={f.id} className="card-base !p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {f.contactName || f.title}
                    </p>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusCls(
                        f.status
                      )}`}
                    >
                      {f.status || 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {TYPE_ICON[f.type] || <CalendarClock size={12} />}
                      {f.type || 'Follow-up'}
                    </span>
                    {f.dueTime && <span className="tabular-nums">{f.dueTime}</span>}
                    {f.agent && <span className="truncate">· {f.agent}</span>}
                  </div>
                  {f.leadId && (
                    <Link
                      href={`/leads-management?lead=${encodeURIComponent(f.leadId)}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      <UserRound size={11} /> Open lead
                    </Link>
                  )}
                  {f.status === 'Completed' && (
                    <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                      <CheckCircle2 size={12} /> Completed
                    </p>
                  )}
                  {f.status !== 'Completed' && f.status !== 'Cancelled' && f.dueDate < selected && (
                    <p className="flex items-center gap-1 text-[11px] text-red-500">
                      <AlertCircle size={12} /> Overdue
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import React from 'react';
import { ListPlus, Loader2, PhoneIncoming, PhoneOutgoing, StickyNote } from 'lucide-react';
import {
  CALL_RESULTS,
  formatDuration,
  type CallItem,
  type CallResult,
} from '@/lib/leadWorkShared';
import {
  EmptyState,
  ErrorState,
  RESULT_LABEL,
  ResultPill,
  SkeletonRows,
  fmtDateTime,
} from './shared';

interface Props {
  calls: CallItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  resultFilter: CallResult | '';
  dayFilter: string;
  onResultFilter: (r: CallResult | '') => void;
  onDayFilter: (d: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onAddNote: (call: CallItem) => void;
  onAddAction: (call: CallItem) => void;
  rangeFrom: string;
  rangeTo: string;
}

export default function CallsTab(p: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[9rem] flex-1 text-xs font-semibold text-muted-foreground">
          Result
          <select
            value={p.resultFilter}
            onChange={(e) => p.onResultFilter(e.target.value as CallResult | '')}
            className="input-base mt-1 h-11 min-h-[44px] text-base sm:text-sm"
          >
            <option value="">All results</option>
            {CALL_RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[9rem] flex-1 text-xs font-semibold text-muted-foreground">
          Day
          <input
            type="date"
            min={p.rangeFrom}
            max={p.rangeTo}
            value={p.dayFilter}
            onChange={(e) => p.onDayFilter(e.target.value)}
            className="input-base mt-1 h-11 min-h-[44px] text-base sm:text-sm"
          />
        </label>
        {(p.resultFilter || p.dayFilter) && (
          <button
            type="button"
            onClick={() => {
              p.onResultFilter('');
              p.onDayFilter('');
            }}
            className="btn-ghost min-h-[44px] text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {p.loading ? (
        <SkeletonRows rows={5} />
      ) : p.error ? (
        <ErrorState message={p.error} onRetry={p.onRetry} />
      ) : p.calls.length === 0 ? (
        <EmptyState text="No calls in this period" />
      ) : (
        <>
          <ul className="space-y-2">
            {p.calls.map((c) => {
              const Dir = c.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
              return (
                <li key={c.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                        <Dir
                          size={14}
                          className={c.direction === 'incoming' ? 'text-sky-500' : 'text-muted-foreground'}
                          aria-label={c.direction === 'incoming' ? 'Incoming call' : 'Outgoing call'}
                        />
                        <span className="truncate">{c.leadName || 'Unknown lead'}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.phone && (
                          <span dir="ltr" className="me-2 font-mono-data">
                            {c.phone}
                          </span>
                        )}
                        {fmtDateTime(c.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <ResultPill result={c.result} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDuration(c.durationSeconds)}
                      </span>
                    </div>
                  </div>
                  {c.leadId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => p.onAddNote(c)}
                        className="btn-secondary inline-flex min-h-[40px] items-center gap-1.5 px-3 text-xs"
                      >
                        <StickyNote size={13} /> Add note
                      </button>
                      <button
                        type="button"
                        onClick={() => p.onAddAction(c)}
                        className="btn-secondary inline-flex min-h-[40px] items-center gap-1.5 px-3 text-xs"
                      >
                        <ListPlus size={13} /> Add action
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {p.hasMore && (
            <button
              type="button"
              onClick={p.onLoadMore}
              disabled={p.loadingMore}
              className="btn-secondary mx-auto flex min-h-[44px] items-center gap-2 px-5 text-sm"
            >
              {p.loadingMore && <Loader2 size={14} className="animate-spin" />} Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}

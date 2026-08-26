'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Check, Loader2, Palmtree, Send, X } from 'lucide-react';
import { leaveService, type LeaveRequest } from '@/lib/services/peopleOpsService';
import { useAuth } from '@/contexts/AuthContext';

const TYPES = ['annual', 'sick', 'unpaid', 'emergency', 'other'];

const typeLabel: Record<string, string> = {
  annual: 'Annual',
  sick: 'Sick',
  unpaid: 'Unpaid',
  emergency: 'Emergency',
  other: 'Other',
};

const badge = (status: string) => {
  const map: Record<string, string> = {
    approved: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-700',
    cancelled: 'bg-muted text-muted-foreground',
    pending: 'bg-amber-50 text-amber-700',
  };
  return `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[status] || 'bg-muted text-muted-foreground'}`;
};

export default function LeaveTab() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await leaveService.getAll();
    setRequests(statusFilter === 'all' ? list : list.filter((r) => r.status === statusFilter));
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const request = async () => {
    if (!startDate || !endDate) return toast.error('Pick start and end dates');
    if (endDate < startDate) return toast.error('End date must be after start date');
    if (!user?.id) return toast.error('Not authenticated');
    const days = Math.max(
      1,
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    );
    setSubmitting(true);
    try {
      await leaveService.request({
        userId: user.id,
        leaveType: type,
        startDate,
        endDate,
        days,
        reason,
      });
      toast.success('Leave request submitted');
      setShowForm(false);
      setReason('');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (!user?.id) return toast.error('Not authenticated');
    setBusyId(id);
    try {
      await leaveService.review(id, action === 'approve' ? 'approved' : 'rejected', user.id);
      toast.success(action === 'approve' ? 'Request approved' : 'Request rejected');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update request');
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await leaveService.cancel(id);
      toast.success('Request cancelled');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to cancel request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary h-9 px-3 text-sm flex items-center gap-1.5"
          >
            <Send size={14} /> Request leave
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-base !w-36 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Palmtree size={15} className="text-primary" /> New leave request
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="input-base text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-base text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-base text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Reason (optional)
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. family emergency"
                className="input-base text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={request}
                disabled={submitting}
                className="btn-primary h-9 px-3 text-sm w-full flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{' '}
                Send request
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <CalendarDays size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Leave requests</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No leave requests found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Employee
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Type
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Dates
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Days
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Reason
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                      {r.userName || '—'}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {typeLabel[r.leaveType] || r.leaveType}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {r.startDate} → {r.endDate}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[220px] truncate">
                      {r.reason || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={badge(r.status)}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.status === 'pending' && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => decide(r.id, 'approve')}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          >
                            {busyId === r.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={12} />
                            )}{' '}
                            Approve request
                          </button>
                          <button
                            onClick={() => decide(r.id, 'reject')}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100"
                          >
                            <X size={12} /> Reject request
                          </button>
                        </div>
                      )}
                      {r.status === 'pending' && (
                        <button
                          onClick={() => cancel(r.id)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted ml-1"
                        >
                          Cancel request
                        </button>
                      )}
                      {(r.status === 'approved' || r.status === 'rejected') && (
                        <span className="text-xs text-muted-foreground">
                          {r.reviewedAt ? r.reviewedAt.split('T')[0] : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import React, { useState, useEffect } from 'react';
import {
  Loader2,
  Handshake,
  BadgeCheck,
  Link2,
  Search,
  UserCircle2,
  RefreshCw,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Lead } from './mockLeads';
import { leadsService } from '@/lib/services/crmService';

interface DealStatusModalProps {
  lead: Lead;
  status: 'Reservation' | 'Done Deal';
  onClose: () => void;
  onChangeLead?: (leadId: string) => Promise<Lead | null>;
  onConfirm: (fields: {
    status: 'Reservation' | 'Done Deal';
    date: string;
    amount: number;
    finalPrice: number;
    commission: number;
  }) => void;
}

const money = (v: any) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

interface LeadResult {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyType: string;
  project: string;
  unit: string;
}

export default function DealStatusModal({
  lead,
  status,
  onClose,
  onChangeLead,
  onConfirm,
}: DealStatusModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(
    status === 'Reservation' ? lead.reservationDate || today : lead.closingDate || today
  );
  const [amount, setAmount] = useState(
    status === 'Reservation'
      ? String(lead.reservationAmount || 0)
      : String(lead.finalPrice || lead.totalPrice || lead.unitPrice || 0)
  );
  const [finalPrice, setFinalPrice] = useState(
    String(lead.finalPrice || lead.totalPrice || lead.unitPrice || 0)
  );
  const [commission, setCommission] = useState(String(lead.commission || 0));
  const [saving, setSaving] = useState(false);
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<LeadResult[]>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [switchingLead, setSwitchingLead] = useState(false);

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0];
    setDate(status === 'Reservation' ? lead.reservationDate || t : lead.closingDate || t);
    setAmount(
      status === 'Reservation'
        ? String(lead.reservationAmount || 0)
        : String(lead.finalPrice || lead.totalPrice || lead.unitPrice || 0)
    );
    setFinalPrice(String(lead.finalPrice || lead.totalPrice || lead.unitPrice || 0));
    setCommission(String(lead.commission || 0));
    setLeadSearch('');
    setLeadResults([]);
    setLeadSearchOpen(false);
  }, [lead, status]);

  useEffect(() => {
    const q = leadSearch.trim();
    if (q.length < 2) {
      setLeadResults([]);
      return;
    }
    let cancelled = false;
    setLeadSearching(true);
    const t = setTimeout(() => {
      leadsService
        .search(q)
        .then((results) => {
          if (!cancelled) setLeadResults(results as LeadResult[]);
        })
        .catch(() => {
          if (!cancelled) setLeadResults([]);
        })
        .finally(() => {
          if (!cancelled) setLeadSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [leadSearch]);

  const isReservation = status === 'Reservation';

  const pickLead = async (r: LeadResult) => {
    if (!onChangeLead) return;
    setSwitchingLead(true);
    try {
      await onChangeLead(r.id);
      setLeadSearchOpen(false);
    } catch {
      // keep the current lead
    } finally {
      setSwitchingLead(false);
    }
  };

  const submit = () => {
    setSaving(true);
    try {
      onConfirm({
        status,
        date,
        amount: money(amount),
        finalPrice: money(finalPrice),
        commission: money(commission),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isReservation ? 'Confirm Reservation' : 'Confirm Done Deal'}
      subtitle={[lead.name || 'This lead', lead.phone].filter(Boolean).join(' — ')}
      size="sm"
    >
      <div className="p-6 space-y-4">
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
            isReservation ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {isReservation ? <BadgeCheck size={14} /> : <Handshake size={14} />}
          {isReservation
            ? 'This will mark the lead as Reserved and start the payment plan.'
            : 'This will mark the lead as a closed deal.'}
        </div>

        {/* Carry Lead / Select Existing Lead */}
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-primary" />
            <span className="text-sm font-medium text-foreground">Link to an existing lead</span>
            <button
              type="button"
              onClick={() => setLeadSearchOpen((o) => !o)}
              className="ml-auto text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              title="Link the reservation to a different existing lead"
            >
              {switchingLead ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              Select existing lead…
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2 text-sm">
            <UserCircle2 size={15} className="text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-foreground truncate">
              {lead.name || 'Unnamed lead'}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">{lead.phone || ''}</span>
          </div>
          {leadSearchOpen && (
            <div className="relative">
              <input
                className="input-base pl-9"
                placeholder="Search leads by name, phone, email, project or unit…"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                autoFocus
              />
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              {leadSearching && (
                <Loader2
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary"
                />
              )}
              {leadSearch.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl shadow-modal overflow-y-auto max-h-48 fade-in">
                  {leadResults.length === 0 && !leadSearching ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No leads found</p>
                  ) : (
                    leadResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickLead(r)}
                        disabled={switchingLead}
                        className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                      >
                        <span className="block text-sm font-medium text-foreground">{r.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {[r.project, r.unit, r.propertyType].filter(Boolean).join(' · ') ||
                            [r.phone, r.email].filter(Boolean).join(' · ')}
                        </span>
                        <span className="block text-[11px] text-muted-foreground/80">
                          {r.phone} · {r.email}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {!leadSearchOpen && (
            <p className="text-[11px] text-muted-foreground">
              No new lead is created — the reservation is attached to the lead shown above.
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="label-base">{isReservation ? 'Reservation date' : 'Closing date'}</span>
          <input
            type="date"
            className="input-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {isReservation && (
          <label className="flex flex-col gap-1">
            <span className="label-base">Reservation amount (EGP)</span>
            <input
              type="number"
              min="0"
              className="input-base"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="label-base">Final price (EGP)</span>
          <input
            type="number"
            min="0"
            className="input-base"
            value={finalPrice}
            onChange={(e) => setFinalPrice(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label-base">Commission (EGP)</span>
          <input
            type="number"
            min="0"
            className="input-base"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={`btn-primary flex items-center gap-2 ${
              isReservation ? '' : '!bg-emerald-600 hover:!bg-emerald-700 !text-white'
            }`}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isReservation ? 'Confirm Reservation' : 'Confirm Done Deal'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

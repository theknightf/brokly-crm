'use client';
import React, { useState } from 'react';
import { Loader2, Handshake, BadgeCheck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Lead } from './mockLeads';

interface DealStatusModalProps {
  lead: Lead;
  status: 'Reservation' | 'Done Deal';
  onClose: () => void;
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

export default function DealStatusModal({
  lead,
  status,
  onClose,
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

  const isReservation = status === 'Reservation';

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
      subtitle={`${lead.name || 'This lead'} — ${lead.leadNumber || lead.phone || ''}`}
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

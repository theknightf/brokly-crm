'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { BadgePercent, CalendarRange, CreditCard, Loader2, Repeat, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { leadsService, unitsService } from '@/lib/services/crmService';
import type { Lead } from './mockLeads';

const FREQ_LABELS: Record<number, string> = {
  12: 'Monthly',
  4: 'Quarterly',
  2: 'Semi-annual',
  1: 'Annual',
};

const num = (v: any) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

interface QuickPaymentPlanModalProps {
  lead: Lead;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}

/**
 * Compact "Payment plan" quick action — lets a salesperson snapshot the client's
 * payment plan without opening the full lead edit form. Persists into the
 * existing payment columns on the leads row (no schema changes).
 */
export default function QuickPaymentPlanModal({
  lead,
  onClose,
  onSaved,
}: QuickPaymentPlanModalProps) {
  const [units, setUnits] = useState<any[]>([]);
  const [planUnitId, setPlanUnitId] = useState('');
  const [totalPrice, setTotalPrice] = useState(String(Number(lead.totalPrice || 0) || ''));
  const [downPct, setDownPct] = useState(String(Number(lead.downPaymentPct || 0) || ''));
  const [years, setYears] = useState('');
  const [freq, setFreq] = useState(Number(lead.installmentFrequency || 12) || 12);
  const [reservation, setReservation] = useState(String(Number(lead.reservationAmount || 0) || ''));
  const [paymentStatus, setPaymentStatus] = useState(lead.paymentStatus || 'Not Started');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    unitsService
      .getAll()
      .then((data: any) => setUnits(data || []))
      .catch(() => setUnits([]));
  }, []);

  const usableUnits = useMemo(
    () =>
      units.filter(
        (u: any) =>
          u.status === 'Available' &&
          (Number(u.downPaymentPct) > 0 || Number(u.installmentYears) > 0)
      ),
    [units]
  );

  // Total price changes when the down-payment % changes (and vice versa).
  const downAmount = useMemo(() => {
    const total = num(totalPrice);
    const pct = num(downPct);
    return pct > 0 && total > 0 ? (total * pct) / 100 : 0;
  }, [totalPrice, downPct]);

  const installments = useMemo(() => {
    const y = num(years);
    if (!(y > 0)) return { count: 0, each: 0 };
    const count = y * freq;
    const each =
      count > 0 ? Math.max(0, num(totalPrice) - downAmount - num(reservation)) / count : 0;
    return { count, each };
  }, [years, freq, totalPrice, downAmount, reservation]);

  const applyUnitPlan = (unit: any) => {
    if (!unit) return;
    setTotalPrice(String(Number(unit.price) || 0));
    setDownPct(String(Number(unit.downPaymentPct) || 0));
    setYears(String(Number(unit.installmentYears) || 0));
    setFreq(Number(unit.installmentFrequency || 12) || 12);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const total = num(totalPrice);
      const updated = await leadsService.update(lead.id, {
        id: lead.id,
        totalPrice: total,
        downPaymentPct: num(downPct),
        downPayment: downAmount,
        installmentCount: installments.count,
        installmentAmount: installments.each,
        installmentFrequency: freq,
        reservationAmount: num(reservation),
        remainingAmount: Math.max(0, total - downAmount - num(reservation)),
        paymentStatus: paymentStatus || 'Not Started',
        unitId: planUnitId || lead.unitId || null,
      });
      toast.success('Payment plan saved');
      onSaved(updated as Lead);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payment plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Payment plan"
      subtitle={`${lead.name || 'Lead'} · saved directly on the lead`}
      size="md"
    >
      <div className="space-y-4">
        {/* Copy from an available unit's plan */}
        <div>
          <p className="label-base">Copy plan from unit (optional)</p>
          <select
            value={planUnitId}
            onChange={(e) => {
              const id = e.target.value;
              setPlanUnitId(id);
              applyUnitPlan(usableUnits.find((u: any) => u.id === id));
            }}
            className="input-base"
          >
            <option value="">— Select an available unit —</option>
            {usableUnits.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.projectName || '—'} · {num(u.downPaymentPct)}% down ·{' '}
                {num(u.installmentYears)} yrs
              </option>
            ))}
          </select>
          {usableUnits.length === 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              No available units with a saved payment plan yet — enter the plan manually below.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-base">
              <Wallet size={12} className="inline mr-1 text-muted-foreground" />
              Total price (EGP)
            </span>
            <input
              type="number"
              min={0}
              className="input-base"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">
              <BadgePercent size={12} className="inline mr-1 text-muted-foreground" />
              Down payment %
            </span>
            <input
              type="number"
              min={0}
              max={100}
              className="input-base"
              value={downPct}
              onChange={(e) => setDownPct(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">
              <CreditCard size={12} className="inline mr-1 text-muted-foreground" />
              Down payment (EGP)
            </span>
            <input
              type="number"
              min={0}
              className="input-base bg-muted/40 text-muted-foreground"
              value={Math.round(downAmount) || ''}
              readOnly
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">
              <CreditCard size={12} className="inline mr-1 text-muted-foreground" />
              Reservation (EGP)
            </span>
            <input
              type="number"
              min={0}
              className="input-base"
              value={reservation}
              onChange={(e) => setReservation(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">Installment period (years)</span>
            <input
              type="number"
              min={0}
              className="input-base"
              placeholder="e.g. 8"
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-base">Payment frequency</span>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {Object.entries(FREQ_LABELS).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFreq(Number(v))}
                  className={`px-2.5 h-9 rounded-lg text-[11px] font-semibold transition-colors ${
                    freq === Number(v)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="bg-muted/40 rounded-xl px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <p className="text-xs text-muted-foreground">Installments</p>
          <p className="text-right font-semibold text-foreground tabular-nums">
            {installments.count > 0 ? `${installments.count}` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Each installment</p>
          <p className="text-right font-semibold text-foreground tabular-nums">
            {installments.each > 0 ? `EGP ${Math.round(installments.each).toLocaleString()}` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Remaining after down payment</p>
          <p className="text-right font-semibold text-foreground tabular-nums">
            EGP {Math.max(0, num(totalPrice) - downAmount).toLocaleString()}
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="label-base">
            <CalendarRange size={12} className="inline mr-1 text-muted-foreground" />
            Payment status
          </span>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="input-base"
          >
            {['Not Started', 'Down Payment Paid', 'In Progress', 'Completed', 'On Hold'].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              )
            )}
          </select>
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save plan
          </button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Banknote,
  CalendarRange,
  ChevronDown,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  payrollService,
  companySettingsService,
  type PayrollPeriod,
  type PayrollEntry,
  type WorkingHours,
  type PayrollRules,
  DEFAULT_WORKING_HOURS,
  DEFAULT_PAYROLL_RULES,
} from '@/lib/services/peopleOpsService';
import { usersService } from '@/lib/services/crmService';

const fmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function PayrollTab() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  // Working hours + payroll rules config
  const [wh, setWh] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);
  const [rules, setRules] = useState<PayrollRules>(DEFAULT_PAYROLL_RULES);
  const [savingConfig, setSavingConfig] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [salaryDraft, setSalaryDraft] = useState<Record<string, string>>({});

  const loadPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    try {
      const list = await payrollService.getPeriods();
      setPeriods(list);
      if (!selectedPeriod && list.length) setSelectedPeriod(list[0].id);
    } catch {
      setPeriods([]);
    } finally {
      setLoadingPeriods(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoadingEntries(true);
    payrollService
      .getEntries(selectedPeriod)
      .then(setEntries)
      .finally(() => setLoadingEntries(false));
  }, [selectedPeriod]);

  useEffect(() => {
    (async () => {
      try {
        const [w, r] = await Promise.all([
          companySettingsService.getWorkingHours(),
          companySettingsService.getPayrollRules(),
        ]);
        setWh(w || DEFAULT_WORKING_HOURS);
        setRules(r || DEFAULT_PAYROLL_RULES);
      } catch {
        setWh(DEFAULT_WORKING_HOURS);
        setRules(DEFAULT_PAYROLL_RULES);
      }
    })();
  }, []);

  useEffect(() => {
    usersService
      .getAll()
      .then((u: any) =>
        setUsers(
          (Array.isArray(u) ? u : []).map((user: any) => ({
            ...user,
            fullName:
              typeof user.fullName === 'string'
                ? user.fullName
                : typeof user.full_name === 'string'
                  ? user.full_name
                  : user.full_name?.full_name || '',
            role: typeof user.role === 'string' ? user.role : 'agent',
          }))
        )
      )
      .catch(() => setUsers([]));
  }, []);

  const selected = periods.find((p) => p.id === selectedPeriod);
  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, e) => ({
          gross: acc.gross + e.gross,
          deductions: acc.deductions + e.deductionsTotal,
          net: acc.net + e.net,
          lateMinutes: acc.lateMinutes + e.lateMinutes,
          absenceDays: acc.absenceDays + e.absenceDays,
        }),
        { gross: 0, deductions: 0, net: 0, lateMinutes: 0, absenceDays: 0 }
      ),
    [entries]
  );

  const createPeriod = async () => {
    if (!newStart || !newEnd) return toast.error('Pick both dates');
    if (newEnd < newStart) return toast.error('End date must be after start date');
    try {
      await payrollService.createPeriod(newStart, newEnd);
      toast.success('Payroll period created');
      setNewStart('');
      setNewEnd('');
      await loadPeriods();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create period');
    }
  };

  const generate = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);
    try {
      const res = await payrollService.generate(selectedPeriod);
      toast.success(`Generated ${res.generated} payroll entries`);
      const list = await payrollService.getEntries(selectedPeriod);
      setEntries(list);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const saveEntry = async (id: string, patch: Partial<PayrollEntry>) => {
    setSaving(true);
    try {
      await payrollService.updateEntry(id, patch);
      toast.success('Changes saved');
      const list = await payrollService.getEntries(selectedPeriod);
      setEntries(list);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!selectedPeriod) return;
    try {
      await payrollService.finalize(selectedPeriod);
      toast.success('Period finalized');
      await loadPeriods();
      const list = await payrollService.getEntries(selectedPeriod);
      setEntries(list);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to finalize');
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await companySettingsService.update('workingHours', wh);
      await companySettingsService.update('payrollRules', rules);
      toast.success('Working hours & payroll rules saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const saveSalaries = async () => {
    setSaving(true);
    try {
      const keys = Object.keys(salaryDraft);
      for (const k of keys) {
        const val = Number(salaryDraft[k]);
        if (!Number.isFinite(val)) continue;
        await usersService.updateSalary?.(k, val);
      }
      toast.success('Salaries updated');
      setSalaryDraft({});
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save salaries');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Working hours + rules */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Settings2 size={15} className="text-primary" /> Working Hours & Payroll Rules
          </h3>
          <button onClick={saveConfig} disabled={savingConfig} className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5">
            {savingConfig ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save settings
          </button>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Shift start">
            <input
              type="time"
              value={wh.start}
              onChange={(e) => setWh({ ...wh, start: e.target.value })}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Shift end">
            <input
              type="time"
              value={wh.end}
              onChange={(e) => setWh({ ...wh, end: e.target.value })}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Late grace (minutes)">
            <input
              type="number"
              min={0}
              value={wh.lateGraceMinutes}
              onChange={(e) => setWh({ ...wh, lateGraceMinutes: Number(e.target.value) })}
              className="input-base text-sm"
            />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={wh.flexibleHours}
                onChange={(e) => setWh({ ...wh, flexibleHours: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              Flexible hours (start later / finish later)
            </label>
          </div>
          <Field label="Working days per month (salary basis)">
            <input
              type="number"
              min={1}
              value={rules.dailySalaryBasis}
              onChange={(e) => setRules({ ...rules, dailySalaryBasis: Number(e.target.value) })}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Deduction per late minute (EGP)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={rules.deductPerLateMinute}
              onChange={(e) => setRules({ ...rules, deductPerLateMinute: Number(e.target.value) })}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Absence deduction per day (EGP, 0 = daily rate)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={rules.absenceDeductionPerDay}
              onChange={(e) => setRules({ ...rules, absenceDeductionPerDay: Number(e.target.value) })}
              className="input-base text-sm"
            />
          </Field>
          <Field label="Commission rate (0 to 1, on closed deals)">
            <input
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={rules.commissionRate}
              onChange={(e) => setRules({ ...rules, commissionRate: Number(e.target.value) })}
              className="input-base text-sm"
            />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={rules.overtimeEnabled}
                onChange={(e) => setRules({ ...rules, overtimeEnabled: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              Enable overtime pay
            </label>
          </div>
          <Field label="Overtime multiplier">
            <input
              type="number"
              min={1}
              step="0.1"
              value={rules.overtimeRate}
              onChange={(e) => setRules({ ...rules, overtimeRate: Number(e.target.value) })}
              className="input-base text-sm"
            />
          </Field>
        </div>
      </div>

      {/* Salaries */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <User size={15} className="text-primary" /> Base Salaries
          </h3>
          <button onClick={saveSalaries} disabled={saving} className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save salaries
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">No users yet.</p>
          )}
          {users.map((u: any) => (
            <div key={u.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{u.fullName}</p>
                <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">EGP</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={u.baseSalary ?? 0}
                  key={u.id}
                  onChange={(e) => setSalaryDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                  className="input-base !w-32 text-sm text-right"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Periods + generation */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarRange size={15} className="text-primary" /> Payroll Periods
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="input-base !w-40 text-sm" />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="input-base !w-40 text-sm" />
            <button onClick={createPeriod} className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5">
              <Plus size={13} /> New period
            </button>
          </div>
        </div>
        <div className="p-4">
          {loadingPeriods ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={20} className="animate-spin text-primary" />
            </div>
          ) : periods.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No periods yet. Create one above, then press <b>Generate</b>.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <div className="relative">
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="input-base appearance-none pr-8 min-w-[220px]"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.periodStart} → {p.periodEnd} ({p.status})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <button onClick={generate} disabled={generating || selected?.status === 'finalized'} className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5">
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Generate from attendance
                </button>
                {selected?.status === 'draft' && entries.length > 0 && (
                  <button onClick={finalize} className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5">
                    <ShieldCheck size={13} /> Finalize period
                  </button>
                )}
                <button onClick={() => loadPeriods()} className="btn-ghost h-8 px-2 text-xs">
                  <RefreshCw size={13} />
                </button>
              </div>

              {loadingEntries ? (
                <div className="flex items-center justify-center h-24">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No entries. Press <b>Generate from attendance</b> to compute payroll from
                  attendance, leave and rules.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Employee</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Base</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Days</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Late (min)</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Absence</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Leave</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Bonus</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Commission</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Reimbursements</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Other deductions</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Gross</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Deductions</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Net</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entries.map((e) => (
                        <tr key={e.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{e.userName || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(e.baseSalary)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.attendanceDays}/{e.totalWorkingDays}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.lateMinutes}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.absenceDays}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.leaveDays}</td>
                          <td className="px-3 py-2 text-right">
                            <MoneyInput value={e.bonus} onSave={(v) => saveEntry(e.id, { bonus: v })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <MoneyInput value={e.commission} onSave={(v) => saveEntry(e.id, { commission: v })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <MoneyInput value={e.expenseReimbursement} onSave={(v) => saveEntry(e.id, { expenseReimbursement: v })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <MoneyInput value={e.otherDeductions} onSave={(v) => saveEntry(e.id, { otherDeductions: v })} />
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(e.gross)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-destructive">-{fmt(e.deductionsTotal)}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(e.net)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${e.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : e.status === 'approved' ? 'bg-sky-50 text-sky-700' : 'bg-muted text-muted-foreground'}`}>
                              {e.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-muted/20 font-semibold">
                        <td className="px-3 py-2 text-foreground">Totals</td>
                        <td className="px-3 py-2 text-right" colSpan={6}></td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.gross)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-destructive">-{fmt(totals.deductions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.net)}</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Banknote size={13} /> Payroll integrates attendance, approved leave, configured working
        hours and payroll rules. Adjust bonuses / commissions / reimbursements per employee, then
        finalize the period.
      </p>
    </div>
  );
}

function MoneyInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = draft !== null;
  const display = editing ? draft : String(value ?? 0);
  const dirty = editing && Number(draft) !== Number(value ?? 0);
  return (
    <div className="inline-flex items-center gap-1 justify-end">
      {editing ? (
        <>
          <input
            type="number"
            value={display}
            onChange={(e) => setDraft(e.target.value)}
            className="input-base !w-24 !h-7 text-xs text-right"
            autoFocus
          />
          <button
            onClick={async () => {
              if (dirty) {
                setBusy(true);
                await onSave(Number(draft) || 0);
                setBusy(false);
              }
              setDraft(null);
            }}
            className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50"
            title="Save amount"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          </button>
          <button onClick={() => setDraft(null)} className="p-1 rounded-lg text-muted-foreground hover:bg-muted" title="Cancel">
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={() => setDraft(String(value ?? 0))}
          className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-muted text-xs tabular-nums text-right"
          title="Edit"
        >
          {fmt(value)}
          <Pencil size={11} className="text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

'use client';
import React, { useMemo, useState } from 'react';
import {
  Calculator,
  Car,
  Info,
  Percent,
  Building2,
  Wallet,
  Handshake,
  ListChecks,
  BadgePercent,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const FREQUENCIES = [
  { value: 12, labelKey: 'calculator.freqMonthly' },
  { value: 4, labelKey: 'calculator.freqQuarterly' },
  { value: 2, labelKey: 'calculator.freqSemi' },
  { value: 1, labelKey: 'calculator.freqAnnual' },
];

function ModeToggle({
  mode,
  onChange,
  percentLabel,
  fixedLabel,
}: {
  mode: 'percent' | 'fixed';
  onChange: (m: 'percent' | 'fixed') => void;
  percentLabel: string;
  fixedLabel: string;
}) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-muted self-start">
      <button
        type="button"
        onClick={() => onChange('percent')}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${
          mode === 'percent' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
        }`}
      >
        <Percent size={13} />
        {percentLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('fixed')}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${
          mode === 'fixed' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
        }`}
      >
        {fixedLabel}
      </button>
    </div>
  );
}

function MoneyInput({
  label,
  unit,
  placeholder,
  value,
  onChange,
  optional,
}: {
  label: React.ReactNode;
  unit: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <label className="flex flex-col gap-1">
      <span className="label-base flex items-center gap-1.5">
        {label}
        {optional && (
          <span className="text-muted-foreground font-normal inline-flex items-center gap-0.5 text-xs">
            {t('common.optional')}
          </span>
        )}
      </span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
          {unit}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base pl-12"
        />
      </div>
    </label>
  );
}

export default function UnitPriceCalculator() {
  const { t } = useLanguage();
  const [meterPrice, setMeterPrice] = useState('');
  const [totalMeters, setTotalMeters] = useState('');
  const [maintMode, setMaintMode] = useState<'percent' | 'fixed'>('percent');
  const [maintValue, setMaintValue] = useState('');
  const [garageFee, setGarageFee] = useState('');
  const [downMode, setDownMode] = useState<'percent' | 'fixed'>('percent');
  const [downValue, setDownValue] = useState('');
  const [handoverMode, setHandoverMode] = useState<'percent' | 'fixed'>('percent');
  const [handoverValue, setHandoverValue] = useState('');
  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [years, setYears] = useState('');
  const [freq, setFreq] = useState(12);

  const result = useMemo(() => {
    const price = parseFloat(meterPrice);
    const meters = parseFloat(totalMeters);
    const garage = parseFloat(garageFee) || 0;
    if (!price || price < 0 || !meters || meters <= 0) {
      return {
        unitValue: 0,
        maint: 0,
        total: 0,
        down: 0,
        handover: 0,
        discount: 0,
        remaining: 0,
        count: 0,
        each: 0,
        valid: false,
      };
    }

    const unitValue = price * meters;
    let maint = 0;
    if (maintMode === 'percent') {
      const pct = parseFloat(maintValue) || 0;
      maint = unitValue * (pct / 100);
    } else {
      maint = parseFloat(maintValue) || 0;
    }
    if (maint < 0) maint = 0;

    let total = unitValue + maint + garage;

    let discount = 0;
    if (discountMode === 'percent') {
      const pct = parseFloat(discountValue) || 0;
      discount = total * (pct / 100);
    } else {
      discount = parseFloat(discountValue) || 0;
    }
    if (discount < 0) discount = 0;
    if (discount > total) discount = total;
    total = total - discount;

    const calcPart = (mode: 'percent' | 'fixed', value: string, base: number) => {
      if (mode === 'percent') {
        const pct = parseFloat(value) || 0;
        return base * (pct / 100);
      }
      return parseFloat(value) || 0;
    };

    let down = calcPart(downMode, downValue, total);
    if (down < 0) down = 0;

    let handover = calcPart(handoverMode, handoverValue, total);
    if (handover < 0) handover = 0;

    const remaining = Math.max(0, total - down - handover);

    const y = parseInt(years, 10);
    const count = !isNaN(y) && y > 0 ? y * freq : 0;
    const each = count > 0 ? remaining / count : 0;

    return {
      unitValue,
      maint,
      total,
      discount,
      down,
      handover,
      remaining,
      count,
      each,
      valid: true,
    };
  }, [
    meterPrice,
    totalMeters,
    maintMode,
    maintValue,
    garageFee,
    downMode,
    downValue,
    handoverMode,
    handoverValue,
    discountMode,
    discountValue,
    years,
    freq,
  ]);

  const gridCard = (color: string, label: string, value: string, sub?: string) => (
    <div className="bg-muted/50 rounded-xl p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${color} inline-block`} /> {label}
      </p>
      <p className="text-base font-semibold mt-1">
        {value}
        {sub && <span className="text-xs font-normal text-muted-foreground"> {sub}</span>}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2 px-1">
        <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Calculator size={20} />
        </span>
        <div>
          <h1 className="page-title">{t('calculator.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('calculator.subtitle')}</p>
        </div>
      </div>

      <div className="card-base space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <MoneyInput
            label={t('calculator.meterPrice')}
            unit="EGP"
            placeholder="e.g. 15000"
            value={meterPrice}
            onChange={setMeterPrice}
          />
          <MoneyInput
            label={t('calculator.totalMeters')}
            unit="m²"
            placeholder="e.g. 120"
            value={totalMeters}
            onChange={setTotalMeters}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-base">{t('calculator.maintenance')}</span>
            <ModeToggle
              mode={maintMode}
              onChange={setMaintMode}
              percentLabel={t('common.percentage')}
              fixedLabel={t('common.fixed')}
            />
          </label>
          <MoneyInput
            label={
              maintMode === 'percent'
                ? t('calculator.maintenancePct')
                : t('calculator.maintenanceAmount')
            }
            unit={maintMode === 'percent' ? '%' : 'EGP'}
            placeholder={maintMode === 'percent' ? 'e.g. 5' : 'e.g. 90000'}
            value={maintValue}
            onChange={setMaintValue}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <MoneyInput
            label={t('calculator.downPayment')}
            unit="EGP"
            placeholder="e.g. 600000"
            value={downValue}
            onChange={setDownValue}
          />
          <label className="flex flex-col gap-1 justify-end">
            <span className="label-base">&nbsp;</span>
            <ModeToggle
              mode={downMode}
              onChange={setDownMode}
              percentLabel={t('common.percentage')}
              fixedLabel={t('common.fixed')}
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <MoneyInput
            label={
              <span className="inline-flex items-center gap-1.5">
                <Handshake size={13} className="text-muted-foreground" />
                {t('calculator.handover')}
              </span>
            }
            unit="EGP"
            placeholder={handoverMode === 'percent' ? 'e.g. 5' : 'e.g. 200000'}
            value={handoverValue}
            onChange={setHandoverValue}
            optional
          />
          <label className="flex flex-col gap-1 justify-end">
            <span className="label-base">&nbsp;</span>
            <ModeToggle
              mode={handoverMode}
              onChange={setHandoverMode}
              percentLabel={t('common.percentage')}
              fixedLabel={t('common.fixed')}
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <MoneyInput
            label={
              <span className="inline-flex items-center gap-1.5">
                <BadgePercent size={13} className="text-muted-foreground" />
                {t('calculator.discount')}
              </span>
            }
            unit="EGP"
            placeholder={discountMode === 'percent' ? 'e.g. 10' : 'e.g. 150000'}
            value={discountValue}
            onChange={setDiscountValue}
            optional
          />
          <label className="flex flex-col gap-1 justify-end">
            <span className="label-base">&nbsp;</span>
            <ModeToggle
              mode={discountMode}
              onChange={setDiscountMode}
              percentLabel={t('common.percentage')}
              fixedLabel={t('common.fixed')}
            />
          </label>
        </div>

        <MoneyInput
          label={
            <span className="inline-flex items-center gap-1.5">
              <Car size={13} className="text-muted-foreground" />
              {t('calculator.garageFee')}
            </span>
          }
          unit="EGP"
          placeholder="e.g. 50000"
          value={garageFee}
          onChange={setGarageFee}
          optional
        />

        {/* Installments (optional) */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <ListChecks size={15} className="text-muted-foreground" />
            {t('calculator.installments')}
            <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-0.5">
              {t('common.optional')}
            </span>
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label-base">{t('calculator.installmentYears')}</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                  y
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="e.g. 5"
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                  className="input-base pl-12"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-base">{t('calculator.installmentFrequency')}</span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {FREQUENCIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFreq(f.value)}
                    className={`px-2.5 h-9 rounded-lg text-[11px] font-semibold transition-colors active:scale-95 ${
                      freq === f.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <span className="text-sm font-semibold">{t('calculator.totalPrice')}</span>
          <span className="text-2xl font-bold">EGP {result.valid ? fmt(result.total) : '—'}</span>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {gridCard(
            'bg-blue-500',
            t('calculator.unitValue'),
            result.valid ? fmt(result.unitValue) : '—'
          )}
          {gridCard(
            'bg-amber-500',
            t('calculator.maintenance'),
            result.valid ? fmt(result.maint) : '—',
            maintMode === 'percent' && result.valid ? `· ${maintValue || 0}%` : undefined
          )}
          {gridCard(
            'bg-emerald-500',
            t('calculator.garageFee'),
            result.valid ? fmt(parseFloat(garageFee) || 0) : '—'
          )}
          {gridCard(
            'bg-rose-500',
            t('calculator.discount'),
            result.valid ? fmt(result.discount) : '—',
            discountMode === 'percent' && result.valid ? `· ${discountValue || 0}%` : undefined
          )}
          {gridCard(
            'bg-indigo-500',
            t('calculator.downPayment'),
            result.valid ? fmt(result.down) : '—',
            downMode === 'percent' && result.valid ? `· ${downValue || 0}%` : undefined
          )}
          {gridCard(
            'bg-teal-500',
            t('calculator.handover'),
            result.valid ? fmt(result.handover) : '—',
            handoverMode === 'percent' && result.valid ? `· ${handoverValue || 0}%` : undefined
          )}
          {gridCard(
            'bg-violet-500',
            t('calculator.remaining'),
            result.valid ? fmt(result.remaining) : '—'
          )}
          {gridCard(
            'bg-sky-500',
            t('calculator.eachInstallment'),
            result.valid && result.count > 0 ? fmt(result.each) : '—',
            result.valid && result.count > 0
              ? `· ${t('calculator.installmentsCount')}: ${result.count}`
              : undefined
          )}
        </div>
        <div className="px-4 pb-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2.5">
            <Info size={13} />
            {t('calculator.totalFormula')}
          </div>
          {result.valid && result.count > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-xl px-3 py-2.5">
              <Building2 size={13} />
              {t('calculator.installmentFormula', { count: result.count })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

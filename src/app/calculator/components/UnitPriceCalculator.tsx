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
  Loader2,
  UserPlus,
  Search,
  Target,
  X,
  UserRound,
  Eye,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  leadsService,
  projectsService,
  unitsService,
  type UnitFile,
} from '@/lib/services/crmService';
import RecommendedUnitDetailsModal from './RecommendedUnitDetailsModal';

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
  const [units, setUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, any>>({});
  const [leadQuery, setLeadQuery] = useState('');
  const [unitImages, setUnitImages] = useState<Record<string, string>>({});
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [detailsUnit, setDetailsUnit] = useState<{
    unit: any;
    matchPct: number;
    reasons: string[];
  } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoadingUnits(true);
    unitsService
      .getAll()
      .then((data: any) => {
        if (mounted) setUnits(data || []);
      })
      .catch(() => {
        if (mounted) setUnits([]);
      })
      .finally(() => {
        if (mounted) setLoadingUnits(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    leadsService
      .getAll()
      .then((data: any) => {
        if (mounted) setLeads(data || []);
      })
      .catch(() => {
        if (mounted) setLeads([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Full project objects (selling points, location, developer, payment plan
  // summary, pitch…) so recommendation cards can explain the project itself.
  React.useEffect(() => {
    let mounted = true;
    projectsService
      .getAll()
      .then((data: any) => {
        if (!mounted) return;
        const map: Record<string, any> = {};
        for (const p of data || []) map[p.id] = p;
        setProjects(map);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l: any) =>
        String(l?.name || '')
          .toLowerCase()
          .includes(q) ||
        String(l?.phone || '')
          .toLowerCase()
          .includes(q)
    );
  }, [leads, leadQuery]);

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

  // Recommend real units from the inventory with a transparent match score:
  // start at 100, penalize price/area distance, then boost real preference
  // matches (budget, property type, project, developer, payment plan).
  const recommendations = useMemo(() => {
    if (!result.valid) return [];
    const meters = parseFloat(totalMeters) || 0;
    const bank: { unit: any; score: number; reasons: string[] }[] = [];
    const leadBudgetMax = Number(selectedLead?.budgetMax || 0);
    const leadBudgetMin = Number(selectedLead?.budgetMin || 0);
    const leadType = String(selectedLead?.propertyType || '').toLowerCase();
    const leadProject = String(selectedLead?.project || '').toLowerCase();
    const leadDeveloper = String(selectedLead?.developer || '').toLowerCase();
    const leadDownPct = Number(selectedLead?.downPaymentPct || 0);

    for (const u of units) {
      const up = Number(u.price || 0);
      if (up <= 0) continue;
      const reasons: string[] = [];
      let penalty = 0;

      const priceDelta = Math.abs(up - result.total) / result.total;
      penalty += priceDelta * 55;
      if (leadBudgetMax > 0) {
        if (up <= leadBudgetMax)
          reasons.push(`Fits the client's budget (up to EGP ${fmt(leadBudgetMax)})`);
        else {
          penalty += Math.min(25, ((up - leadBudgetMax) / leadBudgetMax) * 20);
          reasons.push(
            `Slightly above the client's budget (EGP ${fmt(up)} vs ${fmt(leadBudgetMax)})`
          );
        }
      } else {
        reasons.push(`Close to the calculated total (EGP ${fmt(result.total)})`);
      }
      if (leadBudgetMin > 0 && up < leadBudgetMin) {
        penalty += 15;
        reasons.push(`Below the client's minimum budget (EGP ${fmt(leadBudgetMin)})`);
      }

      const areaDelta =
        meters > 0 && Number(u.area) > 0 ? Math.abs(Number(u.area) - meters) / meters : 0;
      penalty += areaDelta * 25;
      if (meters > 0) {
        reasons.push(
          areaDelta <= 0.15
            ? `Fits the target area (~${Math.round(Number(u.area))} m²)`
            : `${Math.round(Number(u.area))} m² is ${Math.round(areaDelta * 100)}% off the target area`
        );
      }

      const proj = projects[u.projectId];
      const uType = String(u.unitType || '').toLowerCase();
      if (leadType && uType) {
        const leadDigits = leadType.replace(/[^\d]/g, '');
        const unitDigits = uType.replace(/[^\d]/g, '');
        if (leadDigits && unitDigits && leadDigits === unitDigits) {
          penalty -= 6;
          reasons.push(`Matches the requested type (${u.unitType})`);
        } else if (leadType.includes('villa') && uType.includes('villa')) {
          penalty -= 6;
          reasons.push(`Matches the requested type (${u.unitType})`);
        }
      }
      if (leadProject && proj?.name) {
        const pn = String(proj.name).toLowerCase();
        if (pn.includes(leadProject) || leadProject.includes(pn)) {
          penalty -= 5;
          reasons.push(`In the client's preferred project (${proj.name})`);
        }
      }
      if (leadDeveloper && proj?.developerName) {
        const dn = String(proj.developerName).toLowerCase();
        if (dn.includes(leadDeveloper) || leadDeveloper.includes(dn)) {
          penalty -= 4;
          reasons.push(`From the client's preferred developer (${proj.developerName})`);
        }
      }
      if (u.status !== 'Available') {
        penalty += 30;
        reasons.push(`Currently ${u.status} — check availability`);
      } else {
        reasons.push('Available for immediate sale');
      }
      if (leadDownPct > 0 && Number(u.downPaymentPct) > 0) {
        const diff = Math.abs(Number(u.downPaymentPct) - leadDownPct);
        if (diff <= 10) {
          penalty -= diff * 0.5;
          reasons.push(`Down payment plan fits the client (${u.downPaymentPct}%)`);
        }
      }

      const score = Math.min(99, Math.max(35, Math.round(100 - penalty)));
      bank.push({ unit: u, score, reasons });
    }
    return bank.sort((a, b) => b.score - a.score).slice(0, 6);
  }, [units, result, totalMeters, projects, selectedLead]);

  const pickLead = (l: any) => {
    setSelectedLead(l);
    setLeadQuery('');
    // Prefill the calculator from the lead's budget when the user hasn't
    // typed anything yet.
    setMeterPrice((prev) => {
      if (prev) return prev;
      const budget = Number(l.budgetMax || l.budgetMin || 0);
      return budget > 0
        ? String(Math.round(budget / Math.max(1, Number(totalMeters) || 100)))
        : prev;
    });
  };

  // Resolve short-lived signed URLs for unit thumbnails (private bucket).
  React.useEffect(() => {
    let mounted = true;
    const withImage = recommendations
      .map(({ unit }) => (unit?.imagePath ? { id: unit.id, path: unit.imagePath } : null))
      .filter((x): x is { id: string; path: string } => !!x);
    if (withImage.length === 0) return;
    Promise.all(
      withImage.map(async ({ id, path }) => ({
        id,
        url: await unitsService.getFileUrl({ filePath: path } as UnitFile),
      }))
    )
      .then((results) => {
        if (!mounted) return;
        setUnitImages((prev) => {
          const next = { ...prev };
          for (const r of results) if (r.url) next[r.id] = r.url;
          return next;
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [recommendations]);

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

      {/* Customer requirements — optional lead selection that powers smarter
          recommendations (budget, type, project/developer preferences). */}
      <div className="card-base !p-3">
        <p className="label-base flex items-center gap-1.5 mb-2">
          <UserRound size={12} className="text-primary" />
          Customer
          <span className="text-muted-foreground font-normal text-[11px]">
            (optional — recommendations use their requirements)
          </span>
        </p>
        {selectedLead ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-xl px-3 py-2 text-sm font-semibold">
              <UserRound size={14} />
              {selectedLead.name || 'Lead'}
            </span>
            {[
              Number(selectedLead.budgetMin) > 0 || Number(selectedLead.budgetMax) > 0
                ? `Budget EGP ${fmt(Number(selectedLead.budgetMin) || 0)}–${fmt(Number(selectedLead.budgetMax) || 0)}`
                : '',
              selectedLead.propertyType ? String(selectedLead.propertyType) : '',
              selectedLead.developer ? `Dev: ${selectedLead.developer}` : '',
              selectedLead.project ? `Proj: ${selectedLead.project}` : '',
            ]
              .filter(Boolean)
              .map((chip) => (
                <span
                  key={chip}
                  className="text-[11px] font-medium text-foreground bg-muted rounded-full px-2.5 py-1"
                >
                  {chip}
                </span>
              ))}
            <button
              type="button"
              onClick={() => setSelectedLead(null)}
              className="ml-auto btn-ghost !h-8 !px-2 !text-xs"
            >
              <X size={12} /> Clear
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search a lead by name or phone…"
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              className="input-base !pl-8"
            />
            {leadQuery.trim() && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-modal overflow-hidden max-h-56 overflow-y-auto">
                {filteredLeads.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No leads found</p>
                ) : (
                  filteredLeads.slice(0, 8).map((l: any) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => pickLead(l)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground truncate">
                          {l.name || '—'}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {l.phone}
                          {Number(l.budgetMax) > 0
                            ? ` · Budget EGP ${fmt(Number(l.budgetMax))}`
                            : ''}
                        </span>
                      </span>
                      <UserPlus size={14} className="text-primary shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
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
            'bg-teal',
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

      {/* Recommended matching units from inventory */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Building2 size={15} className="text-primary" />
            Recommended units
          </span>
          <span className="flex items-center gap-2">
            {selectedLead && (
              <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                <Target size={10} /> Scored for {selectedLead.name || 'lead'}
              </span>
            )}
            {loadingUnits && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </span>
        </div>
        {!result.valid ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Enter a price per m² and an area to see matching units.
          </div>
        ) : recommendations.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No matching units found yet — add units from the Projects screen.
          </div>
        ) : (
          <div className="p-3 grid sm:grid-cols-2 gap-3">
            {recommendations.map(({ unit, score, reasons }) => {
              const proj = projects[unit.projectId];
              const sellingPoint = proj?.sellingPoints?.[0] || unit.notes || '';
              return (
                <div key={unit.id} className="card-base !p-0 overflow-hidden flex flex-col h-full">
                  <button
                    type="button"
                    onClick={() => setDetailsUnit({ unit, matchPct: score, reasons })}
                    className="relative block w-full aspect-[16/9] overflow-hidden bg-muted"
                    aria-label={`View ${unit.name} details`}
                  >
                    {unitImages[unit.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={unitImages[unit.id]}
                        alt={unit.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
                        <Building2 size={28} className="text-primary/50" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white">
                        <Target size={10} /> {score}%
                      </span>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          unit.status === 'Available'
                            ? 'bg-emerald-500 text-white'
                            : unit.status === 'Reserved'
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-500 text-white'
                        }`}
                      >
                        {unit.status}
                      </span>
                    </div>
                  </button>
                  <div className="p-3.5 flex flex-col gap-2 flex-1">
                    <div>
                      <p className="text-sm font-semibold text-foreground truncate">{unit.name}</p>
                      <p className="text-[11px] font-semibold text-primary truncate">
                        {unit.projectName || '—'}
                        {proj?.developerName ? ` · ${proj.developerName}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {unit.unitType && <span>{unit.unitType}</span>}
                      {Number(unit.area) > 0 && <span>{unit.area} m²</span>}
                      {Number(unit.floor) > 0 && <span>Floor {unit.floor}</span>}
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-base font-bold text-foreground tabular-nums">
                        EGP {fmt(Number(unit.price) || 0)}
                      </p>
                      {(Number(unit.downPaymentPct) > 0 || Number(unit.installmentYears) > 0) && (
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 truncate max-w-[55%]">
                          {Number(unit.downPaymentPct) > 0 ? `${unit.downPaymentPct}% down` : ''}
                          {Number(unit.downPaymentPct) > 0 && Number(unit.installmentYears) > 0
                            ? ' · '
                            : ''}
                          {Number(unit.installmentYears) > 0 ? `${unit.installmentYears} yrs` : ''}
                        </span>
                      )}
                    </div>
                    {sellingPoint && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {sellingPoint}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailsUnit({ unit, matchPct: score, reasons })}
                      className="btn-primary mt-auto flex items-center justify-center gap-1.5 !h-8 !text-xs"
                    >
                      <Eye size={13} /> Quick details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recommended unit quick details */}
      {detailsUnit && (
        <RecommendedUnitDetailsModal
          unit={detailsUnit.unit}
          project={projects[detailsUnit.unit.projectId] || null}
          matchPct={detailsUnit.matchPct}
          reasons={detailsUnit.reasons}
          lead={selectedLead}
          leads={leads}
          imageUrl={unitImages[detailsUnit.unit.id]}
          onClose={() => setDetailsUnit(null)}
        />
      )}
    </div>
  );
}

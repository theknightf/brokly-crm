'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import {
  Loader2,
  Building2,
  RefreshCw,
  ChevronDown,
  Check,
  User,
  Phone,
  Mail,
  MapPin,
  Flag,
  CalendarDays,
  Users,
  StickyNote,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { storablePhone } from '@/lib/phone';
import { FIELD, SELECT, SelectChevron, FieldLabel, IconWrap, FormSection, ChipGroup, SectionTabs } from './leadFormUi';
import { parseLeadNotes, mergeLeadNotes } from '@/lib/leadNotes';
import {
  Lead,
  LeadStatus,
  LeadSource,
  PropertyType,
  ALL_STATUSES,
  ALL_SOURCES,
  ALL_PROPERTY_TYPES,
} from './mockLeads';
import { projectsService, teamsService, teamService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { unitsService, leadSourcesService } from '@/lib/services/crmService';

interface EditLeadFormData {
  name: string;
  phone: string;
  phone2: string;
  email: string;
  location: string;
  propertyType: PropertyType;
  budgetRange: string;
  source: LeadSource;
  agent: string;
  assignedTo: string;
  status: LeadStatus;
  followUpDue: string;
  notes: string;
  leadRating: string;
  priority: string;
  team: string;
  csAgent: string;
  project: string;
  developer: string;
  unitId: string;
  totalPrice: number;
  downPayment: number;
  reservationAmount: number;
  maintenanceFees: number;
  installmentCount: number;
  installmentFrequency: number;
  paymentStartDate: string;
  paymentStatus: string;
  reservationDate: string;
  closingDate: string;
  finalPrice: number;
  commission: number;
}

interface EditLeadFormProps {
  lead: Lead;
  onSubmit: (lead: Lead) => void;
  onCancel: () => void;
}

const PAYMENT_STATUSES = ['Not Started', 'In Progress', 'Completed'];
const PRIORITIES = ['Normal', 'Medium', 'High', 'Urgent'];
const RATINGS = ['', 'Hot', 'Warm', 'Cold', 'VIP'];

const money = (v: any) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const budgetRangeValue = (min?: number, max?: number) => {
  if (min == null && max == null) return '';
  if (min != null && max != null) return `${min} - ${max}`;
  if (min != null) return `${min} -`;
  return `- ${max}`;
};

const parseBudgetRange = (value: string) => {
  const cleaned = value.replace(/[,\u00a0]/g, ' ').trim();
  if (!cleaned) return { budgetMin: undefined, budgetMax: undefined };
  const parts = cleaned
    .split(/[-–]/)
    .map((part) => Number(part.trim().replace(/[^\d.]/g, '')))
    .filter((n) => !Number.isNaN(n));
  return {
    budgetMin: parts[0] ?? undefined,
    budgetMax: parts[1] ?? undefined,
  };
};

export default function EditLeadForm({ lead, onSubmit, onCancel }: EditLeadFormProps) {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const canEditSource =
    isAdminRole(profile?.role || user?.role) ||
    profile?.role === 'manager' ||
    user?.role === 'manager';
  const [sourceList, setSourceList] = useState<{ id: string; name: string }[]>([]);
  // The note box shows only what a person wrote; the call lines the apps recorded are listed below it and kept on save.
  const parsedNotes = useMemo(() => parseLeadNotes(lead.notes), [lead.notes]);
  const [projects, setProjects] = useState<
    { id: string; name: string; developerId: string | null; developerName: string }[]
  >([]);
  const [projectUnits, setProjectUnits] = useState<any[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    if (lead.assignedToIds && lead.assignedToIds.length > 0) {
      return lead.assignedToIds.slice(0, 2);
    }
    return lead.assignedTo ? [lead.assignedTo] : [];
  });

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        const next = prev.filter((id) => id !== userId);
        setValue('assignedTo', next[0] || '');
        return next;
      }
      if (prev.length >= 2) return prev; // max 2 assignees
      const next = [...prev, userId];
      setValue('assignedTo', next[0] || '');
      return next;
    });
  };

  const availableSources = useMemo(() => {
    const seen = new Set<string>();
    const list: { id?: string; name: string }[] = [];
    if (lead.source) {
      seen.add(lead.source.trim().toLowerCase());
      list.push({ name: lead.source });
    }
    sourceList.forEach((s) => {
      const lower = s.name.trim().toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(s);
      }
    });
    ALL_SOURCES.forEach((s) => {
      const lower = s.trim().toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push({ id: '', name: s });
      }
    });
    return list;
  }, [sourceList, lead.source]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
      nameRef.current?.focus();
    }
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<EditLeadFormData>({
    defaultValues: {
      name: lead.name || '',
      phone: lead.phone || '',
      phone2: lead.phone2 || '',
      email: lead.email || '',
      location: lead.location || '',
      propertyType: (lead.propertyType as PropertyType) || '2BHK Apartment',
      budgetRange: budgetRangeValue(lead.budgetMin, lead.budgetMax),
      source: (lead.source as LeadSource) || 'Facebook Ads',
      agent: lead.agent || '',
      assignedTo: lead.assignedTo || '',
      status: (lead.status as LeadStatus) || 'Fresh Leads',
      followUpDue: lead.followUpDue || '',
      notes: parsedNotes.humanText,
      leadRating: lead.leadRating || '',
      priority: lead.priority || 'Normal',
      team: lead.team || '',
      csAgent: lead.csAgent || '',
      project: lead.project || '',
      developer: lead.developer || '',
      unitId: lead.unitId || '',
      totalPrice: lead.totalPrice || lead.unitPrice || 0,
      downPayment: lead.downPayment || 0,
      reservationAmount: lead.reservationAmount || 0,
      maintenanceFees: lead.maintenanceFees || 0,
      installmentCount: lead.installmentCount || 0,
      installmentFrequency: lead.installmentFrequency || 12,
      paymentStartDate: lead.paymentStartDate || '',
      paymentStatus: lead.paymentStatus || 'Not Started',
      reservationDate: lead.reservationDate || '',
      closingDate: lead.closingDate || '',
      finalPrice: lead.finalPrice || 0,
      commission: lead.commission || 0,
    },
  });

  useEffect(() => {
    Promise.all([
      projectsService.getAll().catch(() => []),
      teamService.getAll().catch(() => []),
      teamsService.getAssignableUsers().catch(() => []),
      teamsService.getAll().catch(() => []),
      leadSourcesService.getActive().catch(() => []),
    ]).then(([projectData, teamData, assignableUsers, teamsData, sourcesData]) => {
      setProjects(
        (projectData as any[]).map((p) => ({
          id: p.id,
          name: p.name,
          developerId: p.developerId || null,
          developerName: p.developerName || '',
        }))
      );
      const userNames = (assignableUsers as any[]).map((u) => u.name?.trim()).filter(Boolean);
      const activeAgents = (teamData as any[]).filter((m) => m.status === 'Active').map((m) => m.name?.trim()).filter(Boolean);
      const combined = Array.from(new Set([...userNames, ...activeAgents])).sort((a, b) => a.localeCompare(b));
      setAgents(combined);
      setUsers((assignableUsers as any[]).map((u) => ({ id: u.id, name: u.name })));
      setTeams((teamsData as any[]).map((t) => ({ id: t.id, name: t.name })));
      setSourceList((sourcesData as any[]).map((s: any) => ({ id: s.id, name: s.name })));
    });
  }, []);

  const totalPrice = watch('totalPrice');
  const downPayment = watch('downPayment');
  const reservationAmount = watch('reservationAmount');
  const maintenanceFees = watch('maintenanceFees');
  const installmentCount = watch('installmentCount');
  const installmentFrequency = watch('installmentFrequency');
  const selectedProject = watch('project');
  const selectedUnitId = watch('unitId');

  // ── Unit picker ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProject) {
      setProjectUnits([]);
      setValue('unitId', '');
      return;
    }
    setLoadingUnits(true);
    const proj = projects.find((p) => p.name === selectedProject);
    unitsService
      .getAll(proj?.id || undefined)
      .then((data) => {
        if (selectedProject !== watch('project')) return;
        setProjectUnits(data || []);
        // If the lead already points at a unit in this project, keep it selected.
        if (lead.unitId && !watch('unitId')) setValue('unitId', lead.unitId);
      })
      .catch(() => setProjectUnits([]))
      .finally(() => setLoadingUnits(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  // Auto-fill payment-plan fields from the selected unit (editable afterwards).
  const handleUnitSelect = (unitId: string) => {
    setValue('unitId', unitId);
    const unit = projectUnits.find((u) => u.id === unitId);
    if (!unit) return;
    setValue('totalPrice', money(unit.price));
    setValue('installmentFrequency', Number(unit.installmentFrequency || 12));
    if (unit.installmentYears) {
      setValue(
        'installmentCount',
        Number(unit.installmentYears) * (12 / Number(unit.installmentFrequency || 12))
      );
    }
  };

  // Live recompute: down-payment %, remaining amount, installment amount.
  const plan = useMemo(() => {
    const total = money(totalPrice);
    const down = money(downPayment);
    const reserv = money(reservationAmount);
    const count = money(installmentCount);
    const remaining = Math.max(0, total - down - reserv);
    return {
      downPct: total > 0 ? Math.round((down / total) * 10000) / 100 : 0,
      remaining,
      installment: count > 0 ? remaining / count : 0,
    };
  }, [totalPrice, downPayment, reservationAmount, installmentCount]);

  const formatNumber = (v: number) => (v ? v.toLocaleString() : '0');

  const onFormSubmit = async (data: EditLeadFormData) => {
    const unit = projectUnits.find((u) => u.id === data.unitId);
    const { budgetMin, budgetMax } = parseBudgetRange(data.budgetRange);
    const primaryId = selectedUserIds[0] || data.assignedTo || '';
    const assignedNames = selectedUserIds
      .map((id) => users.find((u) => u.id === id)?.name)
      .filter(Boolean) as string[];
    const primaryAgentName = assignedNames[0] || data.agent || '';
    const matchedSource = sourceList.find(
      (s) => s.name.trim().toLowerCase() === String(data.source || '').trim().toLowerCase()
    );
    const updated: Lead & { leadSourceId?: string | null } = {
      ...lead,
      name: data.name,
      phone: storablePhone(data.phone) || data.phone,
      phone2: storablePhone(data.phone2 || '') || '',
      email: data.email,
      location: data.location,
      propertyType: data.propertyType,
      budgetMin,
      budgetMax,
      source: canEditSource ? (data.source || lead.source) : lead.source,
      leadSourceId: canEditSource
        ? (matchedSource?.id || lead.leadSourceId || null)
        : lead.leadSourceId,
      agent: primaryAgentName || data.agent,
      agentInitials: (primaryAgentName || data.agent)
        ? (primaryAgentName || data.agent)
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : lead.agentInitials || '',
      status: data.status,
      assignedTo: primaryId || undefined,
      assignedToName: assignedNames.length > 0
        ? assignedNames.join(' & ')
        : (primaryId ? lead.assignedToName : undefined),
      assignedToIds: selectedUserIds,
      assignedToNames: assignedNames,
      assignees: selectedUserIds.map((id) => ({
        userId: id,
        userName: users.find((u) => u.id === id)?.name || null,
      })),
      followUpDue: data.followUpDue || undefined,
      notes: mergeLeadNotes(parsedNotes, data.notes || ''),
      developer: data.developer || undefined,
      project: data.project || undefined,
      leadRating: data.leadRating || '',
      priority: data.priority || 'Normal',
      team: data.team || '',
      csAgent: data.csAgent || '',
      unitId: data.unitId || null,
      unitArea: unit ? money(unit.area) : lead.unitArea,
      unitPrice: unit ? money(unit.price) : lead.unitPrice,
      totalPrice: money(data.totalPrice),
      downPayment: money(data.downPayment),
      downPaymentPct: plan.downPct,
      installmentAmount: Math.round(plan.installment * 100) / 100,
      installmentCount: money(data.installmentCount),
      installmentFrequency: money(data.installmentFrequency) || 12,
      paymentStartDate: data.paymentStartDate || '',
      reservationAmount: money(data.reservationAmount),
      maintenanceFees: money(data.maintenanceFees),
      remainingAmount: Math.round(plan.remaining * 100) / 100,
      paymentStatus: data.paymentStatus || 'Not Started',
      reservationDate: data.reservationDate || '',
      closingDate: data.closingDate || '',
      finalPrice: money(data.finalPrice),
      commission: money(data.commission),
    };
    onSubmit(updated);
  };

  const nameField = register('name');
  const priority = watch('priority');
  const leadRating = watch('leadRating');

  const tabs = [
    { id: 'edit-sec-contact', label: t('leadEdit.tabContact') },
    { id: 'edit-sec-stage', label: t('leadEdit.tabStage') },
    { id: 'edit-sec-team', label: t('leadEdit.tabTeam') },
    { id: 'edit-sec-deal', label: t('leadEdit.tabDeal') },
    { id: 'edit-sec-notes', label: t('leadEdit.tabNotes') },
  ];

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 px-4 pb-6 sm:px-6">
        <SectionTabs tabs={tabs} label={t('leadEdit.sections')} />

        {/* ── Contact ── */}
        <FormSection id="edit-sec-contact" icon={<User size={16} />} title={t('leadEdit.tabContact')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="edit-name">{t('leadForm.name')}</FieldLabel>
              <IconWrap icon={<User size={18} />}>
                <input
                  id="edit-name"
                  type="text"
                  autoComplete="name"
                  className={`${FIELD} ps-11`}
                  placeholder="Ahmed Hassan"
                  {...nameField}
                  ref={(el) => {
                    nameField.ref(el);
                    nameRef.current = el;
                  }}
                />
              </IconWrap>
            </div>
            <div>
              <FieldLabel htmlFor="edit-phone">{t('leadForm.phone')}</FieldLabel>
              <IconWrap icon={<Phone size={18} />} physicalLeft>
                <input
                  id="edit-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  className={`${FIELD} ps-11 font-mono-data tracking-wide`}
                  placeholder="010 1234 5678"
                  {...register('phone')}
                />
              </IconWrap>
            </div>
            <div>
              <FieldLabel htmlFor="edit-email" optionalText={t('leadForm.optional')}>{t('leadForm.email')}</FieldLabel>
              <IconWrap icon={<Mail size={18} />}>
                <input
                  id="edit-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={`${FIELD} ps-11`}
                  placeholder="ahmed@email.com"
                  {...register('email')}
                />
              </IconWrap>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="edit-phone2" optionalText={t('leadForm.optional')}>{t('leadForm.phone2')}</FieldLabel>
              <IconWrap icon={<Phone size={18} />} physicalLeft>
                <input
                  id="edit-phone2"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  className={`${FIELD} ps-11 font-mono-data tracking-wide`}
                  placeholder="+971 50 123 4567"
                  {...register('phone2')}
                />
              </IconWrap>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="edit-location" optionalText={t('leadForm.optional')}>{t('leadForm.location')}</FieldLabel>
              <IconWrap icon={<MapPin size={18} />}>
                <input
                  id="edit-location"
                  type="text"
                  autoComplete="address-level2"
                  className={`${FIELD} ps-11`}
                  placeholder="Cairo / New Cairo"
                  list="edit-cities"
                  {...register('location')}
                />
              </IconWrap>
              <datalist id="edit-cities">
                {Array.from(
                  new Set(projects.map((p) => p.developerName).concat(projects.map((p) => p.name)).filter(Boolean))
                ).map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
          </div>
        </FormSection>

        {/* ── Stage, next action, priority, rating, source ── */}
        <FormSection id="edit-sec-stage" icon={<Flag size={16} />} title={t('leadEdit.tabStage')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="edit-status">{t('leadForm.status')}</FieldLabel>
              <div className="relative">
                <select id="edit-status" className={SELECT} {...register('status')}>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="edit-followup" optionalText={t('leadForm.optional')}>{t('leadForm.followUp')}</FieldLabel>
              <IconWrap icon={<CalendarDays size={18} />}>
                <input id="edit-followup" type="date" className={`${FIELD} ps-11`} {...register('followUpDue')} />
              </IconWrap>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>{t('leadEdit.priority')}</FieldLabel>
              <ChipGroup
                label={t('leadEdit.priority')}
                value={priority || 'Normal'}
                onChange={(v) => setValue('priority', v, { shouldDirty: true })}
                options={PRIORITIES.map((p) => ({ value: p, label: t(`leadEdit.priority${p}`) }))}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>{t('leadEdit.rating')}</FieldLabel>
              <ChipGroup
                label={t('leadEdit.rating')}
                value={leadRating || ''}
                onChange={(v) => setValue('leadRating', v, { shouldDirty: true })}
                options={RATINGS.map((r) => ({ value: r, label: r ? t(`leadEdit.rating${r}`) : t('leadEdit.ratingNone') }))}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel
                htmlFor="edit-source"
                action={
                  !canEditSource ? (
                    <span className="text-[11px] font-medium text-muted-foreground">{t('leadEdit.readOnly')}</span>
                  ) : undefined
                }
              >
                {t('leadForm.source')}
              </FieldLabel>
              {canEditSource ? (
                <div className="relative">
                  <select id="edit-source" className={SELECT} {...register('source')}>
                    {availableSources.map((s) => (
                      <option key={`edit-source-${s.id || s.name}`} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              ) : (
                <div className={`${FIELD} flex cursor-not-allowed select-none items-center bg-muted/50 text-muted-foreground`}>
                  {lead.source || '—'}
                </div>
              )}
            </div>
          </div>
        </FormSection>

        {/* ── Assignment & team ── */}
        <FormSection
          id="edit-sec-team"
          icon={<Users size={16} />}
          title={t('leadEdit.tabTeam')}
          hint={t('leadEdit.assignHint')}
        >
          <FieldLabel
            action={<span className="text-xs font-medium text-muted-foreground">{t('leadForm.assignCount', { n: selectedUserIds.length })}</span>}
          >
            {t('leadForm.assignTo')}
          </FieldLabel>
          {users.length === 0 ? (
            <p className="rounded-xl bg-muted/40 py-3 text-center text-xs text-muted-foreground">{t('leadEdit.noAgents')}</p>
          ) : (
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
              {users.map((u) => {
                const on = selectedUserIds.includes(u.id);
                const disabled = !on && selectedUserIds.length >= 2;
                return (
                  <button
                    type="button"
                    key={u.id}
                    disabled={disabled}
                    onClick={() => toggleUser(u.id)}
                    aria-pressed={on}
                    className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 text-start text-sm transition-colors ${
                      on
                        ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
                        : disabled
                          ? 'cursor-not-allowed border-border/50 text-muted-foreground opacity-40'
                          : 'border-border/70 text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                        aria-hidden
                      >
                        {(u.name || '?').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{u.name}</span>
                    </span>
                    {on && <Check size={16} className="shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="edit-team" optionalText={t('leadForm.optional')}>{t('leadEdit.team')}</FieldLabel>
              <div className="relative">
                <select id="edit-team" className={SELECT} {...register('team')}>
                  <option value="">{t('leadEdit.noTeam')}</option>
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.name}>
                      {tm.name}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="edit-cs" optionalText={t('leadForm.optional')}>{t('leadEdit.csAgent')}</FieldLabel>
              <input id="edit-cs" type="text" className={FIELD} placeholder={t('leadEdit.csAgentPh')} {...register('csAgent')} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="edit-agent" optionalText={t('leadForm.optional')}>{t('leadEdit.agentName')}</FieldLabel>
              <input id="edit-agent" type="text" list="edit-agents" className={FIELD} {...register('agent')} />
              <datalist id="edit-agents">
                {agents.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-muted-foreground">{t('leadEdit.agentNameHint')}</p>
            </div>
          </div>
        </FormSection>

        {/* ── Unit, payment plan and deal (collapsed until needed) ── */}
        <FormSection
          id="edit-sec-deal"
          icon={<Building2 size={16} />}
          title={t('leadEdit.tabDeal')}
          hint={t('leadEdit.dealHint')}
        >
          <button
            type="button"
            onClick={() => setShowPlan((v) => !v)}
            aria-expanded={showPlan}
            className={`flex min-h-[48px] w-full items-center justify-between rounded-xl border px-4 text-sm font-semibold transition-colors ${
              showPlan ? 'border-primary/40 bg-primary/5 text-foreground' : 'border-dashed border-border bg-muted/30 text-foreground hover:bg-muted/60'
            }`}
          >
            <span>{showPlan ? t('leadEdit.hidePlan') : t('leadEdit.showPlan')}</span>
            <ChevronDown size={18} className={`text-muted-foreground transition-transform ${showPlan ? 'rotate-180' : ''}`} />
          </button>

          {showPlan && (
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="edit-project">{t('leadForm.project')}</FieldLabel>
                  <div className="relative">
                    <select
                      id="edit-project"
                      className={SELECT}
                      {...register('project')}
                      onChange={(e) => {
                        setValue('project', e.target.value);
                        setValue('unitId', '');
                        const proj = projects.find((p) => p.name === e.target.value);
                        if (proj) setValue('developer', proj.developerName || lead.developer || '');
                      }}
                    >
                      <option value="">{t('leadEdit.noProject')}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="edit-unit" action={loadingUnits ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : undefined}>
                    {t('leadEdit.unit')}
                  </FieldLabel>
                  <div className="relative">
                    <select
                      id="edit-unit"
                      className={SELECT}
                      value={selectedUnitId}
                      onChange={(e) => handleUnitSelect(e.target.value)}
                      disabled={!selectedProject || projectUnits.length === 0}
                    >
                      <option value="">
                        {!selectedProject
                          ? t('leadEdit.pickProjectFirst')
                          : projectUnits.length === 0
                            ? t('leadEdit.noUnits')
                            : t('leadEdit.pickUnit')}
                      </option>
                      {projectUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {money(u.area)} m² — EGP {money(u.price).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                  {selectedUnitId && (
                    <button
                      type="button"
                      onClick={() => {
                        const unit = projectUnits.find((u) => u.id === selectedUnitId);
                        if (unit) handleUnitSelect(unit.id);
                      }}
                      className="mt-1.5 flex min-h-[32px] items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <RefreshCw size={12} /> {t('leadEdit.refillFromUnit')}
                    </button>
                  )}
                </div>

                <MoneyField id="edit-total" label={t('leadEdit.totalPrice')} reg={register('totalPrice')} />
                <MoneyField
                  id="edit-down"
                  label={t('leadEdit.downPayment')}
                  reg={register('downPayment')}
                  aside={<span className="text-xs font-semibold text-primary">{plan.downPct}%</span>}
                />
                <MoneyField id="edit-count" label={t('leadEdit.installmentCount')} reg={register('installmentCount')} plain />
                <div>
                  <FieldLabel htmlFor="edit-freq">{t('leadEdit.frequency')}</FieldLabel>
                  <div className="relative">
                    <select id="edit-freq" className={SELECT} {...register('installmentFrequency')}>
                      <option value={12}>{t('leadEdit.freqMonthly')}</option>
                      <option value={4}>{t('leadEdit.freqQuarterly')}</option>
                      <option value={2}>{t('leadEdit.freqSemi')}</option>
                      <option value={1}>{t('leadEdit.freqAnnual')}</option>
                    </select>
                    <SelectChevron />
                  </div>
                </div>
                <MoneyField id="edit-reserve" label={t('leadEdit.reservationAmount')} reg={register('reservationAmount')} />
                <MoneyField id="edit-maint" label={t('leadEdit.maintenance')} reg={register('maintenanceFees')} />
                <div>
                  <FieldLabel htmlFor="edit-paystart">{t('leadEdit.paymentStart')}</FieldLabel>
                  <input id="edit-paystart" type="date" className={FIELD} {...register('paymentStartDate')} />
                </div>
                <div>
                  <FieldLabel htmlFor="edit-paystatus">{t('leadEdit.paymentStatus')}</FieldLabel>
                  <div className="relative">
                    <select id="edit-paystatus" className={SELECT} {...register('paymentStatus')}>
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>
              </div>

              {/* Live plan summary */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { k: t('leadEdit.remaining'), v: `EGP ${formatNumber(Math.round(plan.remaining))}` },
                  { k: t('leadEdit.installment'), v: `EGP ${formatNumber(Math.round(plan.installment))}` },
                  { k: t('leadEdit.downPct'), v: `${plan.downPct}%` },
                  {
                    k: t('leadEdit.perYear'),
                    v: money(installmentCount) > 0 ? String(Math.round((12 / money(installmentFrequency)) * 100) / 100) : '—',
                  },
                ].map((s) => (
                  <div key={s.k} className="rounded-xl bg-muted/50 p-3">
                    <p className="text-[11px] text-muted-foreground">{s.k}</p>
                    <p className="text-sm font-bold tabular-nums text-foreground" dir="ltr">
                      {s.v}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4">
                <p className="mb-3 text-sm font-bold text-foreground">{t('leadEdit.dealTitle')}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="edit-resdate">{t('leadEdit.reservationDate')}</FieldLabel>
                    <input id="edit-resdate" type="date" className={FIELD} {...register('reservationDate')} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="edit-closedate">{t('leadEdit.closingDate')}</FieldLabel>
                    <input id="edit-closedate" type="date" className={FIELD} {...register('closingDate')} />
                  </div>
                  <MoneyField id="edit-final" label={t('leadEdit.finalPrice')} reg={register('finalPrice')} />
                  <MoneyField id="edit-comm" label={t('leadEdit.commission')} reg={register('commission')} />
                </div>
              </div>
            </div>
          )}
        </FormSection>

        {/* ── Notes ── */}
        <FormSection id="edit-sec-notes" icon={<StickyNote size={16} />} title={t('leadEdit.tabNotes')}>
          <textarea
            id="edit-notes"
            rows={4}
            dir="auto"
            className="input-base w-full resize-y border-border/80 text-base sm:text-sm"
            placeholder={t('leadEdit.notesPh')}
            {...register('notes')}
          />
          {parsedNotes.log.length > 0 && (
            <details className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2" open={parsedNotes.log.length <= 3}>
              <summary className="min-h-[36px] cursor-pointer py-1.5 text-xs font-semibold text-foreground">
                {t('leadEdit.callLog', { n: parsedNotes.log.length })}{' '}
                <span className="font-normal text-muted-foreground">· {t('leadEdit.callLogKept')}</span>
              </summary>
              <ul className="mt-2 space-y-1.5">
                {parsedNotes.log.map((e, i) => (
                  <li key={i} className="rounded-lg bg-card px-2.5 py-1.5">
                    <p className="text-xs font-semibold text-foreground">{e.title}</p>
                    <p className="text-[11px] text-muted-foreground">{e.time}</p>
                    {e.detail && (
                      <p className="mt-0.5 text-xs text-foreground" dir="auto">
                        {e.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </FormSection>
      </div>

      {/* Sticky actions: one row on phones (Save takes the width), right-aligned on larger screens. */}
      <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:justify-end sm:px-6">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost min-h-[48px] rounded-xl px-4 text-sm font-medium sm:min-h-[44px]"
        >
          {t('leadForm.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-press inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-105 active:scale-95 disabled:opacity-60 sm:min-h-[44px] sm:flex-none"
        >
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
          {t('leadEdit.save')}
        </button>
      </div>
    </form>
  );
}

/** Number field for amounts: numeric keypad on phones, value kept as a number by react-hook-form. */
function MoneyField({
  id,
  label,
  reg,
  aside,
  plain,
}: {
  id: string;
  label: string;
  reg: UseFormRegisterReturn;
  aside?: React.ReactNode;
  plain?: boolean;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} action={aside}>
        {label}
      </FieldLabel>
      <div className="relative">
        <input id={id} type="number" min="0" inputMode="decimal" dir="ltr" className={`${FIELD} ${plain ? '' : 'pr-14'} tabular-nums`} {...reg} />
        {!plain && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground" aria-hidden>
            EGP
          </span>
        )}
      </div>
    </div>
  );
}

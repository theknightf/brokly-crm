'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, Hash, Building2, RefreshCw } from 'lucide-react';
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
import { unitsService } from '@/lib/services/crmService';

interface EditLeadFormData {
  name: string;
  phone: string;
  email: string;
  location: string;
  propertyType: PropertyType;
  budgetMin: number;
  budgetMax: number;
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

export default function EditLeadForm({ lead, onSubmit, onCancel }: EditLeadFormProps) {
  const [projects, setProjects] = useState<
    { id: string; name: string; developerId: string | null; developerName: string }[]
  >([]);
  const [projectUnits, setProjectUnits] = useState<any[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

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
      email: lead.email || '',
      location: lead.location || '',
      propertyType: (lead.propertyType as PropertyType) || '2BHK Apartment',
      budgetMin: lead.budgetMin ?? undefined,
      budgetMax: lead.budgetMax ?? undefined,
      source: (lead.source as LeadSource) || 'Facebook Ads',
      agent: lead.agent || '',
      assignedTo: lead.assignedTo || '',
      status: (lead.status as LeadStatus) || 'Fresh Leads',
      followUpDue: lead.followUpDue || '',
      notes: lead.notes || '',
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
    ]).then(([projectData, teamData, assignableUsers, teamsData]) => {
      setProjects(
        (projectData as any[]).map((p) => ({
          id: p.id,
          name: p.name,
          developerId: p.developerId || null,
          developerName: p.developerName || '',
        }))
      );
      setAgents((teamData as any[]).filter((m) => m.status === 'Active').map((m) => m.name));
      setUsers((assignableUsers as any[]).map((u) => ({ id: u.id, name: u.name })));
      setTeams((teamsData as any[]).map((t) => ({ id: t.id, name: t.name })));
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
    const assignedUser = users.find((u) => u.id === data.assignedTo);
    const updated: Lead = {
      ...lead,
      name: data.name,
      phone: data.phone,
      email: data.email,
      location: data.location,
      propertyType: data.propertyType,
      budgetMin: data.budgetMin ? money(data.budgetMin) : undefined,
      budgetMax: data.budgetMax ? money(data.budgetMax) : undefined,
      source: data.source,
      agent: data.agent,
      agentInitials: data.agent
        ? data.agent
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : lead.agentInitials || '',
      status: data.status,
      assignedTo: data.assignedTo || undefined,
      assignedToName: assignedUser?.name || (data.assignedTo ? lead.assignedToName : undefined),
      followUpDue: data.followUpDue || undefined,
      notes: data.notes || '',
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

  const selectClass = 'input-base appearance-none pr-8';

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
      <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
        {/* Lead ID badge */}
        {lead.leadNumber && (
          <div className="flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 rounded-lg px-3 py-2 w-fit">
            <Hash size={13} />
            {lead.leadNumber}
          </div>
        )}

        {/* Section 1: Contact Information */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
              1
            </div>
            <h3 className="text-sm font-semibold text-foreground">Contact Information</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label-base">Full name</label>
              <input
                type="text"
                className="input-base"
                placeholder="Ahmed Hassan"
                {...register('name')}
              />
            </div>
            <div>
              <label className="label-base">Phone number</label>
              <input
                type="tel"
                className="input-base"
                placeholder="+20 10 0000 0000"
                {...register('phone')}
              />
            </div>
            <div>
              <label className="label-base">Email address</label>
              <input
                type="email"
                className="input-base"
                placeholder="ahmed@email.com"
                {...register('email')}
              />
            </div>
            <div>
              <label className="label-base">City / Region</label>
              <input
                type="text"
                className="input-base"
                placeholder="Cairo"
                {...register('location')}
              />
            </div>
            <div>
              <label className="label-base">Property type</label>
              <select className={selectClass} {...register('propertyType')}>
                {ALL_PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Budget min (EGP)</label>
              <input
                type="number"
                min="0"
                className="input-base"
                placeholder="500000"
                {...register('budgetMin')}
              />
            </div>
            <div>
              <label className="label-base">Budget max (EGP)</label>
              <input
                type="number"
                min="0"
                className="input-base"
                placeholder="1200000"
                {...register('budgetMax')}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Section 2: Classification & Assignment */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Classification &amp; Assignment
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Lead status</label>
              <select className={selectClass} {...register('status')}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Source</label>
              <select className={selectClass} {...register('source')}>
                {ALL_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Priority</label>
              <select className={selectClass} {...register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Lead rating</label>
              <select className={selectClass} {...register('leadRating')}>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r || 'No rating'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Follow-up due</label>
              <input type="date" className="input-base" {...register('followUpDue')} />
            </div>
            <div>
              <label className="label-base">Assign to user</label>
              <select className={selectClass} {...register('assignedTo')}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Agent</label>
              <input
                type="text"
                list="edit-agents"
                className="input-base"
                placeholder="Agent name"
                {...register('agent')}
              />
              <datalist id="edit-agents">
                {agents.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label-base">Team</label>
              <select className={selectClass} {...register('team')}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">CS agent</label>
              <input
                type="text"
                className="input-base"
                placeholder="CS agent name"
                {...register('csAgent')}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Section 3: Unit & Payment Plan */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
              3
            </div>
            <h3 className="text-sm font-semibold text-foreground">Unit &amp; Payment Plan</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Project</label>
              <select
                className={selectClass}
                {...register('project')}
                onChange={(e) => {
                  setValue('project', e.target.value);
                  setValue('unitId', '');
                  const proj = projects.find((p) => p.name === e.target.value);
                  if (proj) setValue('developer', proj.developerName || lead.developer || '');
                }}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base flex items-center gap-1.5">
                Unit
                {loadingUnits && (
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                )}
              </label>
              <select
                className={selectClass}
                value={selectedUnitId}
                onChange={(e) => handleUnitSelect(e.target.value)}
                disabled={!selectedProject || projectUnits.length === 0}
              >
                <option value="">
                  {!selectedProject
                    ? 'Select a project first'
                    : projectUnits.length === 0
                      ? 'No units in this project'
                      : 'Select a unit'}
                </option>
                {projectUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {money(u.area)} m² — EGP {money(u.price).toLocaleString()}
                  </option>
                ))}
              </select>
              {selectedUnitId && (
                <button
                  type="button"
                  onClick={() => {
                    const unit = projectUnits.find((u) => u.id === selectedUnitId);
                    if (unit) handleUnitSelect(unit.id);
                  }}
                  className="mt-1.5 text-[11px] text-primary flex items-center gap-1 hover:underline"
                >
                  <RefreshCw size={10} /> Refill from unit
                </button>
              )}
            </div>
            <div>
              <label className="label-base">Total price (EGP)</label>
              <input type="number" min="0" className="input-base" {...register('totalPrice')} />
            </div>
            <div>
              <label className="label-base">
                Down payment (EGP)
                <span className="ml-2 text-xs font-medium text-primary">{plan.downPct}%</span>
              </label>
              <input type="number" min="0" className="input-base" {...register('downPayment')} />
            </div>
            <div>
              <label className="label-base">Installment count</label>
              <input
                type="number"
                min="0"
                className="input-base"
                {...register('installmentCount')}
              />
            </div>
            <div>
              <label className="label-base">Installment frequency</label>
              <select className={selectClass} {...register('installmentFrequency')}>
                <option value={12}>Monthly</option>
                <option value={4}>Quarterly</option>
                <option value={2}>Semi-annual</option>
                <option value={1}>Annual</option>
              </select>
            </div>
            <div>
              <label className="label-base">Reservation amount (EGP)</label>
              <input
                type="number"
                min="0"
                className="input-base"
                {...register('reservationAmount')}
              />
            </div>
            <div>
              <label className="label-base">Maintenance fees (EGP)</label>
              <input
                type="number"
                min="0"
                className="input-base"
                {...register('maintenanceFees')}
              />
            </div>
            <div>
              <label className="label-base">Payment start date</label>
              <input type="date" className="input-base" {...register('paymentStartDate')} />
            </div>
            <div>
              <label className="label-base">Payment status</label>
              <select className={selectClass} {...register('paymentStatus')}>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live plan summary */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-[11px] text-muted-foreground">Remaining</p>
              <p className="text-sm font-semibold tabular-nums">
                EGP {formatNumber(Math.round(plan.remaining))}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-[11px] text-muted-foreground">Installment</p>
              <p className="text-sm font-semibold tabular-nums">
                EGP {formatNumber(Math.round(plan.installment))}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-[11px] text-muted-foreground">Down %</p>
              <p className="text-sm font-semibold tabular-nums">{plan.downPct}%</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-[11px] text-muted-foreground">Per year</p>
              <p className="text-sm font-semibold tabular-nums">
                {money(installmentCount) > 0
                  ? `${Math.round((12 / money(installmentFrequency)) * 100) / 100} installments`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Section 4: Reservation / Deal */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
              4
            </div>
            <h3 className="text-sm font-semibold text-foreground">Reservation / Done Deal</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Reservation date</label>
              <input type="date" className="input-base" {...register('reservationDate')} />
            </div>
            <div>
              <label className="label-base">Closing date</label>
              <input type="date" className="input-base" {...register('closingDate')} />
            </div>
            <div>
              <label className="label-base">Final price (EGP)</label>
              <input type="number" min="0" className="input-base" {...register('finalPrice')} />
            </div>
            <div>
              <label className="label-base">Commission (EGP)</label>
              <input type="number" min="0" className="input-base" {...register('commission')} />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Section 5: Notes */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
              5
            </div>
            <h3 className="text-sm font-semibold text-foreground">Notes</h3>
          </div>
          <textarea
            rows={3}
            className="input-base w-full"
            placeholder="Notes about this lead…"
            {...register('notes')}
          />
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary flex items-center gap-2"
        >
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}
          Save changes
        </button>
      </div>
    </form>
  );
}

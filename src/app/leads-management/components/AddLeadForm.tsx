'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, ChevronDown } from 'lucide-react';
import {
  Lead,
  LeadStatus,
  LeadSource,
  PropertyType,
  ALL_STATUSES,
  ALL_SOURCES,
  ALL_PROPERTY_TYPES,
} from './mockLeads';
import { projectsService, teamService, teamsService } from '@/lib/services/crmService';

interface AddLeadFormData {
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
  developer: string;
  project: string;
}

interface AddLeadFormProps {
  onSubmit: (lead: Lead) => void;
  onCancel: () => void;
  initialData?: Partial<Lead>;
}

let leadCounter = 13;

function AccordionSection({
  num,
  title,
  open,
  onToggle,
  children,
}: {
  num: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="btn-press w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors active:scale-[0.99]"
      >
        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
          {num}
        </span>
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AddLeadForm({ onSubmit, onCancel, initialData }: AddLeadFormProps) {
  const [selectedDeveloperId, setSelectedDeveloperId] = useState('');
  const [agentList, setAgentList] = useState<string[]>([]);
  const [userList, setUserList] = useState<{ id: string; name: string }[]>([]);
  const [developers, setDevelopers] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<
    { id: string; name: string; developerId: string; status: string }[]
  >([]);
  const [showDetails, setShowDetails] = useState(false);
  const [openSection, setOpenSection] = useState<'dev' | 'prop' | 'pipe' | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus only on devices with a precise pointer (mouse/trackpad).
    // On touch devices this would pop the keyboard and push the modal under it.
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
      phoneRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    Promise.all([
      teamService.getAll().catch(() => []),
      projectsService.getAll().catch(() => []),
      teamsService.getAssignableUsers().catch(() => []),
    ]).then(([teamData, projectData, assignableUsers]) => {
      const activeAgents = (teamData as any[])
        .filter((m) => m.status === 'Active')
        .map((m) => m.name);
      setAgentList(activeAgents);

      const devMap = new Map<string, string>();
      (projectData as any[]).forEach((p) => {
        if (p.developerName) devMap.set(p.developerId || p.developerName, p.developerName);
      });
      setDevelopers(Array.from(devMap.entries()).map(([id, name]) => ({ id, name })));
      setProjects(
        (projectData as any[]).map((p) => ({
          id: p.id,
          name: p.name,
          developerId: p.developerId || p.developerName,
          status: p.status,
        }))
      );

      setUserList(
        (assignableUsers as { id: string; name: string }[]).map((u) => ({
          id: u.id,
          name: u.name,
        }))
      );
    });
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddLeadFormData>({
    defaultValues: {
      status: (initialData?.status as LeadStatus) || 'Fresh Leads',
      source: (initialData?.source as LeadSource) || 'Facebook Ads',
      agent: initialData?.agent || '',
      assignedTo: initialData?.assignedTo || '',
      propertyType: (initialData?.propertyType as PropertyType) || '2BHK Apartment',
      developer: initialData?.developer || '',
      project: initialData?.project || '',
      name: initialData?.name || '',
      phone: initialData?.phone || '',
      email: initialData?.email || '',
      location: initialData?.location || '',
      budgetMin: initialData?.budgetMin || undefined,
      budgetMax: initialData?.budgetMax || undefined,
      followUpDue: initialData?.followUpDue || '',
      notes: initialData?.notes || '',
    },
  });

  const budgetMin = watch('budgetMin');

  const filteredProjects = selectedDeveloperId
    ? projects.filter((p) => p.developerId === selectedDeveloperId && p.status === 'Active')
    : [];

  const handleDeveloperChange = (devId: string) => {
    setSelectedDeveloperId(devId);
    const dev = developers.find((d) => d.id === devId);
    setValue('developer', dev?.name ?? '');
    setValue('project', '');
  };

  const onFormSubmit = async (data: AddLeadFormData) => {
    const today = new Date().toISOString().split('T')[0];
    const assignedUser = userList.find((u) => u.id === data.assignedTo);
    const newLead: Lead = {
      id: `lead-${String(leadCounter++).padStart(3, '0')}`,
      name: data.name,
      phone: data.phone,
      email: data.email,
      location: data.location,
      propertyType: data.propertyType,
      budgetMin: data.budgetMin ? Number(data.budgetMin) : undefined,
      budgetMax: data.budgetMax ? Number(data.budgetMax) : undefined,
      source: data.source,
      agent: data.agent,
      agentInitials: data.agent
        ? data.agent
            .split(' ')
            .map((p) => p[0])
            .join('')
        : '',
      status: data.status,
      assignedTo: data.assignedTo || undefined,
      assignedToName: assignedUser?.name,
      lastContact: today,
      followUpDue: data.followUpDue || undefined,
      createdAt: today,
      notes: data.notes || '',
      developer: data.developer || undefined,
      project: data.project || undefined,
    };
    onSubmit(newLead);
  };

  const selectClass = (hasError: boolean) =>
    `input-base appearance-none pr-8 ${hasError ? 'border-red-400' : ''}`;

  const phoneField = register('phone', {
    required: 'Phone number is required',
    minLength: { value: 7, message: 'Enter a valid phone number' },
  });

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
      <div className="px-6 py-5 space-y-5 pop-in">
        {/* Phone — always visible, first for speed */}
        <div>
          <label htmlFor="add-phone" className="label-base">
            Phone number
          </label>
          <input
            id="add-phone"
            type="tel"
            className={`input-base text-base ${errors.phone ? 'border-red-400' : ''}`}
            placeholder="+20 10 0000 0000"
            {...phoneField}
            ref={(el) => {
              phoneField.ref(el);
              phoneRef.current = el;
            }}
          />
          {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
        </div>

        {/* Expandable extra details */}
        <div
          className={`grid transition-all duration-300 ease-out ${
            showDetails ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-5 pt-1">
              {/* Quick contact fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="add-name" className="label-base">
                    Full name{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="add-name"
                    type="text"
                    className={`input-base ${errors.name ? 'border-red-400' : ''}`}
                    placeholder="Ahmed Hassan"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-email" className="label-base">
                    Email address{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="add-email"
                    type="email"
                    className={`input-base ${errors.email ? 'border-red-400' : ''}`}
                    placeholder="ahmed@email.com"
                    {...register('email', {
                      pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
                    })}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-location" className="label-base">
                    City / Location{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="add-location"
                    type="text"
                    className={`input-base ${errors.location ? 'border-red-400' : ''}`}
                    placeholder="Cairo"
                    {...register('location')}
                  />
                  {errors.location && (
                    <p className="mt-1 text-xs text-red-500">{errors.location.message}</p>
                  )}
                </div>
              </div>

              {/* Accordion sections */}
              <AccordionSection
                num={2}
                title="Developer & Project"
                open={openSection === 'dev'}
                onToggle={() => setOpenSection(openSection === 'dev' ? null : 'dev')}
              >
                <div>
                  <label htmlFor="add-developer" className="label-base">
                    Developer{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-developer"
                      className="input-base appearance-none pr-8"
                      value={selectedDeveloperId}
                      onChange={(e) => handleDeveloperChange(e.target.value)}
                    >
                      <option value="">— Select Developer —</option>
                      {developers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="add-project" className="label-base">
                    Project{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-project"
                      className={`input-base appearance-none pr-8 ${
                        !selectedDeveloperId ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={!selectedDeveloperId}
                      {...register('project')}
                    >
                      <option value="">
                        {selectedDeveloperId
                          ? filteredProjects.length === 0
                            ? 'No active projects'
                            : '— Select Project —'
                          : 'Select a developer first'}
                      </option>
                      {filteredProjects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection
                num={3}
                title="Property Requirements"
                open={openSection === 'prop'}
                onToggle={() => setOpenSection(openSection === 'prop' ? null : 'prop')}
              >
                <div>
                  <label htmlFor="add-proptype" className="label-base">
                    Property type{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-proptype"
                      className={selectClass(!!errors.propertyType)}
                      {...register('propertyType')}
                    >
                      {ALL_PROPERTY_TYPES.map((p) => (
                        <option key={`add-prop-${p}`} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                  {errors.propertyType && (
                    <p className="mt-1 text-xs text-red-500">{errors.propertyType.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-budgetmin" className="label-base">
                    Budget min <span className="text-muted-foreground font-normal">(ج.م)</span>{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="add-budgetmin"
                    type="number"
                    min={1}
                    className={`input-base font-mono-data ${
                      errors.budgetMin ? 'border-red-400' : ''
                    }`}
                    placeholder="500000"
                    {...register('budgetMin', {
                      min: { value: 1, message: 'Must be at least 1 ج.م' },
                      valueAsNumber: true,
                    })}
                  />
                  {errors.budgetMin && (
                    <p className="mt-1 text-xs text-red-500">{errors.budgetMin.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-budgetmax" className="label-base">
                    Budget max <span className="text-muted-foreground font-normal">(ج.م)</span>{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="add-budgetmax"
                    type="number"
                    min={1}
                    className={`input-base font-mono-data ${
                      errors.budgetMax ? 'border-red-400' : ''
                    }`}
                    placeholder="800000"
                    {...register('budgetMax', {
                      min: { value: 1, message: 'Must be at least 1 ج.م' },
                      valueAsNumber: true,
                      validate: (val) =>
                        !budgetMin ||
                        !val ||
                        val >= Number(budgetMin) ||
                        'Max must be ≥ min budget',
                    })}
                  />
                  {errors.budgetMax && (
                    <p className="mt-1 text-xs text-red-500">{errors.budgetMax.message}</p>
                  )}
                </div>
              </AccordionSection>

              <AccordionSection
                num={4}
                title="Pipeline & Assignment"
                open={openSection === 'pipe'}
                onToggle={() => setOpenSection(openSection === 'pipe' ? null : 'pipe')}
              >
                <div>
                  <label htmlFor="add-source" className="label-base">
                    Lead source{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-source"
                      className={selectClass(!!errors.source)}
                      {...register('source')}
                    >
                      {ALL_SOURCES.map((s) => (
                        <option key={`add-source-${s}`} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                  {errors.source && (
                    <p className="mt-1 text-xs text-red-500">{errors.source.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-status" className="label-base">
                    Lead status / stage{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-status"
                      className={selectClass(!!errors.status)}
                      {...register('status')}
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={`add-status-${s}`} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                  {errors.status && (
                    <p className="mt-1 text-xs text-red-500">{errors.status.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-agent" className="label-base">
                    Agent name{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-agent"
                      className={selectClass(!!errors.agent)}
                      {...register('agent')}
                    >
                      <option value="">— Select Agent —</option>
                      {agentList.map((a) => (
                        <option key={`add-agent-${a}`} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                  {errors.agent && (
                    <p className="mt-1 text-xs text-red-500">{errors.agent.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-assignedto" className="label-base">
                    Assign to user{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Admin: any user · Team leader: own team only
                  </p>
                  <div className="relative">
                    <select
                      id="add-assignedto"
                      className="input-base appearance-none pr-8"
                      {...register('assignedTo')}
                    >
                      <option value="">— Unassigned —</option>
                      {userList.map((u) => (
                        <option key={`add-user-${u.id}`} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="add-followup" className="label-base">
                    First follow-up date{' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="add-followup"
                    type="date"
                    className={`input-base ${errors.followUpDue ? 'border-red-400' : ''}`}
                    {...register('followUpDue')}
                  />
                  {errors.followUpDue && (
                    <p className="mt-1 text-xs text-red-500">{errors.followUpDue.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="add-notes" className="label-base">
                    Notes
                  </label>
                  <textarea
                    id="add-notes"
                    rows={3}
                    className="input-base resize-none"
                    placeholder="e.g. Interested in Palm Hills New Cairo, wants 3BR unit, flexible on payment plan"
                    {...register('notes')}
                  />
                </div>
              </AccordionSection>
            </div>
          </div>
        </div>

        {/* Toggle link */}
        <button
          type="button"
          onClick={() => {
            setShowDetails((v) => !v);
            if (!showDetails) setOpenSection('dev');
          }}
          className="btn-press inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline active:scale-[0.97] transition-transform"
        >
          <ChevronDown
            size={15}
            className={`transition-transform duration-300 ${showDetails ? 'rotate-180' : ''}`}
          />
          {showDetails ? 'Hide extra details' : 'Add more details'}
        </button>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-10 bg-card border-t border-border px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-b-2xl">
        <p className="text-xs text-muted-foreground hidden sm:block">
          Only a phone number is required — everything else is optional
        </p>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary btn-press flex-1 sm:flex-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-press flex items-center gap-2 min-w-[130px] justify-center flex-1 sm:flex-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Adding lead…</span>
              </>
            ) : (
              'Add lead'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

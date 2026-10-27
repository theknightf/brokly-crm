'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  Loader2,
  ChevronDown,
  Plus,
  UserCheck,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAdminRole } from '@/lib/roles';
import {
  Lead,
  LeadStatus,
  LeadSource,
  PropertyType,
  ALL_STATUSES,
  ALL_SOURCES,
  ALL_PROPERTY_TYPES,
} from './mockLeads';
import {
  projectsService,
  teamService,
  teamsService,
  leadSourcesService,
} from '@/lib/services/crmService';
import { duplicateLeadsService } from '@/lib/services/peopleOpsService';
import {
  formatEgyptianPhone,
  phoneCanonicalKey,
  phoneToStore,
  phoneDigits,
  caretAfterDigits,
} from './leadPhone';

interface AddLeadFormData {
  name: string;
  phone: string;
  email: string;
  location: string;
  propertyType: PropertyType;
  budgetMin?: number;
  budgetMax?: number;
  source: LeadSource;
  agent: string;
  assignedTo: string;
  referralTo: string;
  status: LeadStatus;
  followUpDue: string;
  notes: string;
  developer: string;
  project: string;
}

/** Shape returned by duplicateLeadsService.findByPhone(). */
interface DuplicateMatch {
  id: string;
  name: string;
  phone: string;
  status: string;
  createdBy: string;
  createdAt: string;
  assignedTo: string;
  matches: number;
}

interface AddLeadFormProps {
  /**
   * `options.keepOpen` is true for "Save & add another" — the modal stays open
   * and the form resets instead of closing.
   * Resolve to `false` to signal a failed save so the form keeps the input.
   */
  onSubmit: (
    lead: Lead,
    options?: { keepOpen?: boolean }
  ) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  initialData?: Partial<Lead>;
}

let leadCounter = 13;

/**
 * Session memory — survives closing and reopening the modal, so a sales agent
 * adding lead after lead does not have to re-pick the same source/stage.
 */
let lastUsedSource = '';
let lastUsedStatus = '';

const DEFAULT_SOURCE: LeadSource = 'Facebook Ads';
const DEFAULT_STATUS: LeadStatus = 'Fresh Leads';

/**
 * Height (px) of the on-screen keyboard, derived from the Visual Viewport API.
 * Used to lift the sticky submit row so the keyboard never covers it.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setInset((prev) => (Math.abs(prev - overlap) > 1 ? overlap : prev));
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}

/** Small chevron used on select elements, anchored to the inline-end edge. */
function SelectChevron() {
  return (
    <ChevronDown
      size={14}
      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
    />
  );
}

export default function AddLeadForm({ onSubmit, onCancel, initialData }: AddLeadFormProps) {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = isAdminRole(profile?.role) || profile?.role === 'manager';
  const [selectedDeveloperId, setSelectedDeveloperId] = useState('');
  const [agentList, setAgentList] = useState<string[]>([]);
  const [userList, setUserList] = useState<{ id: string; name: string }[]>([]);
  const [sourceList, setSourceList] = useState<{ id: string; name: string }[]>([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [creatingSource, setCreatingSource] = useState(false);
  const [showAddSourceInput, setShowAddSourceInput] = useState(false);
  const [developers, setDevelopers] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<
    { id: string; name: string; developerId: string; status: string }[]
  >([]);
  const [showDetails, setShowDetails] = useState(false);
  const [referralEnabled, setReferralEnabled] = useState(Boolean(initialData?.referredTo));
  const [dupState, setDupState] = useState<{ checking: boolean; existing: DuplicateMatch | null }>({
    checking: false,
    existing: null,
  });
  const phoneRef = useRef<HTMLInputElement>(null);
  const dupSeqRef = useRef(0);
  const submitModeRef = useRef<'single' | 'another'>('single');
  const selfAssignIdRef = useRef('');
  const selfAssignNameRef = useRef('');
  const autoAssignDoneRef = useRef(false);
  const keyboardInset = useKeyboardInset();

  const currentUserId = profile?.id || user?.id || '';

  /** Initial + reset values. `source`/`status` fall back to the session memory. */
  const makeDefaults = useCallback(
    (src?: string, st?: string): AddLeadFormData => ({
      name: initialData?.name || '',
      phone: initialData?.phone || '',
      email: initialData?.email || '',
      location: initialData?.location || '',
      propertyType: (initialData?.propertyType as PropertyType) || '2BHK Apartment',
      budgetMin: initialData?.budgetMin || undefined,
      budgetMax: initialData?.budgetMax || undefined,
      source: (src ||
        (initialData?.source as LeadSource) ||
        (lastUsedSource as LeadSource) ||
        DEFAULT_SOURCE) as LeadSource,
      agent: initialData?.agent || '',
      assignedTo: initialData?.assignedTo || '',
      referralTo: initialData?.referredTo || '',
      status: (st ||
        (initialData?.status as LeadStatus) ||
        (lastUsedStatus as LeadStatus) ||
        DEFAULT_STATUS) as LeadStatus,
      followUpDue: initialData?.followUpDue || '',
      notes: initialData?.notes || '',
      developer: initialData?.developer || '',
      project: initialData?.project || '',
    }),
    [initialData]
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddLeadFormData>({
    mode: 'onTouched',
    defaultValues: makeDefaults(),
  });

  const assignedTo = watch('assignedTo');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    if (initialData?.assignedToIds && initialData.assignedToIds.length > 0) {
      return initialData.assignedToIds.slice(0, 2);
    }
    return initialData?.assignedTo ? [initialData.assignedTo] : [];
  });

  // Autofocus the Phone field immediately on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      phoneRef.current?.focus({ preventScroll: true });
      phoneRef.current?.scrollIntoView({ block: 'nearest' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    Promise.all([
      teamService.getAll().catch(() => []),
      projectsService.getAll().catch(() => []),
      teamsService.getAssignableUsers().catch(() => []),
      leadSourcesService.getActive().catch(() => []),
    ]).then(([teamData, projectData, assignableUsers, sources]) => {
      const userNames = (assignableUsers as { id: string; name: string }[])
        .map((u) => u.name?.trim())
        .filter(Boolean);
      const activeAgents = (teamData as any[])
        .filter((m) => m.status === 'Active')
        .map((m) => m.name?.trim())
        .filter(Boolean);
      const combinedAgents = Array.from(new Set([...userNames, ...activeAgents])).sort((a, b) =>
        a.localeCompare(b)
      );
      setAgentList(combinedAgents);

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

      const users = (assignableUsers as { id: string; name: string }[]).map((u) => ({
        id: u.id,
        name: u.name,
      }));
      setUserList(users);
      setSourceList((sources as any[]).map((s: any) => ({ id: s.id, name: s.name })));
    });
  }, []);

  // Default the assignee to the current user (unless caller preset one)
  useEffect(() => {
    if (autoAssignDoneRef.current) return;
    if (!userList.length || !currentUserId) return;
    autoAssignDoneRef.current = true;

    const me = userList.find((u) => u.id === currentUserId);
    if (!me) return;
    if (initialData?.assignedToIds?.length || initialData?.assignedTo) return;

    selfAssignIdRef.current = me.id;
    selfAssignNameRef.current = me.name || '';
    setSelectedUserIds([me.id]);
    setValue('assignedTo', me.id);
    if (!initialData?.agent && agentList.includes(me.name)) setValue('agent', me.name);
  }, [userList, agentList, currentUserId, initialData, setValue]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        const next = prev.filter((id) => id !== userId);
        setValue('assignedTo', next[0] || '');
        return next;
      }
      if (prev.length >= 2) return prev;
      const next = [...prev, userId];
      setValue('assignedTo', next[0] || '');
      return next;
    });
  };

  const filteredProjects = selectedDeveloperId
    ? projects.filter((p) => p.developerId === selectedDeveloperId && p.status === 'Active')
    : [];

  const handleDeveloperChange = (devId: string) => {
    setSelectedDeveloperId(devId);
    const dev = developers.find((d) => d.id === devId);
    setValue('developer', dev?.name ?? '');
    setValue('project', '');
  };

  /** Inline duplicate check — never blocks saving, warns agent */
  const checkDuplicate = async (value: string) => {
    const digits = phoneDigits(value);
    if (digits.length < 8) {
      setDupState({ checking: false, existing: null });
      return;
    }
    const key = phoneCanonicalKey(value);
    const seq = ++dupSeqRef.current;
    setDupState({ checking: true, existing: null });
    try {
      const found = await duplicateLeadsService.findByPhone(key);
      if (seq !== dupSeqRef.current) return;
      if (!found || phoneCanonicalKey(found.phone || '') !== key) {
        setDupState({ checking: false, existing: null });
        return;
      }
      setDupState({ checking: false, existing: found as DuplicateMatch });
    } catch {
      if (seq === dupSeqRef.current) setDupState({ checking: false, existing: null });
    }
  };

  const handlePhoneChange = (raw: string, caret: number) => {
    const digitsBefore = phoneDigits(raw.slice(0, caret)).length;
    const next = formatEgyptianPhone(raw);
    if (dupState.existing) setDupState({ checking: false, existing: null });
    return { value: next, caret: caretAfterDigits(next, digitsBefore) };
  };

  const onFormSubmit = async (data: AddLeadFormData) => {
    const mode = submitModeRef.current;
    const today = new Date().toISOString().split('T')[0];
    const primaryId = selectedUserIds[0] || data.assignedTo || '';
    const assignedNames = selectedUserIds
      .map((id) => userList.find((u) => u.id === id)?.name)
      .filter(Boolean) as string[];
    const primaryAgentName = assignedNames[0] || data.agent || '';
    const matchedSource =
      sourceList.find(
        (s) => s.name.trim().toLowerCase() === String(data.source || '').trim().toLowerCase()
      ) ||
      sourceList.find((s) => s.id === (data.source as any)) ||
      null;
    const leadSourceId = matchedSource?.id || null;
    const cleanPhone = phoneToStore(data.phone);
    // Name is optional — falls back to phone number as requested
    const fallbackName = cleanPhone || 'New Lead';
    const cleanName = (data.name || '').trim() || fallbackName;

    const newLead: Lead & { leadSourceId?: string | null } = {
      id: `lead-${String(leadCounter++).padStart(3, '0')}`,
      name: cleanName,
      phone: cleanPhone,
      email: (data.email || '').trim(),
      location: data.location || '',
      propertyType: data.propertyType,
      budgetMin: data.budgetMin ? Number(data.budgetMin) : undefined,
      budgetMax: data.budgetMax ? Number(data.budgetMax) : undefined,
      source: data.source || initialData?.source || DEFAULT_SOURCE,
      leadSourceId,
      agent: primaryAgentName || data.agent,
      agentInitials:
        primaryAgentName || data.agent
          ? (primaryAgentName || data.agent)
              .split(' ')
              .map((p) => p[0])
              .join('')
          : '',
      status: data.status,
      assignedTo: primaryId || undefined,
      assignedToName: assignedNames.length > 0 ? assignedNames.join(' & ') : undefined,
      assignedToIds: selectedUserIds,
      assignedToNames: assignedNames,
      assignees: selectedUserIds.map((id) => ({
        userId: id,
        userName: userList.find((u) => u.id === id)?.name || null,
      })),
      referredTo: data.referralTo || null,
      referredBy: data.referralTo ? profile?.id || null : null,
      referredToName: userList.find((u) => u.id === data.referralTo)?.name || null,
      referredByName: data.referralTo ? profile?.full_name || profile?.fullName || null : null,
      lastContact: today,
      followUpDue: data.followUpDue || undefined,
      createdAt: today,
      notes: data.notes || '',
      developer: data.developer || undefined,
      project: data.project || undefined,
    };

    const result = await onSubmit(newLead, { keepOpen: mode === 'another' });
    if (result === false) return;

    lastUsedSource = data.source || '';
    lastUsedStatus = data.status || '';

    if (mode !== 'another') return;

    reset({
      name: '',
      phone: '',
      email: '',
      location: '',
      propertyType: data.propertyType,
      budgetMin: undefined,
      budgetMax: undefined,
      source: data.source,
      agent: selfAssignNameRef.current || '',
      assignedTo: selfAssignIdRef.current || '',
      referralTo: '',
      status: data.status,
      followUpDue: '',
      notes: '',
      developer: '',
      project: '',
    });
    setSelectedUserIds(selfAssignIdRef.current ? [selfAssignIdRef.current] : []);
    setReferralEnabled(false);
    setSelectedDeveloperId('');
    setShowDetails(false);
    setDupState({ checking: false, existing: null });
    dupSeqRef.current += 1;

    window.setTimeout(() => {
      phoneRef.current?.focus({ preventScroll: true });
      phoneRef.current?.scrollIntoView({ block: 'nearest' });
    }, 60);
  };

  /** Enter anywhere (except a textarea) submits the form */
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    submitModeRef.current = 'single';
    void handleSubmit(onFormSubmit)();
  };

  const createNewSource = async () => {
    const name = newSourceName.trim();
    if (!name || creatingSource) return;
    setCreatingSource(true);
    try {
      const created = await leadSourcesService.create(name);
      setSourceList((prev) =>
        [...prev, { id: created.id, name: created.name }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setValue('source', created.name as LeadSource, { shouldValidate: true, shouldDirty: true });
      setNewSourceName('');
      setShowAddSourceInput(false);
      toast.success(t('leadForm.sourceAdded', { name: created.name }));
    } catch (e: any) {
      toast.error(e?.message || t('leadForm.sourceFailed'));
    } finally {
      setCreatingSource(false);
    }
  };

  // Merge database sources with standard canonical sources, preserving IDs when available
  const sourcesToDisplay = useMemo(() => {
    const seen = new Set<string>();
    const list: { id?: string; name: string }[] = [];
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
  }, [sourceList]);

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      onKeyDown={handleFormKeyDown}
      noValidate
      className="w-full max-w-md mx-auto flex flex-col justify-between min-h-full"
    >
      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* ── 1. Phone (Required, autofocus, type="tel", inputMode="numeric") ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="add-phone"
              className="text-xs font-semibold text-foreground flex items-center gap-1"
            >
              <span>{t('leadForm.phone')}</span>
              <span className="text-red-500">*</span>
            </label>
            <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5 tracking-wide">
              {t('leadForm.required')}
            </span>
          </div>

          <Controller
            name="phone"
            control={control}
            rules={{
              required: t('leadForm.phoneRequired'),
              minLength: { value: 7, message: t('leadForm.phoneInvalid') },
            }}
            render={({ field, fieldState }) => (
              <>
                <input
                  id="add-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="010 1234 5678"
                  value={field.value || ''}
                  onChange={(e) => {
                    const el = e.target;
                    const caret = el.selectionStart ?? el.value.length;
                    const next = handlePhoneChange(el.value, caret);
                    field.onChange(next.value);
                    window.requestAnimationFrame(() => {
                      const node = phoneRef.current;
                      if (!node) return;
                      try {
                        node.setSelectionRange(next.caret, next.caret);
                      } catch {
                        /* ignore */
                      }
                    });
                  }}
                  onBlur={(e) => {
                    field.onBlur();
                    void checkDuplicate(e.target.value);
                  }}
                  ref={(el) => {
                    field.ref(el);
                    phoneRef.current = el;
                  }}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={
                    fieldState.error
                      ? 'add-phone-error'
                      : dupState.existing
                        ? 'add-phone-duplicate'
                        : undefined
                  }
                  className={`input-base text-base font-mono-data h-12 min-h-[44px] ${
                    fieldState.error
                      ? 'border-red-400 focus:border-red-500 ring-1 ring-red-400/20'
                      : 'border-border/80 focus:border-primary'
                  }`}
                />
                {fieldState.error && (
                  <p id="add-phone-error" className="mt-1 text-xs text-red-500 font-medium">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />

          {/* Inline duplicate warning */}
          {dupState.existing ? (
            <div
              id="add-phone-duplicate"
              role="status"
              className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle size={13} className="flex-shrink-0" />
                {t('leadForm.duplicateTitle')}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                {t('leadForm.duplicateBody', {
                  name: dupState.existing.name,
                  status: dupState.existing.status,
                  by: dupState.existing.createdBy,
                })}
              </p>
              <a
                href={`/leads/${dupState.existing.id}`}
                className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-primary hover:underline"
              >
                {t('leadForm.openExisting')}
                <ExternalLink size={12} />
              </a>
            </div>
          ) : (
            dupState.checking && (
              <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                {t('leadForm.phoneHint')}
              </p>
            )
          )}
        </div>

        {/* ── 2. Name (Optional) ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label htmlFor="add-name" className="text-xs font-semibold text-foreground">
              {t('leadForm.name')}
            </label>
            <span className="text-[10px] font-normal text-muted-foreground">
              {t('leadForm.optional')}
            </span>
          </div>
          <input
            id="add-name"
            type="text"
            autoComplete="name"
            className="input-base text-sm h-11 min-h-[44px] border-border/80"
            placeholder="Ahmed Hassan"
            {...register('name')}
          />
        </div>

        {/* ── 3. Source (Selectable chips instead of dropdown, single select) ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
              <span>{t('leadForm.source')}</span>
              <span className="text-red-500">*</span>
            </label>
            {!showAddSourceInput && (
              <button
                type="button"
                onClick={() => setShowAddSourceInput(true)}
                className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-0.5"
              >
                <Plus size={11} />
                <span>{t('leadForm.newSource')}</span>
              </button>
            )}
          </div>

          <Controller
            name="source"
            control={control}
            rules={{ required: t('leadForm.sourceRequired') || 'Source is required' }}
            render={({ field }) => (
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label={t('leadForm.source')}
              >
                {sourcesToDisplay.map((s) => {
                  const isSelected = field.value === s.name;
                  return (
                    <button
                      key={`chip-source-${s.id || s.name}`}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => field.onChange(s.name)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5 select-none ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-semibold shadow-sm ring-2 ring-primary/30'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
                      }`}
                    >
                      {isSelected && <Check size={12} className="stroke-[2.5]" />}
                      <span>{s.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          />

          {/* Optional inline input for new custom source */}
          {showAddSourceInput && (
            <div className="flex items-center gap-1.5 mt-2 animate-rise-in">
              <input
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  void createNewSource();
                }}
                placeholder={t('leadForm.newSource')}
                className="input-base h-10 min-h-[44px] text-xs flex-1"
                autoFocus
              />
              <button
                type="button"
                disabled={creatingSource || !newSourceName.trim()}
                onClick={() => void createNewSource()}
                className="min-h-[44px] px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                {creatingSource ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                <span>{t('leadForm.addSource')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddSourceInput(false);
                  setNewSourceName('');
                }}
                className="min-h-[44px] px-2.5 rounded-xl text-muted-foreground hover:bg-muted"
                aria-label={t('leadForm.cancel')}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {errors.source && (
            <p className="mt-1 text-xs text-red-500 font-medium">{errors.source.message}</p>
          )}
        </div>

        {/* ── 4. Assign To (Visible ONLY for admin/manager, otherwise hidden) ── */}
        {isPrivileged && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="add-assignee" className="text-xs font-semibold text-foreground">
                {t('leadForm.assignTo')}
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                {t('leadForm.assignCount', { n: selectedUserIds.length })}
              </span>
            </div>

            {/* Selected assignees badge list */}
            {selectedUserIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedUserIds.map((id) => {
                  const u = userList.find((user) => user.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
                    >
                      <UserCheck size={12} className="text-emerald-500" />
                      <span>{u?.name || 'Agent'}</span>
                      <button
                        type="button"
                        onClick={() => toggleUser(id)}
                        className="hover:text-red-500 ms-0.5 text-muted-foreground p-0.5 rounded"
                        aria-label={t('leadForm.removeAgent', { name: u?.name || 'agent' })}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Agent Select Dropdown */}
            <div className="relative">
              <select
                id="add-assignee"
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleUser(e.target.value);
                }}
                className="input-base appearance-none pe-8 min-h-[44px] text-xs"
              >
                <option value="">
                  {selectedUserIds.length >= 2
                    ? 'Max 2 agents chosen'
                    : t('leadForm.selectAgent')}
                </option>
                {userList.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <option key={`assign-opt-${u.id}`} value={u.id} disabled={isSelected}>
                      {isSelected ? `✓ ${u.name}` : u.name}
                    </option>
                  );
                })}
              </select>
              <SelectChevron />
            </div>
          </div>
        )}

        {/* ── Toggle "More Details" (Collapsed by default) ── */}
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          aria-expanded={showDetails}
          aria-controls="add-more-details-panel"
          className="w-full flex items-center justify-between px-3.5 py-2.5 min-h-[44px] rounded-xl border border-border/70 bg-muted/30 hover:bg-muted/60 text-xs font-semibold text-foreground transition-colors active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-primary" />
            <span>{showDetails ? t('leadForm.hideDetails') : `+ ${t('leadForm.moreDetails')}`}</span>
          </span>
          <ChevronDown
            size={15}
            className={`text-muted-foreground transition-transform duration-200 ${
              showDetails ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* ── Collapsed Content: All other fields (budget, area, property type, notes, etc.) ── */}
        <div
          id="add-more-details-panel"
          className={`grid transition-all duration-300 ease-out ${
            showDetails ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3.5 pt-2 pb-1 border-t border-border/50">
              {/* Status / Stage */}
              <div>
                <label htmlFor="add-status" className="text-xs font-semibold text-foreground block mb-1">
                  {t('leadForm.status')}
                </label>
                <div className="relative">
                  <select
                    id="add-status"
                    autoComplete="off"
                    className="input-base appearance-none pe-8 min-h-[44px] text-xs"
                    {...register('status')}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={`add-status-${s}`} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              </div>

              {/* Email & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-email" className="text-xs font-semibold text-foreground block mb-1">
                    {t('leadForm.email')}{' '}
                    <span className="text-muted-foreground font-normal text-[10px]">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={`input-base min-h-[44px] text-xs ${errors.email ? 'border-red-400' : ''}`}
                    placeholder="ahmed@email.com"
                    {...register('email', {
                      pattern: { value: /^\S+@\S+\.\S+$/, message: t('leadForm.emailInvalid') },
                    })}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500 font-medium">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="add-location" className="text-xs font-semibold text-foreground block mb-1">
                    {t('leadForm.location')}{' '}
                    <span className="text-muted-foreground font-normal text-[10px]">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-location"
                    type="text"
                    autoComplete="address-level2"
                    className="input-base min-h-[44px] text-xs"
                    placeholder="Cairo / New Cairo"
                    {...register('location')}
                  />
                </div>
              </div>

              {/* Developer & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-developer" className="text-xs font-semibold text-foreground block mb-1">
                    {t('leadForm.developer')}{' '}
                    <span className="text-muted-foreground font-normal text-[10px]">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-developer"
                      autoComplete="off"
                      className="input-base appearance-none pe-8 min-h-[44px] text-xs"
                      value={selectedDeveloperId}
                      onChange={(e) => handleDeveloperChange(e.target.value)}
                    >
                      <option value="">{t('leadForm.selectDeveloper')}</option>
                      {developers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>

                <div>
                  <label htmlFor="add-project" className="text-xs font-semibold text-foreground block mb-1">
                    {t('leadForm.project')}{' '}
                    <span className="text-muted-foreground font-normal text-[10px]">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-project"
                      autoComplete="off"
                      className={`input-base appearance-none pe-8 min-h-[44px] text-xs ${
                        !selectedDeveloperId ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={!selectedDeveloperId}
                      {...register('project')}
                    >
                      <option value="">
                        {selectedDeveloperId
                          ? filteredProjects.length === 0
                            ? 'No active projects'
                            : t('leadForm.selectProject')
                          : 'Select a developer first'}
                      </option>
                      {filteredProjects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>
              </div>



              {/* Referral Assignment */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={referralEnabled}
                    onChange={(e) => {
                      setReferralEnabled(e.target.checked);
                      if (!e.target.checked) setValue('referralTo', '');
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-xs font-semibold text-foreground">
                    {t('leadForm.referral')}
                  </span>
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('leadForm.referralHint')}</p>
                {referralEnabled && (
                  <div className="relative mt-2.5 animate-rise-in">
                    <select
                      id="add-referral-to"
                      disabled={!referralEnabled}
                      autoComplete="off"
                      className="input-base appearance-none pe-8 min-h-[44px] text-xs"
                      {...register('referralTo', {
                        required: referralEnabled ? t('leadForm.referralRequired') : false,
                      })}
                    >
                      <option value="">{t('leadForm.selectSecond')}</option>
                      {userList
                        .filter((u) => u.id !== assignedTo)
                        .map((u) => (
                          <option key={`add-referral-${u.id}`} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <SelectChevron />
                    {errors.referralTo && (
                      <p className="mt-1 text-xs text-red-500 font-medium">{errors.referralTo.message}</p>
                    )}
                  </div>
                )}
              </div>

              {/* First Follow-Up Date */}
              <div>
                <label htmlFor="add-followup" className="text-xs font-semibold text-foreground block mb-1">
                  {t('leadForm.followUp')}{' '}
                  <span className="text-muted-foreground font-normal text-[10px]">
                    {t('leadForm.optional')}
                  </span>
                </label>
                <input
                  id="add-followup"
                  type="date"
                  className="input-base min-h-[44px] text-xs"
                  {...register('followUpDue')}
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="add-notes" className="text-xs font-semibold text-foreground block mb-1">
                  {t('leadForm.notes')}
                </label>
                <textarea
                  id="add-notes"
                  rows={2}
                  className="input-base resize-none text-xs"
                  placeholder="e.g. Interested in Palm Hills New Cairo, 3BR unit"
                  {...register('notes')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky Bottom Actions ── */}
      <div
        className="sticky bottom-0 z-10 bg-card/95 backdrop-blur-md border-t border-border px-4 sm:px-6 py-3 flex items-center justify-between gap-2"
        style={{
          bottom: keyboardInset > 0 ? `${keyboardInset}px` : undefined,
          paddingBottom: keyboardInset > 0 ? '12px' : 'max(14px, env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl flex-shrink-0"
        >
          {t('leadForm.cancel')}
        </button>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          <button
            type="submit"
            onClick={() => {
              submitModeRef.current = 'another';
            }}
            disabled={isSubmitting}
            className="btn-secondary min-h-[44px] px-3 py-2 text-xs sm:text-sm font-medium rounded-xl inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            {isSubmitting && submitModeRef.current === 'another' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
            <span className="truncate">{t('leadForm.saveAnother')}</span>
          </button>

          <button
            type="submit"
            onClick={() => {
              submitModeRef.current = 'single';
            }}
            disabled={isSubmitting}
            className="btn-press min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm shadow-md hover:brightness-105 active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            {isSubmitting && submitModeRef.current === 'single' ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{t('leadForm.adding')}</span>
              </>
            ) : (
              <>
                <Check size={14} strokeWidth={2.5} />
                <span>{t('leadForm.addLead')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

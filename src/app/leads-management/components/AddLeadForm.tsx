'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

/** Small chevron used on every select, anchored to the inline-end edge. */
function SelectChevron() {
  return (
    <ChevronDown
      size={14}
      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
    />
  );
}

function AccordionSection({
  num,
  title,
  open,
  onToggle,
  children,
  id,
}: {
  num: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        type="button"
        id={id}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="btn-press w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-muted/40 transition-colors active:scale-[0.99]"
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
        id={`${id}-panel`}
        role="region"
        aria-labelledby={id}
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
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const canEditProtectedFields = isAdminRole(profile?.role);
  const [selectedDeveloperId, setSelectedDeveloperId] = useState('');
  const [agentList, setAgentList] = useState<string[]>([]);
  const [userList, setUserList] = useState<{ id: string; name: string }[]>([]);
  const [sourceList, setSourceList] = useState<{ id: string; name: string }[]>([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [creatingSource, setCreatingSource] = useState(false);
  const [developers, setDevelopers] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<
    { id: string; name: string; developerId: string; status: string }[]
  >([]);
  const [showDetails, setShowDetails] = useState(false);
  const [openSection, setOpenSection] = useState<'contact' | 'dev' | 'prop' | 'pipe' | null>(null);
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

  const budgetMin = watch('budgetMin');
  const assignedTo = watch('assignedTo');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    if (initialData?.assignedToIds && initialData.assignedToIds.length > 0) {
      return initialData.assignedToIds.slice(0, 2);
    }
    return initialData?.assignedTo ? [initialData.assignedTo] : [];
  });

  // Autofocus the first field once the sheet has settled. On touch devices the
  // keyboard opens — the layout below is built so the sticky submit row is
  // lifted above it (see useKeyboardInset) and never covered.
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

  // Default the assignee to the current agent (unless the caller preset one).
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

  // If the stored source list does not contain the remembered/default source,
  // fall back to the closest available one so the select is never out of sync.
  useEffect(() => {
    if (!sourceList.length) return;
    const current = getValues('source');
    if (sourceList.some((s) => s.name === current)) return;
    const preferred =
      sourceList.find((s) => s.name === lastUsedSource)?.name ||
      sourceList.find((s) => s.name === DEFAULT_SOURCE)?.name ||
      sourceList[0].name;
    setValue('source', preferred as LeadSource);
  }, [sourceList, getValues, setValue]);

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

  /** Inline duplicate check — never blocks saving, it only warns. */
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
      // The lookup matches on a LIKE pattern, so confirm the numbers are
      // actually the same before warning the agent.
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
    // A stale warning must not linger once the number changes.
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
      sourceList.find((s) => s.name === data.source) ||
      (ALL_SOURCES.includes(data.source as any) ? ({ id: '', name: data.source } as any) : null);
    const leadSourceId = matchedSource?.id || null;
    // Store the canonical national form ("01012345678") so the existing
    // duplicate lookups keep matching on contiguous digits.
    const cleanPhone = phoneToStore(data.phone);
    const cleanName = (data.name || '').trim() || `Lead (${cleanPhone.slice(-4) || 'New'})`;

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
    // `false` means the save failed — keep what the agent typed.
    if (result === false) return;

    // Remember for the rest of the session.
    lastUsedSource = data.source || '';
    lastUsedStatus = data.status || '';

    if (mode !== 'another') return;

    // "Save & add another": clear everything except the source/stage and the
    // assignee, then get ready for the next number.
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
    setOpenSection(null);
    setDupState({ checking: false, existing: null });
    dupSeqRef.current += 1;

    window.setTimeout(() => {
      phoneRef.current?.focus({ preventScroll: true });
      phoneRef.current?.scrollIntoView({ block: 'nearest' });
    }, 60);
  };

  /** Enter anywhere (except a textarea) submits the form. */
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    submitModeRef.current = 'single';
    void handleSubmit(onFormSubmit)();
  };

  const selectClass = (hasError: boolean) =>
    `input-base appearance-none pe-8 min-h-[44px] ${hasError ? 'border-red-400' : ''}`;

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
      setValue('source', created.name);
      setNewSourceName('');
      toast.success(t('leadForm.sourceAdded', { name: created.name }));
    } catch (e: any) {
      toast.error(e?.message || t('leadForm.sourceFailed'));
    } finally {
      setCreatingSource(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} onKeyDown={handleFormKeyDown} noValidate>
      <div className="px-4 sm:px-6 py-5 space-y-4 pop-in">
        {/* ── Step 1: the three things you always need ─────────────────── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="add-phone"
              className="text-sm font-semibold text-foreground flex items-center gap-1.5"
            >
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                1
              </span>
              {t('leadForm.phone')}
              <span className="text-xs font-normal text-red-500 ms-0.5">*</span>
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
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="010 1234 5678"
                  value={field.value || ''}
                  onChange={(e) => {
                    const el = e.target;
                    const caret = el.selectionStart ?? el.value.length;
                    const next = handlePhoneChange(el.value, caret);
                    field.onChange(next.value);
                    // Keep the cursor where the agent left it.
                    window.requestAnimationFrame(() => {
                      const node = phoneRef.current;
                      if (!node) return;
                      try {
                        node.setSelectionRange(next.caret, next.caret);
                      } catch {
                        /* selection not supported — ignore */
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
                  className={`input-base text-base h-12 scroll-mb-28 ${
                    fieldState.error ? 'border-red-400' : 'border-primary/30 focus:border-primary'
                  }`}
                />
                {fieldState.error && (
                  <p id="add-phone-error" className="mt-1 text-xs text-red-500">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />

          {dupState.existing ? (
            <div
              id="add-phone-duplicate"
              role="status"
              className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle size={13} className="flex-shrink-0" />
                {t('leadForm.duplicateTitle')}
              </p>
              <p className="text-xs text-amber-700 mt-1">
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

        {/* Name */}
        <div>
          <label htmlFor="add-name" className="label-base">
            {t('leadForm.name')}{' '}
            <span className="text-muted-foreground font-normal text-xs">
              {t('leadForm.optional')}
            </span>
          </label>
          <input
            id="add-name"
            type="text"
            autoComplete="name"
            className={`input-base min-h-[44px] scroll-mb-28 ${
              errors.name ? 'border-red-400' : ''
            }`}
            placeholder="Ahmed Hassan"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'add-name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="add-name-error" className="mt-1 text-xs text-red-500">
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Source + status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="add-source" className="label-base">
              {t('leadForm.source')} <span className="text-xs font-normal text-red-500">*</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="relative flex-1 min-w-0">
                <select
                  id="add-source"
                  autoComplete="off"
                  className={selectClass(!!errors.source)}
                  aria-invalid={errors.source ? true : undefined}
                  aria-describedby={errors.source ? 'add-source-error' : undefined}
                  {...register('source', { required: t('leadForm.sourceRequired') })}
                >
                  {sourceList.length
                    ? sourceList.map((s) => (
                        <option key={`quick-source-${s.id}`} value={s.name}>
                          {s.name}
                        </option>
                      ))
                    : ALL_SOURCES.map((s) => (
                        <option key={`quick-source-${s}`} value={s}>
                          {s}
                        </option>
                      ))}
                </select>
                <SelectChevron />
              </div>
              <div className="flex gap-1 sm:w-auto">
                <input
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    e.stopPropagation();
                    void createNewSource();
                  }}
                  placeholder={t('leadForm.newSource')}
                  aria-label={t('leadForm.newSource')}
                  autoComplete="off"
                  className="input-base h-11 text-xs flex-1 sm:w-28 sm:flex-none"
                />
                <button
                  type="button"
                  disabled={creatingSource || !newSourceName.trim()}
                  onClick={() => void createNewSource()}
                  aria-label={t('leadForm.addSource')}
                  className="h-11 min-w-[44px] px-2 rounded-lg bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus size={12} />
                  {creatingSource ? '…' : t('leadForm.addSource')}
                </button>
              </div>
            </div>
            {errors.source && (
              <p id="add-source-error" className="mt-1 text-xs text-red-500">
                {errors.source.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="add-status" className="label-base">
              {t('leadForm.status')}
            </label>
            <div className="relative">
              <select
                id="add-status"
                autoComplete="off"
                className={selectClass(!!errors.status)}
                aria-invalid={errors.status ? true : undefined}
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
            {errors.status && <p className="mt-1 text-xs text-red-500">{errors.status.message}</p>}
          </div>
        </div>

        {/* ── Everything else ──────────────────────────────────────────── */}
        <div
          className={`grid transition-all duration-300 ease-out ${
            showDetails ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 pt-1">
              <AccordionSection
                num={2}
                id="add-section-contact"
                title={t('leadForm.contactDetails')}
                open={openSection === 'contact'}
                onToggle={() => setOpenSection(openSection === 'contact' ? null : 'contact')}
              >
                <div>
                  <label htmlFor="add-email" className="label-base">
                    {t('leadForm.email')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={`input-base min-h-[44px] ${errors.email ? 'border-red-400' : ''}`}
                    placeholder="ahmed@email.com"
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? 'add-email-error' : undefined}
                    {...register('email', {
                      pattern: { value: /^\S+@\S+\.\S+$/, message: t('leadForm.emailInvalid') },
                    })}
                  />
                  {errors.email && (
                    <p id="add-email-error" className="mt-1 text-xs text-red-500">
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-location" className="label-base">
                    {t('leadForm.location')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-location"
                    type="text"
                    autoComplete="address-level2"
                    className={`input-base min-h-[44px] ${errors.location ? 'border-red-400' : ''}`}
                    placeholder="Cairo"
                    aria-invalid={errors.location ? true : undefined}
                    {...register('location')}
                  />
                  {errors.location && (
                    <p className="mt-1 text-xs text-red-500">{errors.location.message}</p>
                  )}
                </div>
              </AccordionSection>

              <AccordionSection
                num={3}
                id="add-section-dev"
                title={t('leadForm.developerProject')}
                open={openSection === 'dev'}
                onToggle={() => setOpenSection(openSection === 'dev' ? null : 'dev')}
              >
                <div>
                  <label htmlFor="add-developer" className="label-base">
                    {t('leadForm.developer')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-developer"
                      autoComplete="off"
                      className="input-base appearance-none pe-8 min-h-[44px]"
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
                  <label htmlFor="add-project" className="label-base">
                    {t('leadForm.project')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-project"
                      autoComplete="off"
                      className={`input-base appearance-none pe-8 min-h-[44px] ${
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
              </AccordionSection>

              <AccordionSection
                num={4}
                id="add-section-prop"
                title={t('leadForm.propertyReq')}
                open={openSection === 'prop'}
                onToggle={() => setOpenSection(openSection === 'prop' ? null : 'prop')}
              >
                <div>
                  <label htmlFor="add-proptype" className="label-base">
                    {t('leadForm.propertyType')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-proptype"
                      autoComplete="off"
                      className={selectClass(!!errors.propertyType)}
                      {...register('propertyType')}
                    >
                      {ALL_PROPERTY_TYPES.map((p) => (
                        <option key={`add-prop-${p}`} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                  {errors.propertyType && (
                    <p className="mt-1 text-xs text-red-500">{errors.propertyType.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-budgetmin" className="label-base">
                    {t('leadForm.budgetMin')}{' '}
                    <span className="text-muted-foreground font-normal">(ج.م)</span>{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-budgetmin"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    dir="ltr"
                    className={`input-base font-mono-data min-h-[44px] ${
                      errors.budgetMin ? 'border-red-400' : ''
                    }`}
                    placeholder="500000"
                    aria-invalid={errors.budgetMin ? true : undefined}
                    {...register('budgetMin', {
                      min: { value: 1, message: t('leadForm.budgetMinInvalid') },
                      valueAsNumber: true,
                    })}
                  />
                  {errors.budgetMin && (
                    <p className="mt-1 text-xs text-red-500">{errors.budgetMin.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-budgetmax" className="label-base">
                    {t('leadForm.budgetMax')}{' '}
                    <span className="text-muted-foreground font-normal">(ج.م)</span>{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-budgetmax"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    dir="ltr"
                    className={`input-base font-mono-data min-h-[44px] ${
                      errors.budgetMax ? 'border-red-400' : ''
                    }`}
                    placeholder="800000"
                    aria-invalid={errors.budgetMax ? true : undefined}
                    {...register('budgetMax', {
                      min: { value: 1, message: t('leadForm.budgetMinInvalid') },
                      valueAsNumber: true,
                      validate: (val) =>
                        !budgetMin ||
                        !val ||
                        val >= Number(budgetMin) ||
                        t('leadForm.budgetMaxInvalid'),
                    })}
                  />
                  {errors.budgetMax && (
                    <p className="mt-1 text-xs text-red-500">{errors.budgetMax.message}</p>
                  )}
                </div>
              </AccordionSection>

              <AccordionSection
                num={5}
                id="add-section-pipe"
                title={t('leadForm.pipeline')}
                open={openSection === 'pipe'}
                onToggle={() => setOpenSection(openSection === 'pipe' ? null : 'pipe')}
              >
                <div>
                  <label htmlFor="add-agent" className="label-base">
                    {t('leadForm.agent')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="add-agent"
                      autoComplete="off"
                      className={selectClass(!!errors.agent)}
                      {...register('agent')}
                    >
                      <option value="">{t('leadForm.selectAgent')}</option>
                      {agentList.map((a) => (
                        <option key={`add-agent-${a}`} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                  {errors.agent && (
                    <p className="mt-1 text-xs text-red-500">{errors.agent.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="label-base !mb-0">
                      {t('leadForm.assignTo')}{' '}
                      <span className="text-muted-foreground font-normal text-xs">
                        {t('leadForm.assignCoHint')}
                      </span>
                    </label>
                    <span className="text-xs text-muted-foreground font-medium">
                      {t('leadForm.assignCount', { n: selectedUserIds.length })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {t('leadForm.assignScope')}
                  </p>

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
                            {u?.name || 'Agent'}
                            <button
                              type="button"
                              onClick={() => toggleUser(id)}
                              className="hover:text-red-500 ms-0.5 text-muted-foreground"
                              aria-label={t('leadForm.removeAgent', { name: u?.name || 'agent' })}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="max-h-36 overflow-y-auto border border-input rounded-xl p-1.5 space-y-1 bg-background">
                    {userList.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        {t('leadForm.noAgents')}
                      </p>
                    ) : (
                      userList.map((u) => {
                        const isSelected = selectedUserIds.includes(u.id);
                        const isDisabled = !isSelected && selectedUserIds.length >= 2;
                        return (
                          <button
                            type="button"
                            key={`add-user-${u.id}`}
                            disabled={isDisabled}
                            onClick={() => toggleUser(u.id)}
                            aria-pressed={isSelected}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors text-left min-h-[44px] ${
                              isSelected
                                ? 'bg-primary/15 text-primary font-semibold'
                                : isDisabled
                                  ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                                  : 'hover:bg-muted text-foreground'
                            }`}
                          >
                            <span className="truncate">{u.name}</span>
                            {isSelected && (
                              <Check size={13} className="text-primary flex-shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
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
                    <span className="text-sm font-semibold text-foreground">
                      {t('leadForm.referral')}
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">{t('leadForm.referralHint')}</p>
                  {referralEnabled && (
                    <div className="relative mt-3 animate-rise-in">
                      <select
                        id="add-referral-to"
                        disabled={!referralEnabled}
                        autoComplete="off"
                        className="input-base appearance-none pe-8 min-h-[44px]"
                        aria-invalid={errors.referralTo ? true : undefined}
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
                        <p className="mt-1 text-xs text-red-500">{errors.referralTo.message}</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="add-followup" className="label-base">
                    {t('leadForm.followUp')}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      {t('leadForm.optional')}
                    </span>
                  </label>
                  <input
                    id="add-followup"
                    type="date"
                    className={`input-base min-h-[44px] ${
                      errors.followUpDue ? 'border-red-400' : ''
                    }`}
                    aria-invalid={errors.followUpDue ? true : undefined}
                    {...register('followUpDue')}
                  />
                  {errors.followUpDue && (
                    <p className="mt-1 text-xs text-red-500">{errors.followUpDue.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="add-notes" className="label-base">
                    {t('leadForm.notes')}
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

        {/* Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !showDetails;
            setShowDetails(next);
            if (next) setOpenSection('contact');
          }}
          aria-expanded={showDetails}
          aria-controls="add-more-details"
          className="btn-press inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline active:scale-[0.97] transition-transform bg-primary/8 px-3 py-2 min-h-[44px] rounded-lg"
        >
          <ChevronDown
            size={15}
            className={`transition-transform duration-300 ${showDetails ? 'rotate-180' : ''}`}
          />
          {showDetails ? t('leadForm.hideDetails') : `+ ${t('leadForm.moreDetails')}`}
        </button>
      </div>

      {/* ── Sticky action row ─────────────────────────────────────────── */}
      <div
        className="sticky bottom-0 z-10 bg-card border-t border-border px-4 sm:px-6 pt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-b-2xl"
        style={{
          bottom: keyboardInset > 0 ? `${keyboardInset}px` : undefined,
          paddingBottom: keyboardInset > 0 ? '12px' : 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-center gap-2 w-full sm:w-auto sm:order-1">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary btn-press flex-1 sm:flex-none min-h-[44px] px-3 sm:px-4"
          >
            {t('leadForm.cancel')}
          </button>
          <button
            type="submit"
            onClick={() => {
              submitModeRef.current = 'another';
            }}
            disabled={isSubmitting}
            className="btn-secondary btn-press flex-1 sm:flex-none min-h-[44px] px-3 text-xs sm:text-sm inline-flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('leadForm.saveAnother')}
          </button>
        </div>
        <button
          type="submit"
          onClick={() => {
            submitModeRef.current = 'single';
          }}
          disabled={isSubmitting}
          className="relative btn-press flex items-center gap-2 w-full sm:w-auto sm:order-2 justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-[0_6px_20px_-6px_rgba(132,204,22,0.65)] hover:shadow-[0_10px_28px_-6px_rgba(132,204,22,0.8)] hover:-translate-y-0.5 hover:brightness-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>{t('leadForm.adding')}</span>
            </>
          ) : (
            <>
              <Plus size={15} strokeWidth={2.5} />
              <span>{t('leadForm.addLead')}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

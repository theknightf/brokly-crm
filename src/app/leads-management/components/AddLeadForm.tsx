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
  Phone,
  User,
  Mail,
  MapPin,
  CalendarDays,
  ClipboardPaste,
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
import { parsePastedLead } from './leadPaste';

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

/** Presentational: label row with an optional "required"/"optional" tag and trailing action. */
function FieldLabel({
  htmlFor,
  children,
  required,
  requiredText,
  optionalText,
  action,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  requiredText?: string;
  optionalText?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 min-h-[24px]">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <span>{children}</span>
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
        {requiredText && (
          <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
            {requiredText}
          </span>
        )}
        {optionalText && (
          <span className="text-xs font-normal text-muted-foreground">{optionalText}</span>
        )}
      </label>
      {action}
    </div>
  );
}

/** Presentational: positions a leading icon inside an input wrapper. */
function IconWrap({
  icon,
  children,
  physicalLeft,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Use for dir="ltr" inputs (e.g. phone) so the icon stays on the input's own left edge. */
  physicalLeft?: boolean;
}) {
  return (
    <div className="relative">
      {children}
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none ${
          physicalLeft ? 'left-3.5' : 'start-3.5'
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
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
    setFocus,
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

  // Autofocus the first field (Name) as soon as the drawer opens
  useEffect(() => {
    const timer = window.setTimeout(() => setFocus('name'), 120);
    return () => window.clearTimeout(timer);
  }, [setFocus]);

  // ── Inline "already exists" hint ─────────────────────────────────────────
  // Debounced, read-only probe (/api/leads/exists). It never blocks saving and
  // never says who owns the original lead.
  const [existsState, setExistsState] = useState<'idle' | 'checking' | 'exists'>('idle');
  const existsSeqRef = useRef(0);
  const phoneValue = watch('phone');
  const emailValue = watch('email');
  useEffect(() => {
    const phoneOk = phoneDigits(phoneValue).length >= 8;
    const emailOk = /^\S+@\S+\.\S+$/.test((emailValue || '').trim());
    if (!phoneOk && !emailOk) {
      existsSeqRef.current += 1;
      setExistsState('idle');
      return;
    }
    const seq = ++existsSeqRef.current;
    setExistsState('checking');
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/leads/exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phoneOk ? phoneToStore(phoneValue) : '',
            email: emailOk ? (emailValue || '').trim() : '',
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (seq === existsSeqRef.current) setExistsState(j?.exists ? 'exists' : 'idle');
      } catch {
        if (seq === existsSeqRef.current) setExistsState('idle');
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [phoneValue, emailValue]);

  // ── Quick paste ("magic fill") ───────────────────────────────────────────
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const applyPaste = (raw: string) => {
    const parsed = parsePastedLead(raw);
    let filled = 0;
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (parsed.name) {
      setValue('name', parsed.name, opts);
      filled += 1;
    }
    if (parsed.phone) {
      setValue('phone', formatEgyptianPhone(parsed.phone), opts);
      filled += 1;
    }
    if (parsed.email) {
      setValue('email', parsed.email, opts);
      filled += 1;
    }
    if (!filled) {
      toast.info(t('leadForm.pasteNone'));
      return;
    }
    toast.success(t('leadForm.pasteDone', { n: filled }));
    setPasteText('');
    setPasteOpen(false);
    window.setTimeout(() => setFocus(parsed.name ? 'name' : 'phone'), 60);
  };
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        applyPaste(text);
        return;
      }
    } catch {
      /* permission denied or unsupported — fall back to the text box */
    }
    setPasteOpen(true);
  };

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

  /** Duplicates are never surfaced to the person adding the lead. */
  const checkDuplicate = async (_value: string) => {
    setDupState({ checking: false, existing: null });
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

    window.setTimeout(() => setFocus('name'), 60);
  };

  /**
   * Enter submits from any field; Ctrl/Cmd+Enter submits from anywhere, including
   * the multi-line fields. Enter on a button keeps its native action (e.g. picking
   * a source chip).
   */
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const withModifier = e.ctrlKey || e.metaKey;
    if (!withModifier && (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) return;
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

  const inputBase = 'input-base h-12 min-h-[48px] text-base sm:text-sm border-border/80';

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      onKeyDown={handleFormKeyDown}
      noValidate
      className="w-full flex flex-col justify-between min-h-full"
    >
      <div className="px-4 sm:px-6 py-5 space-y-5">
        {/* ── Quick paste (magic fill) ── */}
        <section className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              aria-expanded={pasteOpen}
              className="flex items-center gap-2 min-h-[44px] text-sm font-semibold text-foreground text-start flex-1"
            >
              <ClipboardPaste size={18} className="text-primary flex-shrink-0" />
              <span className="min-w-0">
                <span className="block">{t('leadForm.pasteTitle')}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {t('leadForm.pasteHint')}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              className="min-h-[44px] px-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 flex-shrink-0 active:scale-95"
            >
              <ClipboardPaste size={15} />
              <span>{t('leadForm.pasteApply')}</span>
            </button>
          </div>
          {pasteOpen && (
            <div className="mt-2 space-y-2 animate-rise-in">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text.trim()) {
                    e.preventDefault();
                    applyPaste(text);
                  }
                }}
                rows={3}
                autoFocus
                placeholder={t('leadForm.pastePlaceholder')}
                className="input-base resize-none text-base sm:text-sm border-border/80"
              />
              <button
                type="button"
                disabled={!pasteText.trim()}
                onClick={() => applyPaste(pasteText)}
                className="btn-secondary min-h-[44px] px-4 text-sm font-medium rounded-xl disabled:opacity-50"
              >
                {t('leadForm.pasteApply')}
              </button>
            </div>
          )}
        </section>

        {/* ── Express tier: name, phone-or-email, source ── */}
        <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-5 shadow-sm">
          {/* 1. Name (Required) */}
          <div>
            <FieldLabel htmlFor="add-name" required>
              {t('leadForm.name')}
            </FieldLabel>
            <IconWrap icon={<User size={18} />}>
              <input
                id="add-name"
                type="text"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                className={`${inputBase} ps-11 ${errors.name ? 'border-red-400' : ''}`}
                placeholder="Ahmed Hassan"
                {...register('name', { required: t('leadForm.nameRequired') })}
              />
            </IconWrap>
            {errors.name && (
              <p className="mt-1.5 text-sm text-red-500 font-medium">{errors.name.message}</p>
            )}
          </div>

          {/* 2. Primary contact: phone OR email (one is enough) */}
          <div>
            <FieldLabel htmlFor="add-phone" required>
              {t('leadForm.phone')} / {t('leadForm.email')}
            </FieldLabel>
            <p className="-mt-1 mb-2 text-xs text-muted-foreground">{t('leadForm.contactHint')}</p>

            <Controller
              name="phone"
              control={control}
              rules={{
                deps: ['email'],
                validate: (v) => {
                  const digits = phoneDigits(v);
                  if (!digits && !(getValues('email') || '').trim()) {
                    return t('leadForm.phoneRequired');
                  }
                  if (digits && digits.length < 7) return t('leadForm.phoneInvalid');
                  return true;
                },
              }}
              render={({ field, fieldState }) => (
                <>
                  <IconWrap icon={<Phone size={18} />} physicalLeft>
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
                          : existsState === 'exists'
                            ? 'add-lead-exists'
                            : undefined
                      }
                      className={`input-base h-14 min-h-[56px] ps-11 text-xl tracking-wide font-mono-data ${
                        fieldState.error
                          ? 'border-red-400 focus:border-red-500 ring-1 ring-red-400/20'
                          : 'border-border/80 focus:border-primary'
                      }`}
                    />
                  </IconWrap>
                  {fieldState.error && (
                    <p id="add-phone-error" className="mt-1.5 text-sm text-red-500 font-medium">
                      {fieldState.error.message}
                    </p>
                  )}
                </>
              )}
            />

            <div className="mt-3">
              <IconWrap icon={<Mail size={18} />}>
                <input
                  id="add-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-label={t('leadForm.email')}
                  className={`${inputBase} ps-11 ${errors.email ? 'border-red-400' : ''}`}
                  placeholder="ahmed@email.com"
                  {...register('email', {
                    deps: ['phone'],
                    pattern: { value: /^\S+@\S+\.\S+$/, message: t('leadForm.emailInvalid') },
                  })}
                />
              </IconWrap>
              {errors.email && (
                <p className="mt-1.5 text-sm text-red-500 font-medium">{errors.email.message}</p>
              )}
            </div>

            {/* Inline "already exists" hint: soft, never blocks, never names the owner */}
            {existsState === 'exists' ? (
              <div
                id="add-lead-exists"
                role="status"
                className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
              >
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  {t('leadForm.existsInline')}
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  {t('leadForm.existsHint')}
                </p>
              </div>
            ) : (
              existsState === 'checking' && (
                <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5" role="status">
                  <Loader2 size={12} className="animate-spin" />
                  {t('leadForm.phoneHint')}
                </p>
              )
            )}
          </div>

          {/* 3. Source (Required) — selectable chips, single select */}
          <div>
            <FieldLabel
              required
              action={
                !showAddSourceInput ? (
                  <button
                    type="button"
                    onClick={() => setShowAddSourceInput(true)}
                    className="min-h-[36px] px-2 -me-2 text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>{t('leadForm.newSource')}</span>
                  </button>
                ) : undefined
              }
            >
              {t('leadForm.source')}
            </FieldLabel>

            <Controller
              name="source"
              control={control}
              rules={{ required: t('leadForm.sourceRequired') || 'Source is required' }}
              render={({ field }) => (
                <div
                  className="flex flex-wrap gap-2"
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
                        className={`min-h-[44px] px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5 select-none ${
                          isSelected
                            ? 'bg-primary text-primary-foreground font-semibold shadow-sm ring-2 ring-primary/30'
                            : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
                        }`}
                      >
                        {isSelected && <Check size={14} className="stroke-[2.5]" />}
                        <span>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            />

            {/* Optional inline input for new custom source */}
            {showAddSourceInput && (
              <div className="flex items-center gap-2 mt-3 animate-rise-in">
                <input
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    void createNewSource();
                  }}
                  placeholder={t('leadForm.newSource')}
                  className="input-base h-11 min-h-[44px] text-base sm:text-sm flex-1"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={creatingSource || !newSourceName.trim()}
                  onClick={() => void createNewSource()}
                  className="min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {creatingSource ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>{t('leadForm.addSource')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSourceInput(false);
                    setNewSourceName('');
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
                  aria-label={t('leadForm.cancel')}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {errors.source && (
              <p className="mt-1.5 text-sm text-red-500 font-medium">{errors.source.message}</p>
            )}
          </div>
        </section>

        {/* ── Toggle "More Details" (Collapsed by default) ── */}
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          aria-expanded={showDetails}
          aria-controls="add-more-details-panel"
          className={`w-full flex items-center justify-between px-4 py-3 min-h-[52px] rounded-2xl border text-sm font-semibold text-foreground transition-colors active:scale-[0.99] ${
            showDetails
              ? 'border-primary/40 bg-primary/5'
              : 'border-dashed border-border bg-muted/30 hover:bg-muted/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <SlidersHorizontal size={16} className="text-primary" />
            <span>{showDetails ? t('leadForm.hideDetails') : `+ ${t('leadForm.moreDetails')}`}</span>
          </span>
          <ChevronDown
            size={18}
            className={`text-muted-foreground transition-transform duration-200 ${
              showDetails ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* ── Collapsed content: assignees, stage, follow-up, location, project, referral, notes ── */}
        <div
          id="add-more-details-panel"
          aria-hidden={!showDetails}
          {...(!showDetails ? ({ inert: '' } as Record<string, string>) : {})}
          className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
            showDetails
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0 pointer-events-none -mt-5'
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-5">
              {/* Assign To (Visible ONLY for admin/manager, otherwise hidden) */}
              {isPrivileged && (
                <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                  <FieldLabel
                    htmlFor="add-assignee"
                    action={
                      <span className="text-xs text-muted-foreground font-medium">
                        {t('leadForm.assignCount', { n: selectedUserIds.length })}
                      </span>
                    }
                  >
                    {t('leadForm.assignTo')}
                  </FieldLabel>

                  {selectedUserIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedUserIds.map((id) => {
                        const u = userList.find((user) => user.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 ps-3 pe-1 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary border border-primary/20"
                          >
                            <UserCheck size={14} className="text-emerald-500" />
                            <span>{u?.name || 'Agent'}</span>
                            <button
                              type="button"
                              onClick={() => toggleUser(id)}
                              className="hover:text-red-500 text-muted-foreground min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full"
                              aria-label={t('leadForm.removeAgent', { name: u?.name || 'agent' })}
                            >
                              <X size={14} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="relative">
                    <select
                      id="add-assignee"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) toggleUser(e.target.value);
                      }}
                      className={`${inputBase} appearance-none pe-9`}
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
                </section>
              )}

              {/* Stage & follow-up */}
              <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-4 shadow-sm">
                <div>
                  <FieldLabel htmlFor="add-status">{t('leadForm.status')}</FieldLabel>
                  <div className="relative">
                    <select
                      id="add-status"
                      autoComplete="off"
                      className={`${inputBase} appearance-none pe-9`}
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

                <div>
                  <FieldLabel htmlFor="add-followup" optionalText={t('leadForm.optional')}>
                    {t('leadForm.followUp')}
                  </FieldLabel>
                  <IconWrap icon={<CalendarDays size={18} />}>
                    <input
                      id="add-followup"
                      type="date"
                      className={`${inputBase} ps-11`}
                      {...register('followUpDue')}
                    />
                  </IconWrap>
                </div>
              </section>

              {/* Location, developer & project */}
              <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-4 shadow-sm">
                <div>
                  <FieldLabel htmlFor="add-location" optionalText={t('leadForm.optional')}>
                    {t('leadForm.location')}
                  </FieldLabel>
                  <IconWrap icon={<MapPin size={18} />}>
                    <input
                      id="add-location"
                      type="text"
                      autoComplete="address-level2"
                      className={`${inputBase} ps-11`}
                      placeholder="Cairo / New Cairo"
                      {...register('location')}
                    />
                  </IconWrap>
                </div>

                <div>
                  <FieldLabel htmlFor="add-developer" optionalText={t('leadForm.optional')}>
                    {t('leadForm.developer')}
                  </FieldLabel>
                  <div className="relative">
                    <select
                      id="add-developer"
                      autoComplete="off"
                      className={`${inputBase} appearance-none pe-9`}
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
                  <FieldLabel htmlFor="add-project" optionalText={t('leadForm.optional')}>
                    {t('leadForm.project')}
                  </FieldLabel>
                  <div className="relative">
                    <select
                      id="add-project"
                      autoComplete="off"
                      className={`${inputBase} appearance-none pe-9 ${
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
              </section>

              {/* Referral Assignment */}
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={referralEnabled}
                    onChange={(e) => {
                      setReferralEnabled(e.target.checked);
                      if (!e.target.checked) setValue('referralTo', '');
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="text-sm font-semibold text-foreground">
                    {t('leadForm.referral')}
                  </span>
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('leadForm.referralHint')}</p>
                {referralEnabled && (
                  <div className="relative mt-3 animate-rise-in">
                    <select
                      id="add-referral-to"
                      disabled={!referralEnabled}
                      autoComplete="off"
                      className={`${inputBase} appearance-none pe-9`}
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
                      <p className="mt-1.5 text-sm text-red-500 font-medium">{errors.referralTo.message}</p>
                    )}
                  </div>
                )}
              </section>

              {/* Notes */}
              <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <FieldLabel htmlFor="add-notes">{t('leadForm.notes')}</FieldLabel>
                <textarea
                  id="add-notes"
                  rows={3}
                  className="input-base resize-none text-base sm:text-sm border-border/80"
                  placeholder="e.g. Interested in Palm Hills New Cairo, 3BR unit"
                  {...register('notes')}
                />
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky Bottom Actions ── */}
      <div
        className="sticky bottom-0 z-10 bg-card/95 backdrop-blur-md border-t border-border px-4 sm:px-6 pt-2 pb-3"
        style={{
          bottom: keyboardInset > 0 ? `${keyboardInset}px` : undefined,
          paddingBottom: keyboardInset > 0 ? '12px' : 'max(14px, env(safe-area-inset-bottom))',
        }}
      >
        <p className="hidden sm:block text-xs text-muted-foreground mb-2">{t('leadForm.shortcutHint')}</p>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl sm:flex-shrink-0"
          >
            {t('leadForm.cancel')}
          </button>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'another';
              }}
              disabled={isSubmitting}
              className="btn-secondary min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl inline-flex items-center justify-center gap-1.5"
            >
              {isSubmitting && submitModeRef.current === 'another' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}
              <span className="truncate">{t('leadForm.saveAnother')}</span>
            </button>

            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'single';
              }}
              disabled={isSubmitting}
              className="btn-press min-h-[48px] px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm sm:text-base shadow-md hover:brightness-105 active:scale-95 transition-all inline-flex items-center justify-center gap-2"
            >
              {isSubmitting && submitModeRef.current === 'single' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t('leadForm.adding')}</span>
                </>
              ) : (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  <span>{t('leadForm.addLead')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

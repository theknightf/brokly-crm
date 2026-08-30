'use client';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  Building2,
  FolderOpen,
  Loader2,
  X,
  MapPin,
  Layers,
  Eye,
  Upload,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Project, ProjectStatus } from './mockProjects';
import {
  projectsService,
  developersService,
  unitsService,
  UnitFile,
} from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { SiteVisitSheet } from '@/components/mobile/SiteVisitSheet';
import UnitsPanel from './UnitsPanel';
import UnitCard from '@/components/ui/UnitCard';

interface Developer {
  id: string;
  name: string;
  isActive: boolean;
}

interface Unit {
  id: string;
  projectId: string;
  name: string;
  unitType: string;
  area: number;
  floor: number;
  price: number;
  paymentPlan: string;
  status: string;
  imagePath?: string | null;
}

interface UnitStats {
  minPrice: number | null;
  available: number;
  reserved: number;
  sold: number;
  units: Unit[];
}

interface ProjectFormData {
  name: string;
  developerId: string;
  status: ProjectStatus;
  latitude?: string;
  longitude?: string;
  radiusM?: string;
  pitchSummary: string;
  whyBuy: string;
  sellingPoints: string;
  location: string;
  fullDescription: string;
  developerDescription: string;
  paymentPlanSummary: string;
  imageFile: File | null;
  imagePath?: string;
}

function parseLat(v?: string): number | null {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) && n >= -90 && n <= 90 ? n : null;
}

function parseLng(v?: string): number | null {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) && n >= -180 && n <= 180 ? n : null;
}

function parseOptionalInt(v?: string): number | null {
  const n = v == null ? NaN : parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatEGP(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return `EGP ${new Intl.NumberFormat('en-US').format(Math.round(n))}`;
}

function buildPayload(data: ProjectFormData) {
  return {
    name: data.name,
    developerId: data.developerId,
    status: data.status,
    latitude: parseLat(data.latitude),
    longitude: parseLng(data.longitude),
    radiusM: parseOptionalInt(data.radiusM),
    pitchSummary: data.pitchSummary,
    whyBuy: data.whyBuy,
    sellingPoints: data.sellingPoints,
    location: data.location,
    fullDescription: data.fullDescription,
    developerDescription: data.developerDescription,
    paymentPlanSummary: data.paymentPlanSummary,
  };
}

const emptyForm = (developerId: string): ProjectFormData => ({
  name: '',
  developerId,
  status: 'Active',
  pitchSummary: '',
  whyBuy: '',
  sellingPoints: '',
  location: '',
  fullDescription: '',
  developerDescription: '',
  paymentPlanSummary: '',
  imageFile: null,
});

/** Resolves the signed URL for a project cover image, with a branded fallback. */
function ProjectCover({
  project,
  className,
  iconSize = 28,
}: {
  project: { imagePath?: string; name: string };
  className?: string;
  iconSize?: number;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let alive = true;
    if (!project.imagePath) {
      setUrl('');
      return;
    }
    projectsService.getImageUrl(project.imagePath).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [project.imagePath]);

  if (url) {
    return (
      <img
        src={url}
        alt={project.name}
        className={`object-cover w-full h-full ${className || ''}`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-400 ${className || ''}`}
    >
      <Building2 size={iconSize} className="text-white/90" />
    </div>
  );
}

function ProjectFormModal({
  open,
  onClose,
  onSave,
  initial,
  title,
  developers,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: ProjectFormData) => void;
  initial?: Partial<ProjectFormData>;
  title: string;
  developers: Developer[];
}) {
  const [form, setForm] = useState<ProjectFormData>(
    initial
      ? ({ ...emptyForm(''), ...initial } as ProjectFormData)
      : emptyForm(developers[0]?.id || '')
  );
  const [errors, setErrors] = useState<Partial<ProjectFormData>>({});
  const [saving, setSaving] = useState(false);
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setForm(
        initial
          ? ({ ...emptyForm(''), ...initial } as ProjectFormData)
          : emptyForm(developers[0]?.id || '')
      );
      setErrors({});
      setPreviewUrl('');
      setExistingImageUrl('');
      if (initial?.imagePath) {
        projectsService.getImageUrl(initial.imagePath).then(setExistingImageUrl);
      }
    }
  }, [open, initial, developers]);

  const handleFile = (file: File | null) => {
    setForm((f) => ({ ...f, imageFile: file }));
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl('');
    }
  };

  const validate = () => {
    const e: Partial<ProjectFormData> = {};
    if (!form.name.trim()) e.name = 'Project name is required';
    if (!form.developerId) e.developerId = 'Select a developer';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(form);
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-2xl fade-in max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label-base">Developer</label>
                <div className="relative">
                  <select
                    value={form.developerId}
                    onChange={(e) => setForm((f) => ({ ...f, developerId: e.target.value }))}
                    className="input-base appearance-none pr-8"
                  >
                    <option value="">Select developer</option>
                    {developers
                      .filter((d) => d.isActive)
                      .map((d) => (
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
                {errors.developerId && (
                  <p className="mt-1 text-xs text-red-500">{errors.developerId}</p>
                )}
              </div>
              <div>
                <label className="label-base">Project Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={`input-base ${errors.name ? 'border-red-400' : ''}`}
                  placeholder="e.g. Palm Hills New Cairo"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>
            </div>

            <div>
              <label className="label-base">Status</label>
              <div className="flex gap-3">
                {(['Active', 'Inactive'] as ProjectStatus[]).map((s) => (
                  <label
                    key={s}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors flex-1 justify-center text-sm font-medium ${form.status === s ? (s === 'Active' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-400 bg-slate-50 text-slate-600') : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={s}
                      checked={form.status === s}
                      onChange={() => setForm((f) => ({ ...f, status: s }))}
                      className="sr-only"
                    />
                    <span
                      className={`w-2 h-2 rounded-full ${s === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label-base">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="input-base"
                placeholder="e.g. South Investors Area, New Cairo"
              />
            </div>

            <div>
              <label className="label-base">Site location (optional)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.latitude || ''}
                  onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                  className="input-base"
                  placeholder="Latitude"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.longitude || ''}
                  onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                  className="input-base"
                  placeholder="Longitude"
                />
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 items-center">
                <input
                  type="number"
                  value={form.radiusM === undefined ? '' : form.radiusM}
                  onChange={(e) => setForm((f) => ({ ...f, radiusM: e.target.value }))}
                  className="input-base"
                  placeholder="Radius (m)"
                />
                <p className="text-[11px] text-muted-foreground">
                  Radius used to confirm the site-visit location. Default 300&nbsp;m.
                </p>
              </div>
            </div>

            <div>
              <label className="label-base">Cover image</label>
              <div className="flex items-center gap-3">
                {(previewUrl || existingImageUrl) && (
                  <img
                    src={previewUrl || existingImageUrl}
                    alt="Cover preview"
                    className="w-16 h-12 rounded-lg object-cover border border-border"
                  />
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Upload size={14} />
                  {previewUrl || existingImageUrl ? 'Change image' : 'Upload image'}
                </button>
                {(previewUrl || existingImageUrl) && (
                  <button
                    type="button"
                    onClick={() => handleFile(null)}
                    className="btn-ghost text-xs"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
              </div>
              {!previewUrl && !existingImageUrl && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  JPG / PNG. Shown as the project cover on cards.
                </p>
              )}
            </div>

            <div>
              <label className="label-base">Pitch summary (optional)</label>
              <textarea
                value={form.pitchSummary}
                onChange={(e) => setForm((f) => ({ ...f, pitchSummary: e.target.value }))}
                rows={2}
                className="input-base resize-none"
                placeholder="One-liner agents read to the customer, e.g. “Premium compound with private gardens & smart home tech.”"
              />
            </div>
            <div>
              <label className="label-base">Full description (optional)</label>
              <textarea
                value={form.fullDescription}
                onChange={(e) => setForm((f) => ({ ...f, fullDescription: e.target.value }))}
                rows={3}
                className="input-base resize-none"
                placeholder="Longer project story — master plan, amenities, phases…"
              />
            </div>
            <div>
              <label className="label-base">Developer description (optional)</label>
              <textarea
                value={form.developerDescription}
                onChange={(e) => setForm((f) => ({ ...f, developerDescription: e.target.value }))}
                rows={2}
                className="input-base resize-none"
                placeholder="About the developer — track record, portfolio…"
              />
            </div>
            <div>
              <label className="label-base">Payment plan summary (optional)</label>
              <textarea
                value={form.paymentPlanSummary}
                onChange={(e) => setForm((f) => ({ ...f, paymentPlanSummary: e.target.value }))}
                rows={2}
                className="input-base resize-none"
                placeholder="e.g. 0% down, 8-year installments, handover 2027"
              />
            </div>
            <div>
              <label className="label-base">Why buy (optional)</label>
              <textarea
                value={form.whyBuy}
                onChange={(e) => setForm((f) => ({ ...f, whyBuy: e.target.value }))}
                rows={2}
                className="input-base resize-none"
                placeholder="The main buying reason, e.g. “Best location in the district with direct access to the ring road.”"
              />
            </div>
            <div>
              <label className="label-base">Selling points (optional)</label>
              <textarea
                value={form.sellingPoints}
                onChange={(e) => setForm((f) => ({ ...f, sellingPoints: e.target.value }))}
                rows={3}
                className="input-base resize-none"
                placeholder="One per line — shown as bullet points in the call sheet, e.g.&#10;60% finished & handed over&#10;0% down payment"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                These show in the call summary while the agent is on a call.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2 min-w-[110px] justify-center"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                'Save Project'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectDetailsModal({
  project,
  stats,
  onClose,
  onEdit,
  onUnits,
  onVisit,
  onReserveUnit,
}: {
  project: Project;
  stats?: UnitStats;
  onClose: () => void;
  onEdit: () => void;
  onUnits: () => void;
  onVisit: () => void;
  onReserveUnit: (unit: any) => Promise<void>;
}) {
  const hasGps = project.latitude != null && project.longitude != null;
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${project.latitude},${project.longitude}`
    : '';
  const sellingPoints = project.sellingPoints || [];
  const units = stats?.units || [];
  const [unitImages, setUnitImages] = useState<Record<string, string>>({});

  // Resolve signed URLs for unit cover images (private bucket).
  React.useEffect(() => {
    let mounted = true;
    const withImage = units.filter((u) => u.imagePath);
    if (withImage.length === 0) return;
    Promise.all(
      withImage.map(async (u) => ({
        id: u.id,
        url: await unitsService.getFileUrl({ filePath: u.imagePath } as UnitFile),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const section = (title: string, body?: string) =>
    body && body.trim() ? (
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {title}
        </h4>
        <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{body}</p>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-3xl fade-in max-h-[92vh] flex flex-col">
        <div className="relative h-44 sm:h-52 flex-shrink-0">
          <ProjectCover project={project} iconSize={44} className="rounded-t-2xl" />
          <div className="absolute top-3 right-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${project.status === 'Active' ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white'}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${project.status === 'Active' ? 'bg-emerald-200' : 'bg-slate-200'}`}
              />
              {project.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5">
          <div>
            <h2 className="text-xl font-bold text-foreground">{project.name}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 size={14} className="text-primary" /> {project.developerName}
              </span>
              {project.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-primary" /> {project.location}
                </span>
              )}
              {project.createdAt && (
                <span className="text-xs">
                  Added{' '}
                  {new Date(project.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>

          {hasGps && (
            <div className="flex items-center justify-between gap-3 bg-muted/50 rounded-xl px-4 py-3">
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm">Site location</p>
                <p className="font-mono-data mt-0.5">
                  {Number(project.latitude).toFixed(5)}, {Number(project.longitude).toFixed(5)}
                  {project.radiusM ? ` · ±${project.radiusM}m` : ''}
                </p>
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center gap-1.5 text-xs !py-2"
              >
                <ExternalLink size={13} /> Open in Maps
              </a>
            </div>
          )}

          {section('Pitch', project.pitchSummary)}
          {section('About the project', project.fullDescription)}
          {section('About the developer', project.developerDescription)}
          {section('Why buy', project.whyBuy)}

          {sellingPoints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Selling points
              </h4>
              <ul className="space-y-1.5">
                {sellingPoints.map((sp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    {sp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section('Payment plan', project.paymentPlanSummary)}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Units overview
            </h4>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(
                [
                  { label: 'Starting price', value: formatEGP(stats?.minPrice ?? null) },
                  { label: 'Available', value: stats ? String(stats.available) : '—' },
                  { label: 'Reserved', value: stats ? String(stats.reserved) : '—' },
                ] as { label: string; value: string }[]
              ).map((s) => (
                <div key={s.label} className="bg-muted/50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
            {units.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {units.slice(0, 8).map((u) => (
                  <UnitCard
                    key={u.id}
                    unit={u}
                    imageUrl={unitImages[u.id]}
                    showProject={false}
                    onReserve={(unit) => onReserveUnit(unit)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No units added yet — add units to keep track of availability and pricing.
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center gap-2 justify-end flex-wrap">
          <button onClick={onEdit} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Pencil size={14} /> Edit project
            </button>
            <button onClick={onVisit} className="btn-secondary flex items-center gap-1.5 text-sm">
              <MapPin size={14} /> Site Visit
            </button>
            <button onClick={onUnits} className="btn-primary flex items-center gap-1.5 text-sm">
              <Layers size={14} /> View units &amp; media
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [unitStats, setUnitStats] = useState<Record<string, UnitStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDev, setFilterDev] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | ''>('');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [visitTarget, setVisitTarget] = useState<Project | null>(null);
  const [unitsTarget, setUnitsTarget] = useState<{ id: string; name: string } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Project | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const buildStats = (unitsData: Unit[]) => {
    const stats: Record<string, UnitStats> = {};
    for (const u of unitsData) {
      const s = (stats[u.projectId] ||= {
        minPrice: null,
        available: 0,
        reserved: 0,
        sold: 0,
        units: [],
      });
      s.units.push(u);
      if (u.price > 0 && (s.minPrice == null || u.price < s.minPrice)) s.minPrice = u.price;
      if (u.status === 'Available') s.available += 1;
      else if (u.status === 'Reserved') s.reserved += 1;
      else if (u.status === 'Sold') s.sold += 1;
    }
    return stats;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsData, devsData, unitsData] = await Promise.all([
        projectsService.getAll(),
        developersService.getAll(),
        unitsService.getAll(),
      ]);
      setProjects(projectsData as Project[]);
      setDevelopers(devsData as Developer[]);
      setUnitStats(buildStats(unitsData as Unit[]));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  /** One-tap reserve from the project details modal (unit card action). */
  const handleReserveUnit = async (unit: any) => {
    if (unit.status !== 'Available') return;
    try {
      await unitsService.update(unit.id, { ...unit, status: 'Reserved' });
      const unitsData = await unitsService.getAll();
      setUnitStats(buildStats(unitsData as Unit[]));
      toast.success(`"${unit.name}" reserved`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reserve unit');
    }
  };

  const filtered = useMemo(() => {
    let r = [...projects];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.developerName.toLowerCase().includes(q) ||
          (p.location || '').toLowerCase().includes(q)
      );
    }
    if (filterDev) r = r.filter((p) => p.developerId === filterDev);
    if (filterStatus) r = r.filter((p) => p.status === filterStatus);
    return r;
  }, [projects, search, filterDev, filterStatus]);

  const persistImage = async (
    projectId: string,
    payload: ReturnType<typeof buildPayload>,
    imageFile: File | null
  ): Promise<Project> => {
    if (!imageFile) return {} as Project;
    const path = await projectsService.uploadImage(projectId, imageFile);
    return (await projectsService.update(projectId, { ...payload, imagePath: path })) as Project;
  };

  const handleAdd = async (data: ProjectFormData) => {
    try {
      const payload = buildPayload(data);
      const created = (await projectsService.create(payload, user?.id || '')) as Project;
      const saved = data.imageFile
        ? await persistImage(created.id, payload, data.imageFile)
        : created;
      setProjects((prev) => [saved, ...prev]);
      setAddOpen(false);
      toast.success(`Project "${data.name}" added`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add project');
    }
  };

  const handleEdit = async (data: ProjectFormData) => {
    if (!editTarget) return;
    try {
      const payload = buildPayload(data);
      if (data.imageFile) {
        const path = await projectsService.uploadImage(editTarget.id, data.imageFile);
        const updated = (await projectsService.update(editTarget.id, {
          ...payload,
          imagePath: path,
        })) as Project;
        setProjects((prev) => prev.map((p) => (p.id === editTarget.id ? updated : p)));
      } else {
        const updated = (await projectsService.update(editTarget.id, {
          ...payload,
          imagePath: editTarget.imagePath || '',
        })) as Project;
        setProjects((prev) => prev.map((p) => (p.id === editTarget.id ? updated : p)));
      }
      setEditTarget(null);
      toast.success('Project updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update project');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await projectsService.delete(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success(`Project "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete project');
    }
  };

  const activeCount = projects.filter((p) => p.status === 'Active').length;
  const devCount = new Set(projects.map((p) => p.developerId)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} active project{activeCount !== 1 ? 's' : ''} across {devCount} developer
            {devCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="btn-primary flex items-center gap-1.5 text-sm self-start sm:self-auto"
        >
          <Plus size={15} />
          Add new project
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Projects', value: projects.length, color: 'text-foreground' },
          {
            label: 'Active',
            value: projects.filter((p) => p.status === 'Active').length,
            color: 'text-emerald-600',
          },
          {
            label: 'Inactive',
            value: projects.filter((p) => p.status === 'Inactive').length,
            color: 'text-slate-500',
          },
          { label: 'Developers', value: devCount, color: 'text-primary' },
        ].map((stat) => (
          <div key={stat.label} className="card-base !py-3 !px-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="card-base !p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              placeholder="Search projects, developers or locations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-base pl-8 h-9 text-sm"
            />
          </div>
          <div className="relative">
            <select
              value={filterDev}
              onChange={(e) => setFilterDev(e.target.value)}
              className="input-base h-9 text-sm appearance-none pr-8 min-w-[160px]"
            >
              <option value="">All Developers</option>
              {developers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | '')}
              className="input-base h-9 text-sm appearance-none pr-8 min-w-[130px]"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>
          {(search || filterDev || filterStatus) && (
            <button
              onClick={() => {
                setSearch('');
                setFilterDev('');
                setFilterStatus('');
              }}
              className="btn-secondary h-9 text-sm px-3"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-base flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen size={32} className="text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No projects found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try adjusting your filters or add a new project
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((project) => {
            const stats = unitStats[project.id];
            const sp = project.sellingPoints || [];
            return (
              <div
                key={project.id}
                className="card-base !p-0 overflow-hidden flex flex-col"
                role="button"
                tabIndex={0}
                onClick={() => setDetailsTarget(project)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailsTarget(project);
                  }
                }}
              >
                <div className="relative h-36 flex-shrink-0">
                  <ProjectCover project={project} iconSize={30} />
                  <span
                    className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${project.status === 'Active' ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white'}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${project.status === 'Active' ? 'bg-emerald-200' : 'bg-slate-200'}`}
                    />
                    {project.status}
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-2.5 flex-1">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 size={12} className="text-primary" />
                        {project.developerName}
                      </span>
                      {project.location && (
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin size={12} className="text-primary flex-shrink-0" />
                          <span className="truncate">{project.location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {project.pitchSummary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {project.pitchSummary}
                    </p>
                  )}

                  {project.paymentPlanSummary && (
                    <p className="text-[11px] text-muted-foreground/90 line-clamp-2">
                      {project.paymentPlanSummary}
                    </p>
                  )}

                  <div className="flex items-end justify-between gap-2 border-t border-border pt-2.5 mt-auto">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Starting from
                      </p>
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {formatEGP(stats?.minPrice ?? null)}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {stats ? (
                        <>
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                            {stats.available} Available
                          </span>
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold">
                            {stats.reserved} Reserved
                          </span>
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold">
                            {stats.sold} Sold
                          </span>
                        </>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold">
                          No units
                        </span>
                      )}
                    </div>
                  </div>

                  {sp.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sp.slice(0, 3).map((point, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground truncate max-w-full"
                        >
                          {point}
                        </span>
                      ))}
                      {sp.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground">
                          +{sp.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 px-4 py-3 border-t border-border bg-muted/20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsTarget(project);
                    }}
                    className="btn-primary flex items-center justify-center gap-1.5 text-xs !px-3 !py-2 flex-1"
                  >
                    <Eye size={13} /> View Details
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnitsTarget({ id: project.id, name: project.name });
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                    title="Units & media — add photos, videos, PDFs"
                  >
                    <Layers size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVisitTarget(project);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title="Site visit — confirm you're on site"
                  >
                    <MapPin size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(project);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Edit project"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(project);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        title="Add new project"
        developers={developers}
      />
      <ProjectFormModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEdit}
        initial={
          editTarget
            ? {
                name: editTarget.name,
                developerId: editTarget.developerId,
                status: editTarget.status,
                pitchSummary: editTarget.pitchSummary || '',
                whyBuy: editTarget.whyBuy || '',
                sellingPoints: (editTarget.sellingPoints || []).join('\n'),
                location: editTarget.location || '',
                fullDescription: editTarget.fullDescription || '',
                developerDescription: editTarget.developerDescription || '',
                paymentPlanSummary: editTarget.paymentPlanSummary || '',
                latitude: editTarget.latitude != null ? String(editTarget.latitude) : undefined,
                longitude: editTarget.longitude != null ? String(editTarget.longitude) : undefined,
                radiusM: editTarget.radiusM != null ? String(editTarget.radiusM) : undefined,
                imagePath: editTarget.imagePath || '',
              }
            : undefined
        }
        title="Edit project"
        developers={developers}
      />

      {detailsTarget && (
        <ProjectDetailsModal
          project={detailsTarget}
          stats={unitStats[detailsTarget.id]}
          onClose={() => setDetailsTarget(null)}
          onEdit={() => {
            setEditTarget(detailsTarget);
            setDetailsTarget(null);
          }}
          onUnits={() => {
            setUnitsTarget({ id: detailsTarget.id, name: detailsTarget.name });
            setDetailsTarget(null);
          }}
          onVisit={() => {
            setVisitTarget(detailsTarget);
            setDetailsTarget(null);
          }}
          onReserveUnit={handleReserveUnit}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-card border border-border rounded-2xl shadow-modal p-6 max-w-sm w-full fade-in">
            <h3 className="text-base font-semibold text-foreground mb-2">Delete this project?</h3>
            <p className="text-sm text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{deleteTarget.name}</span> will be
              permanently removed.
            </p>
            <p className="text-xs text-muted-foreground mb-5">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
              Remove project
            </button>
            </div>
          </div>
        </div>
      )}

      {visitTarget && (
        <SiteVisitSheet
          project={{
            id: visitTarget.id,
            name: visitTarget.name,
            latitude: visitTarget.latitude,
            longitude: visitTarget.longitude,
            radiusM: visitTarget.radiusM,
          }}
          onClose={() => setVisitTarget(null)}
          onChanged={() => setVisitTarget(null)}
        />
      )}

      {unitsTarget && (
        <UnitsPanel
          projectId={unitsTarget.id}
          projectName={unitsTarget.name}
          open={!!unitsTarget}
          onClose={() => setUnitsTarget(null)}
        />
      )}
    </div>
  );
}

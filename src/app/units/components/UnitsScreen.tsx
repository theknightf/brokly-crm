'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Upload,
  Building2,
  Search,
  Image as ImageIcon,
  LayoutGrid,
  Table2,
  BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import UnitCard from '@/components/ui/UnitCard';
import { unitsService, projectsService, UnitFile } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';

const UNIT_STATUSES = ['Available', 'Reserved', 'Sold'];
const UNIT_TYPES = [
  '1 BHK',
  '2 BHK',
  '3 BHK',
  'Penthouse',
  'Villa',
  'Townhouse',
  'Studio',
  'Commercial',
];

const fmt = (n: number) => (n ? n.toLocaleString() : '0');

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Available'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Reserved'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-200 text-slate-700';
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

export default function UnitsScreen() {
  const { user } = useAuth();
  const [units, setUnits] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [unitData, projectData] = await Promise.all([
        unitsService.getAll().catch(() => []),
        projectsService.getAll().catch(() => []),
      ]);
      setUnits(unitData || []);
      setProjects(projectData || []);
    } catch {
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const withImages = units.filter((u) => u.imagePath);
    if (!withImages.length) return;
    let mounted = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const u of withImages) {
        const url = await unitsService.getFileUrl({ filePath: u.imagePath } as UnitFile);
        if (mounted && url) next[u.id] = url;
      }
      if (mounted) setCoverUrls(next);
    })();
    return () => {
      mounted = false;
    };
  }, [units]);

  const filtered = units.filter((u) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = [u.name, u.unitType, u.projectName, u.paymentPlan]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter && u.status !== statusFilter) return false;
    if (projectFilter && u.projectId !== projectFilter) return false;
    return true;
  });

  const saveUnit = async (data: any) => {
    try {
      if (editing) {
        await unitsService.update(editing.id, { ...editing, ...data });
        toast.success('Unit updated');
      } else {
        await unitsService.create(data, user?.id);
        toast.success('Unit added');
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save unit');
    }
  };

  const changeStatus = async (unit: any, status: string) => {
    try {
      await unitsService.update(unit.id, { ...unit, status });
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status } : u)));
      toast.success(`"${unit.name}" marked ${status}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await unitsService.delete(deleting.id);
      toast.success('Unit deleted');
      setDeleting(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete unit');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Units</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {units.length} unit{units.length !== 1 ? 's' : ''} in your CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex p-1 rounded-xl bg-muted">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-colors ${
                view === 'grid' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={`flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-colors ${
                view === 'table' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              }`}
              aria-label="Table view"
            >
              <Table2 size={14} />
            </button>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={15} />
            Add unit
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card-base !p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unit, project, type…"
              className="input-base !pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-base appearance-none"
          >
            <option value="">All statuses</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="input-base appearance-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={22} className="text-muted-foreground" />}
            title="No units"
            description="Add units to your inventory to recommend them in the calculator."
          />
        ) : (
          filtered.map((u) => (
            <div
              key={u.id}
              className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-2"
            >
              <div className="flex items-start gap-3">
                {coverUrls[u.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrls[u.id]}
                    alt={u.name}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                    <ImageIcon size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.projectName || '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[u.unitType, u.area ? `${u.area} m²` : '', u.floor ? `Floor ${u.floor}` : '']
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <StatusBadge status={u.status} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold tabular-nums">EGP {fmt(Number(u.price || 0))}</p>
                <div className="flex items-center gap-1">
                  <select
                    value={u.status}
                    onChange={(e) => changeStatus(u, e.target.value)}
                    className="input-base !h-9 !w-28 text-xs appearance-none"
                  >
                    {UNIT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setEditing(u);
                      setFormOpen(true);
                    }}
                    className="w-9 h-9 rounded-xl hover:bg-secondary text-muted-foreground flex items-center justify-center"
                    aria-label="Edit unit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleting(u)}
                    className="w-9 h-9 rounded-xl hover:bg-red-50 text-muted-foreground hover:text-red-500 flex items-center justify-center"
                    aria-label="Delete unit"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop card grid */}
      <div className={`hidden sm:block ${view === 'grid' ? '' : 'hidden'}`}>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={22} className="text-muted-foreground" />}
            title="No units"
            description="Add units to your inventory to recommend them in the calculator."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filtered.map((u) => (
              <UnitCard
                key={u.id}
                unit={u}
                imageUrl={coverUrls[u.id]}
                onReserve={(unit) => changeStatus(unit, 'Reserved')}
                onPreview={(unit) => setPreview(unit)}
                onDetails={(unit) => {
                  setEditing(unit);
                  setFormOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div
        className={`hidden sm:block card-base !p-0 overflow-hidden ${view === 'table' ? '' : 'hidden'}`}
      >
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="table-th">Unit</th>
              <th className="table-th">Project</th>
              <th className="table-th">Type</th>
              <th className="table-th text-right">Area</th>
              <th className="table-th text-right">Price</th>
              <th className="table-th">Payment plan</th>
              <th className="table-th">Status</th>
              <th className="table-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={8} className="table-td">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-primary" />
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-td">
                  <EmptyState
                    icon={<Building2 size={22} className="text-muted-foreground" />}
                    title="No units"
                    description="Add units to your CRM to recommend them in the calculator."
                  />
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      {coverUrls[u.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coverUrls[u.id]}
                          alt={u.name}
                          className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                          <ImageIcon size={14} />
                        </div>
                      )}
                      <span className="font-medium text-foreground whitespace-nowrap">
                        {u.name}
                      </span>
                    </div>
                  </td>
                  <td className="table-td text-muted-foreground">{u.projectName || '—'}</td>
                  <td className="table-td">{u.unitType || '—'}</td>
                  <td className="table-td text-right tabular-nums">
                    {u.area ? `${u.area} m²` : '—'}
                  </td>
                  <td className="table-td text-right font-semibold tabular-nums">
                    EGP {fmt(Number(u.price || 0))}
                  </td>
                  <td className="table-td text-muted-foreground max-w-[180px] truncate">
                    {u.paymentPlan || '—'}
                  </td>
                  <td className="table-td">
                    <select
                      value={u.status}
                      onChange={(e) => changeStatus(u, e.target.value)}
                      className="input-base !h-9 !w-32 text-xs appearance-none"
                    >
                      {UNIT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditing(u);
                          setFormOpen(true);
                        }}
                        className="w-9 h-9 rounded-xl hover:bg-secondary text-muted-foreground flex items-center justify-center"
                        aria-label="Edit unit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleting(u)}
                        className="w-9 h-9 rounded-xl hover:bg-red-50 text-muted-foreground hover:text-red-500 flex items-center justify-center"
                        aria-label="Delete unit"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit modal */}
      {formOpen && (
        <UnitFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={saveUnit}
          projects={projects}
          initial={editing}
        />
      )}

      {/* Quick preview modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name || 'Unit'}
        size="md"
      >
        {preview && (
          <div>
            <div className="relative h-48 bg-muted">
              {coverUrls[preview.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrls[preview.id]}
                  alt={preview.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
                  <Building2 size={32} className="text-primary/50" />
                </div>
              )}
              <div className="absolute top-3 right-3">
                <StatusBadge status={preview.status} />
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-primary">
                  {preview.projectName || '—'}
                </p>
                <p className="text-lg font-bold text-foreground">
                  EGP {fmt(Number(preview.price || 0))}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Type', preview.unitType || '—'],
                  ['Area', preview.area ? `${preview.area} m²` : '—'],
                  ['Bedrooms', Number(preview.bedrooms) > 0 ? `${preview.bedrooms}` : null],
                  ['Bathrooms', Number(preview.bathrooms) > 0 ? `${preview.bathrooms}` : null],
                  ['Floor', preview.floor ? `${preview.floor}` : '—'],
                  ['Building / Block', preview.building || '—'],
                  ['Code', preview.unitCode || preview.name || '—'],
                  ['Status', preview.status || '—'],
                ]
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => (
                    <div key={String(k)} className="bg-muted/50 rounded-xl p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {k}
                      </p>
                      <p className="text-sm font-semibold text-foreground tabular-nums truncate">
                        {v}
                      </p>
                    </div>
                  ))}
              </div>

              {(Number(preview.downPaymentPct) > 0 ||
                Number(preview.installmentYears) > 0 ||
                preview.paymentPlan) && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-blue-800 mb-1">Payment plan</p>
                  <p className="text-xs text-blue-700">
                    {[
                      preview.downPaymentPct ? `${preview.downPaymentPct}% down payment` : '',
                      preview.installmentYears
                        ? `${preview.installmentYears} years installments`
                        : '',
                      preview.paymentPlan,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
              )}

              {preview.notes && <p className="text-sm text-muted-foreground">{preview.notes}</p>}

              <div className="flex items-center gap-2">
                {preview.status === 'Available' && (
                  <button
                    onClick={() => {
                      changeStatus(preview, 'Reserved');
                      setPreview(null);
                    }}
                    className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                  >
                    <BadgeCheck size={14} />
                    Reserve unit
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditing(preview);
                    setFormOpen(true);
                    setPreview(null);
                  }}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Pencil size={14} />
                  Edit unit
                </button>
                <button
                  onClick={() => {
                    setDeleting(preview);
                    setPreview(null);
                  }}
                  className="btn-ghost text-sm"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete unit" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-foreground">
            Delete unit <span className="font-semibold">{deleting?.name}</span>? This removes it
            from projects and the calculator suggestions.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={confirmDelete} className="btn-danger">
              Remove unit
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Unit form modal ─────────────────────────────────────────────────────────

function UnitFormModal({
  open,
  onClose,
  onSave,
  projects,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  projects: any[];
  initial?: any | null;
}) {
  const [form, setForm] = useState<any>({
    projectId: initial?.projectId || '',
    name: initial?.name || '',
    unitType: initial?.unitType || '',
    area: initial?.area ?? 0,
    floor: initial?.floor ?? 0,
    price: initial?.price ?? 0,
    paymentPlan: initial?.paymentPlan || '',
    downPaymentPct: initial?.downPaymentPct ?? 0,
    installmentYears: initial?.installmentYears ?? 0,
    installmentFrequency: initial?.installmentFrequency ?? 12,
    status: initial?.status || 'Available',
    notes: initial?.notes || '',
    imagePath: initial?.imagePath || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setForm({
        projectId: initial?.projectId || '',
        name: initial?.name || '',
        unitType: initial?.unitType || '',
        area: initial?.area ?? 0,
        floor: initial?.floor ?? 0,
        price: initial?.price ?? 0,
        paymentPlan: initial?.paymentPlan || '',
        downPaymentPct: initial?.downPaymentPct ?? 0,
        installmentYears: initial?.installmentYears ?? 0,
        installmentFrequency: initial?.installmentFrequency ?? 12,
        status: initial?.status || 'Available',
        notes: initial?.notes || '',
        imagePath: initial?.imagePath || '',
      });
      setCoverUrl('');
      if (initial?.imagePath) {
        unitsService.getFileUrl({ filePath: initial.imagePath } as UnitFile).then(setCoverUrl);
      }
    }
  }, [open, initial]);

  const num = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId) {
      toast.error('Project is required');
      return;
    }
    if (!form.name?.trim()) {
      toast.error('Unit name / number is required');
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    onSave({ ...form, name: form.name.trim() });
    setSaving(false);
  };

  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!initial?.id) {
      toast.error('Save the unit first, then upload its cover photo');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const row = await unitsService.uploadFile(initial.id, f);
      setForm((prev: any) => ({ ...prev, imagePath: row.file_path }));
      const url = await unitsService.getFileUrl({ filePath: row.file_path } as UnitFile);
      setCoverUrl(url);
      toast.success('Cover photo uploaded — remember to save');
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit unit' : 'Add unit'}
      subtitle="Unit details — shown to your sales team and the calculator"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-base">Project</label>
            <select
              value={form.projectId}
              onChange={(e) => setForm((f: any) => ({ ...f, projectId: e.target.value }))}
              className="input-base appearance-none"
            >
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-base">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f: any) => ({ ...f, status: e.target.value }))}
              className="input-base appearance-none"
            >
              {UNIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-base">Unit name / number</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))}
              className="input-base"
              placeholder="e.g. 14B / Apartment 12"
            />
          </div>
          <div>
            <label className="label-base">Unit type</label>
            <select
              value={form.unitType}
              onChange={(e) => setForm((f: any) => ({ ...f, unitType: e.target.value }))}
              className="input-base appearance-none"
            >
              <option value="">— Select —</option>
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label-base">Area (m²)</label>
            <input
              type="number"
              min={0}
              value={form.area || ''}
              onChange={(e) => setForm((f: any) => ({ ...f, area: num(e.target.value) }))}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Floor</label>
            <input
              type="number"
              value={form.floor || ''}
              onChange={(e) => setForm((f: any) => ({ ...f, floor: num(e.target.value) }))}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Price (EGP)</label>
            <input
              type="number"
              min={0}
              value={form.price || ''}
              onChange={(e) => setForm((f: any) => ({ ...f, price: num(e.target.value) }))}
              className="input-base"
            />
          </div>
        </div>
        <div>
          <label className="label-base">Payment plan</label>
          <input
            type="text"
            value={form.paymentPlan}
            onChange={(e) => setForm((f: any) => ({ ...f, paymentPlan: e.target.value }))}
            className="input-base"
            placeholder='e.g. "10% down / 6 years / quarterly"'
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label-base">Down payment %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.downPaymentPct || ''}
              onChange={(e) => setForm((f: any) => ({ ...f, downPaymentPct: num(e.target.value) }))}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Years</label>
            <input
              type="number"
              min={0}
              value={form.installmentYears || ''}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, installmentYears: num(e.target.value) }))
              }
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Installments per year</label>
            <select
              value={String(form.installmentFrequency || 12)}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, installmentFrequency: num(e.target.value, 12) }))
              }
              className="input-base appearance-none"
            >
              {[1, 2, 4, 12].map((n) => (
                <option key={n} value={n}>
                  {n === 12
                    ? 'Monthly'
                    : n === 4
                      ? 'Quarterly'
                      : n === 2
                        ? 'Semi-annual'
                        : 'Annual'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cover photo */}
        <div>
          <label className="label-base">Cover photo</label>
          <div className="flex items-center gap-3">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="Cover" className="w-16 h-16 rounded-xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                <ImageIcon size={20} />
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickCover}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !initial?.id}
              className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading
                ? 'Uploading…'
                : initial?.id
                  ? 'Upload cover photo'
                  : 'Save unit first, then upload'}
            </button>
            {form.imagePath && !initial?.id && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ImageIcon size={12} /> pending
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="label-base">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))}
            className="input-base min-h-[70px]"
            placeholder="Optional notes about this unit"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {initial?.id ? 'Save changes' : 'Add unit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

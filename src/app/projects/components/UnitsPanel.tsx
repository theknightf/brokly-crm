'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  X,
  Loader2,
  Trash2,
  Pencil,
  Image as ImageIcon,
  FileText,
  Film,
  Upload,
  Building2,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { unitsService, UnitFile } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';

interface Unit {
  id: string;
  projectId: string;
  name: string;
  unitType: string;
  area: number;
  floor: number;
  price: number;
  paymentPlan: string;
  downPaymentPct: number;
  installmentYears: number;
  installmentFrequency: number;
  notes: string;
  filesCount: number;
  createdAt?: string;
}

interface UnitsPanelProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

const UNIT_TYPES = ['1 BHK', '2 BHK', '3 BHK', 'Penthouse', 'Villa', 'Townhouse', 'Studio', 'Commercial'];

const emptyForm: Partial<Unit> = {
  name: '',
  unitType: '',
  area: 0,
  floor: 0,
  price: 0,
  paymentPlan: '',
  downPaymentPct: 0,
  installmentYears: 0,
  installmentFrequency: 12,
  notes: '',
};

function UnitFormModal({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Unit>) => void;
  initial?: Partial<Unit>;
}) {
  const [form, setForm] = useState<Partial<Unit>>(initial ?? emptyForm);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setForm(initial ?? emptyForm);
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      toast.error('Unit name / number is required');
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  if (!open) return null;

  const num = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <Modal open={open} onClose={onClose} title="Unit" subtitle="New or existing unit within this project" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-base">Unit name / number</label>
            <input
              type="text"
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input-base"
              placeholder="e.g. 14B / Apartment 12"
            />
          </div>
          <div>
            <label className="label-base">Unit type</label>
            <select
              value={form.unitType || ''}
              onChange={(e) => setForm((f) => ({ ...f, unitType: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, area: num(e.target.value) }))}
              className="input-base"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label-base">Floor</label>
            <input
              type="number"
              value={form.floor || ''}
              onChange={(e) => setForm((f) => ({ ...f, floor: num(e.target.value) }))}
              className="input-base"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label-base">Price (EGP)</label>
            <input
              type="number"
              min={0}
              value={form.price || ''}
              onChange={(e) => setForm((f) => ({ ...f, price: num(e.target.value) }))}
              className="input-base"
              placeholder="0"
            />
          </div>
        </div>
        <div>
          <label className="label-base">Payment plan</label>
          <input
            type="text"
            value={form.paymentPlan || ''}
            onChange={(e) => setForm((f) => ({ ...f, paymentPlan: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, downPaymentPct: num(e.target.value) }))}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Years</label>
            <input
              type="number"
              min={0}
              value={form.installmentYears || ''}
              onChange={(e) => setForm((f) => ({ ...f, installmentYears: num(e.target.value) }))}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Instalments / yr</label>
            <select
              value={String(form.installmentFrequency || 12)}
              onChange={(e) => setForm((f) => ({ ...f, installmentFrequency: num(e.target.value, 12) }))}
              className="input-base appearance-none"
            >
              {[1, 2, 4, 12].map((n) => (
                <option key={n} value={n}>
                  {n === 12 ? 'Monthly' : n === 4 ? 'Quarterly' : n === 2 ? 'Semi-annual' : 'Annual'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label-base">Notes</label>
          <textarea
            value={form.notes || ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
            {initial?.id ? 'Save Changes' : 'Add Unit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FileUploadRow({
  unit,
  onChanged,
}: {
  unit: Unit;
  onChanged: () => void;
}) {
  const [files, setFiles] = useState<UnitFile[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await unitsService.getFiles(unit.id);
      setFiles(data);
    } catch (err: any) {
      toast.error(err?.message || 'Could not load files');
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const resolveUrls = async () => {
    const next: Record<string, string> = {};
    for (const f of files) next[f.id] = await unitsService.getFileUrl(f);
    setUrls(next);
  };
  useEffect(() => {
    if (files.length) resolveUrls();
  }, [files]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      await unitsService.uploadFile(unit.id, f);
      toast.success('File uploaded');
      await loadFiles();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = async (file: UnitFile) => {
    try {
      await unitsService.deleteFile(file.id);
      toast.success('File deleted');
      await loadFiles();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Files ({files.length})</p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.mp4,.mov,.m4v,.webm,image/*,video/mp4,video/quicktime,video/webm,application/pdf"
          className="hidden"
          onChange={onPick}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : 'Add photo / video / PDF'}
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 size={12} className="animate-spin" /> Loading files…
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files yet — add unit photos, videos, or brochures.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {files.map((f) => (
            <div key={f.id} className="relative group rounded-lg overflow-hidden border border-border bg-muted/40 aspect-square">
              {f.kind === 'pdf' ? (
                <a
                  href={urls[f.id] || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  <FileText size={20} />
                  <span className="text-[9px] px-1 truncate max-w-full">{f.fileName}</span>
                </a>
              ) : f.kind === 'video' ? (
                urls[f.id] ? (
                  <video
                    src={urls[f.id]}
                    controls
                    preload="metadata"
                    className="w-full h-full object-cover"
                    title={f.fileName}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <Film size={20} />
                    <span className="text-[9px] px-1 truncate max-w-full">{f.fileName}</span>
                  </div>
                )
              ) : (
                <a
                  href={urls[f.id] || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full h-full"
                  title={f.fileName}
                >
                  {urls[f.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[f.id]} alt={f.fileName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon size={18} />
                    </div>
                  )}
                </a>
              )}
              <button
                onClick={() => removeFile(f)}
                className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity mobile-force-visible"
                title="Delete file"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitRow({ unit, projectName }: { unit: Unit; projectName: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const saveEdit = async (data: Partial<Unit>) => {
    try {
      await unitsService.update(unit.id, { ...unit, ...data });
      toast.success('Unit updated');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Update failed');
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await unitsService.delete(unit.id);
      toast.success('Unit deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="py-3 px-4 border border-border rounded-xl bg-card hover:border-muted-foreground/40 transition-colors">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Layers size={14} className="text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">{unit.name || 'Untitled unit'}</p>
            <p className="text-xs text-muted-foreground">
              {[unit.unitType, unit.area ? `${unit.area} m²` : '', unit.floor ? `Floor ${unit.floor}` : '']
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold tabular-nums text-foreground mr-1">
            {unit.price ? `${Number(unit.price).toLocaleString('en-US')} EGP` : '—'}
          </span>
          {unit.paymentPlan && (
            <span className="hidden sm:inline text-[11px] text-muted-foreground max-w-[180px] truncate mr-2" title={unit.paymentPlan}>
              {unit.paymentPlan}
            </span>
          )}
          <button
            onClick={() => setFilesOpen((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Unit files"
          >
            <ImageIcon size={13} />
            {unit.filesCount > 0 && (
              <span className="ml-0.5 text-[10px] font-semibold">{unit.filesCount}</span>
            )}
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Delete"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
      {filesOpen && (
        <div className="mt-3 pt-3 border-t border-border">
          <FileUploadRow unit={unit} onChanged={() => {}} />
        </div>
      )}
      <UnitFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
        initial={{ ...unit }}
      />
    </div>
  );
}

export default function UnitsPanel({ projectId, projectName, open, onClose }: UnitsPanelProps) {
  const { user } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await unitsService.getAll(projectId);
      setUnits(data as Unit[]);
    } catch (err: any) {
      toast.error(err?.message || 'Could not load units');
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const addUnit = async (data: Partial<Unit>) => {
    try {
      await unitsService.create({ ...data, projectId }, user?.id || '');
      toast.success('Unit added');
      setAddOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Add unit failed');
    }
  };

  if (!open) return null;

  const totalPrice = units.reduce((s, u) => s + Number(u.price || 0), 0);

  return (
    <Modal open={open} onClose={onClose} title="Units" subtitle={projectName} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 size={15} className="text-primary" />
            <span>
              <strong className="text-foreground">{units.length}</strong> unit
              {units.length !== 1 ? 's' : ''}
              {totalPrice > 0 && <> · {Number(totalPrice).toLocaleString('en-US')} EGP total</>}
            </span>
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={14} />
            Add Unit
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={26} className="animate-spin text-primary" />
          </div>
        ) : units.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center card-base">
            <Layers size={30} className="text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">No units yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add units to this project to track inventory.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {units.map((u) => (
              <UnitRow key={u.id} unit={u} projectName={projectName} />
            ))}
          </div>
        )}
      </div>

      <UnitFormModal open={addOpen} onClose={() => setAddOpen(false)} onSave={addUnit} />
    </Modal>
  );
}
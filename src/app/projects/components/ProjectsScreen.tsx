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
} from 'lucide-react';
import { toast } from 'sonner';
import { Project, ProjectStatus } from './mockProjects';
import { projectsService, developersService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';

interface Developer {
  id: string;
  name: string;
  isActive: boolean;
}

interface ProjectFormData {
  name: string;
  developerId: string;
  status: ProjectStatus;
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
  initial?: ProjectFormData;
  title: string;
  developers: Developer[];
}) {
  const [form, setForm] = useState<ProjectFormData>(
    initial ?? { name: '', developerId: developers[0]?.id || '', status: 'Active' }
  );
  const [errors, setErrors] = useState<Partial<ProjectFormData>>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(initial ?? { name: '', developerId: developers[0]?.id || '', status: 'Active' });
      setErrors({});
    }
  }, [open, initial]);

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
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-md fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4">
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

export default function ProjectsScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDev, setFilterDev] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | ''>('');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsData, devsData] = await Promise.all([
        projectsService.getAll(),
        developersService.getAll(),
      ]);
      setProjects(projectsData as Project[]);
      setDevelopers(devsData as Developer[]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let r = [...projects];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (p) => p.name.toLowerCase().includes(q) || p.developerName.toLowerCase().includes(q)
      );
    }
    if (filterDev) r = r.filter((p) => p.developerId === filterDev);
    if (filterStatus) r = r.filter((p) => p.status === filterStatus);
    return r;
  }, [projects, search, filterDev, filterStatus]);

  const handleAdd = async (data: ProjectFormData) => {
    try {
      const created = await projectsService.create(data, user?.id || '');
      setProjects((prev) => [created as Project, ...prev]);
      setAddOpen(false);
      toast.success(`Project "${data.name}" added`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add project');
    }
  };

  const handleEdit = async (data: ProjectFormData) => {
    if (!editTarget) return;
    try {
      const updated = await projectsService.update(editTarget.id, data);
      setProjects((prev) => prev.map((p) => (p.id === editTarget.id ? (updated as Project) : p)));
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
          Add Project
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
              placeholder="Search projects or developers…"
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
              Clear
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
        <div className="card-base !p-0 overflow-hidden">
          <table className="w-full table-mobile">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="table-th">Project Name</th>
                <th className="table-th">Developer</th>
                <th className="table-th">Status</th>
                <th className="table-th">Added</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((project) => (
                <tr key={project.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FolderOpen size={13} className="text-primary" />
                      </div>
                      <span className="font-medium text-sm text-foreground">{project.name}</span>
                    </div>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground">{project.developerName}</span>
                    </div>
                  </td>
                  <td className="table-td">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${project.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${project.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}
                      />
                      {project.status}
                    </span>
                  </td>
                  <td className="table-td text-sm text-muted-foreground">
                    {project.createdAt
                      ? new Date(project.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditTarget(project)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Edit project"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(project)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete project"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {projects.length} project
              {projects.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      <ProjectFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        title="Add New Project"
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
              }
            : undefined
        }
        title="Edit Project"
        developers={developers}
      />

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
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

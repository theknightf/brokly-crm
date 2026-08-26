'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ClipboardList, Flag, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  tasksService,
  TARGET_ROLE_OPTIONS,
  TARGET_ROLE_LABEL,
  type TaskItem,
} from '@/lib/services/peopleOpsService';

const PRIORITIES = [
  { value: 'Low', label: 'Low', cls: 'bg-muted text-muted-foreground' },
  { value: 'Medium', label: 'Medium', cls: 'bg-amber-50 text-amber-700' },
  { value: 'High', label: 'High', cls: 'bg-red-50 text-red-600' },
];

const priorityCls = (p: string) => PRIORITIES.find((x) => x.value === p)?.cls || PRIORITIES[1].cls;

export default function TasksTab() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState('all');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Medium');

  const load = async () => {
    setLoading(true);
    try {
      const list = await tasksService.getAll();
      setTasks(list);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!title.trim()) return toast.error('Enter a task title');
    setSaving(true);
    try {
      await tasksService.create({
        title: title.trim(),
        description: description.trim(),
        targetRole: role,
        dueDate: dueDate || undefined,
        priority,
      });
      toast.success('Task assigned');
      setTitle('');
      setDescription('');
      setDueDate('');
      setPriority('Medium');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await tasksService.remove(id);
      toast.success('Task removed');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove task');
    } finally {
      setDeletingId(null);
    }
  };

  const dueLabel = (d: string | null) => {
    if (!d) return 'No due date';
    const today = new Date().toISOString().split('T')[0];
    if (d < today) return `Overdue · ${d}`;
    if (d === today) return `Due today · ${d}`;
    return d;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Plus size={15} className="text-primary" /> Assign a task to a role
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Follow up on all Warm leads before Friday"
              className="input-base text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Details (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="input-base text-sm resize-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">For</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input-base text-sm"
            >
              {TARGET_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-base text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input-base text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary h-9 px-3 text-sm flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Assign
            task
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <ClipboardList size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Active tasks</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No tasks assigned yet. Add one above.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                      {TARGET_ROLE_LABEL(t.targetRole)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${priorityCls(t.priority)}`}
                    >
                      <Flag size={9} /> {t.priority}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                      <CalendarDays size={9} /> {dueLabel(t.dueDate)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => remove(t.id)}
                  disabled={deletingId === t.id}
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 flex-shrink-0"
                  title="Remove task"
                >
                  {deletingId === t.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

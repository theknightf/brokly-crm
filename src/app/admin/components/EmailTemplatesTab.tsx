'use client';
import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminSettingsService } from '@/lib/services/crmService';

interface Template {
  id: string;
  name: string;
  subjectEn: string;
  bodyEn: string;
  subjectAr: string;
  bodyAr: string;
  active: boolean;
}

interface TemplateEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    subjectEn: string;
    bodyEn: string;
    subjectAr: string;
    bodyAr: string;
  }) => Promise<void>;
  initial?: Template;
}

function TemplateEditor({ open, onClose, onSave, initial }: TemplateEditorProps) {
  const [subjectEn, setSubjectEn] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSubjectEn(initial?.subjectEn ?? '');
      setBodyEn(initial?.bodyEn ?? '');
      setSubjectAr(initial?.subjectAr ?? '');
      setBodyAr(initial?.bodyAr ?? '');
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = async () => {
    if (!subjectEn.trim() && !bodyEn.trim()) {
      toast.error('Enter at least an English subject or body');
      return;
    }
    setSaving(true);
    try {
      await onSave({ subjectEn, bodyEn, subjectAr, bodyAr });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-lg p-6 fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail size={16} className="text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {initial ? 'Edit Email Template' : 'New Email Template'}
            </h3>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5 leading-relaxed">
            Templates are stored in CRM settings and are ready for the email sender to consume.
            Placeholders: <code className="text-primary font-mono">{'{lead_name}'}</code>,{' '}
            <code className="text-primary font-mono">{'{property}'}</code>,{' '}
            <code className="text-primary font-mono">{'{date}'}</code>.
          </p>
          {[
            { label: 'Subject (English)', value: subjectEn, set: setSubjectEn, ar: false },
            { label: 'Subject (Arabic)', value: subjectAr, set: setSubjectAr, ar: true },
            { label: 'Body (English)', value: bodyEn, set: setBodyEn, ar: false },
            { label: 'Body (Arabic)', value: bodyAr, set: setBodyAr, ar: true },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-sm font-medium text-foreground mb-1.5">{f.label}</label>
              {f.label.toLowerCase().includes('subject') ? (
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="input-base w-full"
                  dir={f.ar ? 'rtl' : 'ltr'}
                  placeholder={f.ar ? 'موضوع الرسالة' : 'Email subject'}
                />
              ) : (
                <textarea
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  rows={4}
                  className="input-base w-full resize-none"
                  dir={f.ar ? 'rtl' : 'ltr'}
                  placeholder={f.ar ? 'نص الرسالة' : 'Email body'}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ open: boolean; initial?: Template }>({ open: false });

  const parse = (row: any): Template => {
    let extra: any = {};
    try {
      extra = JSON.parse(row.color || '{}');
    } catch {
      extra = {};
    }
    return {
      id: row.id,
      name: row.name,
      subjectEn: extra.subjectEn || '',
      bodyEn: extra.bodyEn || '',
      subjectAr: extra.subjectAr || '',
      bodyAr: extra.bodyAr || '',
      active: row.active !== false,
    };
  };

  const load = async () => {
    setLoading(true);
    try {
      const grouped: any = await adminSettingsService.getAll();
      const rows = (grouped?.emailTemplate || []).map(parse);
      setTemplates(rows);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (data: {
    subjectEn: string;
    bodyEn: string;
    subjectAr: string;
    bodyAr: string;
  }) => {
    const color = JSON.stringify(data);
    try {
      if (editor.initial?.id) {
        await adminSettingsService.update(editor.initial.id, {
          name: editor.initial.name,
          color,
          order: 0,
          active: true,
        });
        toast.success('Template updated');
      } else {
        const name = `Template ${templates.length + 1}`;
        await adminSettingsService.create('emailTemplate', { name, color, order: 0, active: true });
        toast.success('Template created');
      }
      setEditor({ open: false });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    }
  };

  const remove = async (t: Template) => {
    try {
      await adminSettingsService.delete(t.id);
      toast.success('Template deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Email Templates</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reusable subject + body pairs (English &amp; Arabic) used by automated and manual
            emails.
          </p>
        </div>
        <button
          onClick={() => setEditor({ open: true })}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} />
          New Template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-xl">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Mail size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No email templates yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create a template for onboarding, follow-ups, or lead notifications.
          </p>
          <button
            onClick={() => setEditor({ open: true })}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Plus size={14} />
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail size={15} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">
                      {t.subjectEn || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditor({ open: true, initial: t })}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit template"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete template"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {(t.bodyEn || t.bodyAr) && (
                <p
                  className="text-xs text-muted-foreground line-clamp-3 leading-relaxed"
                  dir={t.bodyAr ? 'rtl' : 'ltr'}
                >
                  {t.bodyAr || t.bodyEn}
                </p>
              )}
              <div className="flex items-center gap-2 mt-auto pt-1">
                {t.bodyAr && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                    AR
                  </span>
                )}
                {t.bodyEn && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    EN
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditor
        open={editor.open}
        onClose={() => setEditor({ open: false })}
        onSave={handleSave}
        initial={editor.initial}
      />
    </div>
  );
}

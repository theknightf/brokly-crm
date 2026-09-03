'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileSpreadsheet, Loader2, Check, Plus, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { teamsService, adminSettingsService } from '@/lib/services/crmService';
import { parseLeadFile, type ParsedRow } from '@/lib/leadsImport';
import { PIPELINE_STAGES } from './leadStages';

interface ImportLeadsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const STAGE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

export default function ImportLeadsModal({ open, onClose, onImported }: ImportLeadsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [source, setSource] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);

  const [stage, setStage] = useState('Fresh Leads');
  const [stageQuery, setStageQuery] = useState('');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageColor, setStageColor] = useState('#22c55e');
  const [creatingStage, setCreatingStage] = useState(false);

  const [assignee, setAssignee] = useState(''); // '' = Pool, '__ROUND_ROBIN__' = RR, else user id

  const reset = useCallback(() => {
    setFileName('');
    setRows([]);
    setParsing(false);
    setImporting(false);
    setSource('');
    setSourceQuery('');
    setSourceOpen(false);
    setStage('Fresh Leads');
    setStageQuery('');
    setStageOpen(false);
    setAssignee('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  // Load dropdown data when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingMeta(true);
    Promise.all([
      fetch('/api/lead-sources?active=true', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => (j.sources || []).map((s: any) => ({ id: s.id, name: s.name })))
        .catch(() => []),
      adminSettingsService
        .getAll()
        .then((g: any) =>
          (g.pipelineStages || [])
            .filter((s: any) => s.active)
            .map((s: any) => ({ id: s.id, name: s.name, color: s.color }))
        )
        .catch(() => PIPELINE_STAGES.map((s) => ({ id: s, name: s }))),
      teamsService
        .getAssignableUsers()
        .then((d: any) => (d || []).map((u: any) => ({ id: u.id, name: u.name })))
        .catch(() => []),
    ])
      .then(([srcs, stgs, ags]) => {
        setSources(srcs);
        const stagesToUse = stgs.length ? stgs : PIPELINE_STAGES.map((s) => ({ id: s, name: s }));
        setStages(stagesToUse);
        if (!stagesToUse.find((s) => s.name === 'Fresh Leads') && stagesToUse.length) {
          setStage(stagesToUse[0].name);
        }
        setAgents(ags);
      })
      .finally(() => setLoadingMeta(false));
  }, [open ]);

  // Close creatable dropdowns on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-cb="source"]')) setSourceOpen(false);
      if (!t.closest('[data-cb="stage"]')) setStageOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    try {
      const res = await parseLeadFile(file, undefined, agents.length ? agents : undefined);
      if (!res.rows.length) {
        toast.error('No rows found in file');
        return;
      }
      setFileName(file.name);
      setRows(res.rows);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to read file');
    } finally {
      setParsing(false);
    }
  };

  const handleCreateSource = async () => {
    const name = sourceQuery.trim();
    if (name.length < 2) {
      toast.error('Source name min 2 chars');
      return;
    }
    const existing = sources.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setSource(existing.name);
      setSourceQuery('');
      setSourceOpen(false);
      return;
    }
    setCreatingSource(true);
    try {
      const res = await fetch('/api/lead-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Failed to create source');
      setSources((prev) => [...prev, { id: j.source.id, name: j.source.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setSource(j.source.name);
      setSourceQuery('');
      setSourceOpen(false);
      toast.success(`Source "${j.source.name}" saved`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save source');
    } finally {
      setCreatingSource(false);
    }
  };

  const handleCreateStage = async () => {
    const name = stageQuery.trim();
    if (name.length < 2) {
      toast.error('Stage name min 2 chars');
      return;
    }
    const existing = stages.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setStage(existing.name);
      setStageQuery('');
      setStageOpen(false);
      return;
    }
    setCreatingStage(true);
    try {
      const created = await adminSettingsService.create('pipelineStages', {
        name,
        color: stageColor,
        order: stages.length + 1,
        active: true,
      });
      const ns = { id: created.id, name: created.name, color: created.color || stageColor };
      setStages((prev) => [...prev, ns]);
      setStage(ns.name);
      setStageQuery('');
      setStageOpen(false);
      toast.success(`Stage "${ns.name}" saved`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save stage');
    } finally {
      setCreatingStage(false);
    }
  };

  const filteredSources = sources.filter((s) => s.name.toLowerCase().includes(sourceQuery.toLowerCase()));
  const showAddSource =
    sourceQuery.trim().length >= 2 &&
    !sources.some((s) => s.name.toLowerCase() === sourceQuery.trim().toLowerCase());

  const filteredStages = stages.filter((s) => s.name.toLowerCase().includes(stageQuery.toLowerCase()));
  const showAddStage =
    stageQuery.trim().length >= 2 &&
    !stages.some((s) => s.name.toLowerCase() === stageQuery.trim().toLowerCase());

  const canConfirm = rows.length > 0 && source.trim().length > 0 && stage.trim().length > 0 && !parsing && !importing;

  const handleConfirm = async () => {
    if (!rows.length) {
      toast.error('Please choose a file first');
      return;
    }
    if (!source.trim()) {
      toast.error('Please select a Source');
      return;
    }
    if (!stage.trim()) {
      toast.error('Please select a Stage');
      return;
    }
    setImporting(true);
    try {
      const matched = sources.find((s) => s.name.toLowerCase() === source.trim().toLowerCase());
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          globalSource: source.trim(),
          sourceId: matched?.id || null,
          globalStage: stage.trim(),
          globalAssignedTo: assignee || '',
          duplicateAction: 'skip',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Import failed');
      const imported = Number(j.imported || 0);
      const skipped = Number(j.skipped || 0);
      toast.success(
        skipped > 0
          ? `Successfully imported ${imported} leads, ${skipped} duplicates skipped.`
          : `Successfully imported ${imported} leads.`,
        { duration: 5000 }
      );
      handleClose();
      onImported();
    } catch (e: any) {
      toast.error(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const hasFile = rows.length > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Import Leads" subtitle="Upload / Import Sheet — استيراد الليدات" size="lg">
      <div className="p-5 sm:p-6 space-y-5">
        {/* File picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {!hasFile ? (
          <button
            type="button"
            disabled={parsing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-colors border-zinc-200 dark:border-zinc-800 hover:border-primary/50 bg-white dark:bg-zinc-900 disabled:opacity-60"
          >
            <span className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              {parsing ? <Loader2 size={22} className="animate-spin" /> : <FileSpreadsheet size={22} />}
            </span>
            <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {parsing ? 'Reading file…' : 'Upload / Import Sheet'}
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Select an Excel (.xlsx) or CSV file
            </span>
          </button>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                File: {fileName} — Total Leads: {rows.length}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">ملف: {fileName} — الإجمالي: {rows.length}</p>
            </div>
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 shrink-0"
            >
              Change
            </button>
          </div>
        )}

        {/* 3 core selectors — shown once a file is parsed */}
        {hasFile && (
          <div className="space-y-4">
            {/* 1. Source */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                Source (مصدر الليد) <span className="text-red-500">*</span>
              </label>
              <div className="relative" data-cb="source">
                <div className="relative">
                  <input
                    value={sourceOpen ? sourceQuery : source}
                    onFocus={() => {
                      setSourceOpen(true);
                      setSourceQuery(source);
                    }}
                    onChange={(e) => {
                      setSourceQuery(e.target.value);
                      setSourceOpen(true);
                    }}
                    placeholder="Select or type source…"
                    disabled={importing || loadingMeta}
                    className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pe-9 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                  />
                  <ChevronDown size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                {sourceOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                    {filteredSources.length === 0 && !showAddSource && (
                      <p className="px-3 py-3 text-xs text-zinc-500 text-center">No sources found</p>
                    )}
                    {filteredSources.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSource(s.name);
                          setSourceQuery('');
                          setSourceOpen(false);
                        }}
                        className="w-full text-start px-3 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-between"
                      >
                        <span>{s.name}</span>
                        {source === s.name && <Check size={14} className="text-lime-600" />}
                      </button>
                    ))}
                    {showAddSource && (
                      <button
                        type="button"
                        disabled={creatingSource}
                        onClick={handleCreateSource}
                        className="w-full text-start px-3 py-2.5 text-sm font-semibold bg-lime-50 dark:bg-lime-500/10 hover:bg-lime-100 dark:hover:bg-lime-500/20 text-lime-700 dark:text-lime-300 border-t border-lime-200 dark:border-lime-500/20 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Plus size={14} />
                        {creatingSource ? 'Saving…' : `+ Add new source: ${sourceQuery.trim()}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Stage */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                Stage (مرحلة الليد) <span className="text-red-500">*</span>
              </label>
              <div className="relative" data-cb="stage">
                <div className="relative">
                  <input
                    value={stageOpen ? stageQuery : stage}
                    onFocus={() => {
                      setStageOpen(true);
                      setStageQuery(stage);
                    }}
                    onChange={(e) => {
                      setStageQuery(e.target.value);
                      setStageOpen(true);
                    }}
                    placeholder="Select or type stage…"
                    disabled={importing || loadingMeta}
                    className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pe-9 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                  />
                  <ChevronDown size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
                {stageOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                    {filteredStages.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setStage(s.name);
                          setStageQuery('');
                          setStageOpen(false);
                        }}
                        className="w-full text-start px-3 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: (s as any).color || '#6b7280' }}
                        />
                        <span className="flex-1">{s.name}</span>
                        {stage === s.name && <Check size={14} className="text-lime-600" />}
                      </button>
                    ))}
                    {showAddStage ? (
                      <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={stageQuery}
                            onChange={(e) => setStageQuery(e.target.value)}
                            placeholder="New stage name"
                            disabled={creatingStage}
                            className="flex-1 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs focus:border-lime-400 outline-none"
                          />
                          <input
                            type="color"
                            value={stageColor}
                            onChange={(e) => setStageColor(e.target.value)}
                            title="Stage color"
                            className="w-10 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1 bg-white dark:bg-zinc-900"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={creatingStage || stageQuery.trim().length < 2}
                          onClick={handleCreateStage}
                          className="w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40"
                        >
                          {creatingStage ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          {creatingStage ? 'Saving…' : '+ Add new stage'}
                        </button>
                      </div>
                    ) : (
                      filteredStages.length === 0 && (
                        <p className="px-3 py-3 text-xs text-zinc-500 text-center">No stages found</p>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Assign To */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                Assign To (تعيين إلى)
              </label>
              <div className="relative">
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={importing || loadingMeta}
                  className="w-full appearance-none bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pe-9 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                >
                  <option value="">Unassigned / Pool (بدون تعيين)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="__ROUND_ROBIN__">Round-Robin (توزيع عادل بالتساوي على التيم)</option>
                </select>
                <ChevronDown size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            <X size={14} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-40 hover:brightness-105"
          >
            {importing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload size={15} />
                Confirm & Import (تأكيد واستيراد)
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

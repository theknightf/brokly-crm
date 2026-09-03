'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileSpreadsheet, Loader2, Check, Plus, ChevronDown, X, Users, RefreshCw } from 'lucide-react';
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

// Sales-relevant roles shown in the Assignee dropdown (live users only, active members).
const ASSIGNABLE_ROLES = new Set([
  'owner',
  'admin',
  'branch_manager',
  'team_leader',
  'senior_agent',
  'agent',
  'telecaller',
  'broker',
  'sales',
]);

export interface ImportAgent {
  id: string;
  name: string;
  role: string;
  teamName?: string;
}

function roleLabel(role?: string): string {
  const r = String(role || 'agent').toLowerCase();
  const map: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    branch_manager: 'Branch Manager',
    team_leader: 'Team Lead',
    senior_agent: 'Senior Agent',
    agent: 'Sales Agent',
    telecaller: 'Telecaller',
    broker: 'Broker',
    sales: 'Sales',
  };
  return map[r] || r;
}

function initialsOf(name: string): string {
  const parts = String(name || '?').trim().split(/\s+/).map((p) => p[0]).filter(Boolean);
  return (parts.join('').slice(0, 2) || '?').toUpperCase();
}

export default function ImportLeadsModal({ open, onClose, onImported }: ImportLeadsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [agents, setAgents] = useState<ImportAgent[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [source, setSource] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceCreateOpen, setSourceCreateOpen] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);

  const [stage, setStage] = useState('Fresh Leads');
  const [stageQuery, setStageQuery] = useState('');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageCreateOpen, setStageCreateOpen] = useState(false);
  const [stageColor, setStageColor] = useState('#22c55e');
  const [creatingStage, setCreatingStage] = useState(false);

  // 'unassigned' = Pool, 'round-robin' = RR, else the user's unique id
  const [assignee, setAssignee] = useState('unassigned');
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const reset = useCallback(() => {
    setFileName('');
    setRows([]);
    setParsing(false);
    setImporting(false);
    setSource('');
    setSourceQuery('');
    setSourceOpen(false);
    setSourceCreateOpen(false);
    setStage('Fresh Leads');
    setStageQuery('');
    setStageOpen(false);
    setStageCreateOpen(false);
    setAssignee('unassigned');
    setAssigneeOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  // Load dropdown data when modal opens — Sources, Stages, and the LIVE users list
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingMeta(true);
    (async () => {
      const [srcs, stgs, rawAgents] = await Promise.all([
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
        // Live CRM users (permission-aware: admin sees all active, others see scope)
        teamsService.getAssignableUsers().catch(() => [] as any[]),
      ]);
      if (!alive) return;
      setSources(srcs);
      const stagesToUse = stgs.length ? stgs : PIPELINE_STAGES.map((s) => ({ id: s, name: s }));
      setStages(stagesToUse);
      if (!stagesToUse.find((s: { name: string }) => s.name === 'Fresh Leads') && stagesToUse.length) {
        setStage(stagesToUse[0].name);
      }
      // Keep only active members with sales-relevant roles
      let list: ImportAgent[] = (rawAgents || [])
        .filter((u: any) => ASSIGNABLE_ROLES.has(String(u.role || 'agent').toLowerCase()))
        .map((u: any) => ({ id: u.id, name: u.name, role: u.role || 'agent' }));
      if (!list.length) {
        list = (rawAgents || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role || 'agent' }));
      }
      // Best-effort: attach each member's team badge (never blocks the dropdown)
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const ids = list.map((u) => u.id);
        const [teamsList, profilesRes] = await Promise.all([
          teamsService.getAll().catch(() => [] as { id: string; name: string }[]),
          ids.length
            ? supabase.from('user_profiles').select('id, team_id')
            : Promise.resolve({ data: [] as any[] } as any),
        ]);
        if (!alive) return;
        const teamNameById = new Map((teamsList as any[]).map((t: any) => [t.id, t.name]));
        const teamIdByUser = new Map<string, string | null>(
          (((profilesRes as any)?.data || []) as any[]).map((r: any) => [r.id, r.team_id])
        );
        list = list.map((u) => ({
          ...u,
          teamName: teamNameById.get(teamIdByUser.get(u.id) || '') || undefined,
        }));
      } catch {
        /* team badges stay hidden — users list still works */
      }
      if (alive) setAgents(list);
    })().finally(() => {
      if (alive) setLoadingMeta(false);
    });
    return () => {
      alive = false;
    };
  }, [open ]);

  // Close dropdowns on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-cb="source"]')) setSourceOpen(false);
      if (!t.closest('[data-cb="stage"]')) setStageOpen(false);
      if (!t.closest('[data-cb="assignee"]')) setAssigneeOpen(false);
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
      setSourceCreateOpen(false);
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
      setSourceCreateOpen(false);
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
      setStageCreateOpen(false);
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
      setStageCreateOpen(false);
      toast.success(`Stage "${ns.name}" saved`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save stage');
    } finally {
      setCreatingStage(false);
    }
  };

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
          // 'unassigned' = Pool, 'round-robin' = even split, else the user's unique id
          globalAssignedTo: assignee,
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
    <Modal open={open} onClose={handleClose} title="Import Leads" subtitle="Upload / Import Sheet — استيراد الليدات" size="xl">
      <div className="p-6 sm:p-8 space-y-6">
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
          <div className="space-y-5">
            {/* 1. Source — clean select box with inline creatable action */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Source (مصدر الليد) <span className="text-red-500">*</span>
              </label>
              <div className="relative" data-cb="source">
                <button
                  type="button"
                  disabled={importing || loadingMeta}
                  onClick={() => setSourceOpen((o) => !o)}
                  className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-3 pe-10 text-sm text-start focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none flex items-center justify-between gap-2 disabled:opacity-60"
                >
                  <span className={source ? 'font-medium' : 'text-zinc-400'}>
                    {source || 'Select source…'}
                  </span>
                  <ChevronDown
                    size={15}
                    className={`text-zinc-400 shrink-0 transition-transform ${sourceOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {sourceOpen && (
                  <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                    <div className="max-h-52 overflow-y-auto py-1">
                      {sources.length === 0 && (
                        <p className="px-3 py-3 text-xs text-zinc-500 text-center">No sources yet — add one below</p>
                      )}
                      {sources.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSource(s.name);
                            setSourceOpen(false);
                            setSourceCreateOpen(false);
                          }}
                          className={`w-full text-start px-3.5 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${
                            source === s.name
                              ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          <span>{s.name}</span>
                          {source === s.name && <Check size={14} className="shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-zinc-200 dark:border-zinc-700 p-2">
                      {!sourceCreateOpen ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSourceCreateOpen(true);
                            setSourceQuery('');
                          }}
                          className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-lime-700 dark:text-lime-300 hover:bg-lime-50 dark:hover:bg-lime-500/10 flex items-center gap-2 transition-colors"
                        >
                          <Plus size={14} />
                          Add New Source
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={sourceQuery}
                            onChange={(e) => setSourceQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSource();
                              if (e.key === 'Escape') {
                                setSourceCreateOpen(false);
                                setSourceQuery('');
                              }
                            }}
                            placeholder="New source name…"
                            disabled={creatingSource}
                            className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleCreateSource}
                            disabled={creatingSource || sourceQuery.trim().length < 2}
                            title="Save source"
                            className="w-9 h-9 rounded-lg bg-lime-500 hover:bg-lime-400 text-zinc-950 flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
                          >
                            {creatingSource ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceCreateOpen(false);
                              setSourceQuery('');
                            }}
                            title="Cancel"
                            className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Stage — clean select box with inline creatable action + color tag */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Stage (مرحلة الليد) <span className="text-red-500">*</span>
              </label>
              <div className="relative" data-cb="stage">
                <button
                  type="button"
                  disabled={importing || loadingMeta}
                  onClick={() => setStageOpen((o) => !o)}
                  className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-3 pe-10 text-sm text-start focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none flex items-center gap-2 disabled:opacity-60"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: (stages.find((s) => s.name === stage) as any)?.color || '#84cc16' }}
                  />
                  <span className="flex-1 font-medium truncate">{stage || 'Select stage…'}</span>
                  <ChevronDown
                    size={15}
                    className={`text-zinc-400 shrink-0 transition-transform ${stageOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {stageOpen && (
                  <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                    <div className="max-h-52 overflow-y-auto py-1">
                      {stages.length === 0 && (
                        <p className="px-3 py-3 text-xs text-zinc-500 text-center">No stages yet — add one below</p>
                      )}
                      {stages.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStage(s.name);
                            setStageOpen(false);
                            setStageCreateOpen(false);
                          }}
                          className={`w-full text-start px-3.5 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                            stage === s.name
                              ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ background: (s as any).color || '#6b7280' }}
                          />
                          <span className="flex-1">{s.name}</span>
                          {stage === s.name && <Check size={14} className="shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-zinc-200 dark:border-zinc-700 p-2">
                      {!stageCreateOpen ? (
                        <button
                          type="button"
                          onClick={() => {
                            setStageCreateOpen(true);
                            setStageQuery('');
                          }}
                          className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-lime-700 dark:text-lime-300 hover:bg-lime-50 dark:hover:bg-lime-500/10 flex items-center gap-2 transition-colors"
                        >
                          <Plus size={14} />
                          Add New Stage
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={stageQuery}
                              onChange={(e) => setStageQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateStage();
                                if (e.key === 'Escape') {
                                  setStageCreateOpen(false);
                                  setStageQuery('');
                                }
                              }}
                              placeholder="New stage name…"
                              disabled={creatingStage}
                              className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleCreateStage}
                              disabled={creatingStage || stageQuery.trim().length < 2}
                              title="Save stage"
                              className="w-9 h-9 rounded-lg bg-lime-500 hover:bg-lime-400 text-zinc-950 flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
                            >
                              {creatingStage ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStageCreateOpen(false);
                                setStageQuery('');
                              }}
                              title="Cancel"
                              className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 px-0.5">
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 me-1">Color:</span>
                            {STAGE_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setStageColor(c)}
                                title={c}
                                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                                  stageColor === c ? 'ring-2 ring-offset-2 ring-lime-500 ring-offset-white dark:ring-offset-zinc-900' : 'ring-1 ring-zinc-300 dark:ring-zinc-600'
                                }`}
                                style={{ background: c }}
                              />
                            ))}
                            <input
                              type="color"
                              value={stageColor}
                              onChange={(e) => setStageColor(e.target.value)}
                              title="Custom color"
                              className="w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-600 p-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Assign To — live users, grouped: Pool / Round-Robin / Team Members */}
            <div>
              <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Assign To (تعيين إلى)
              </label>
              <div className="relative" data-cb="assignee">
                <button
                  type="button"
                  disabled={importing || loadingMeta}
                  onClick={() => setAssigneeOpen((o) => !o)}
                  className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 pe-10 text-sm text-start focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none flex items-center gap-2.5 disabled:opacity-60"
                >
                  {assignee === 'round-robin' ? (
                    <>
                      <span className="w-8 h-8 rounded-full bg-lime-500 text-zinc-950 flex items-center justify-center shrink-0">
                        <RefreshCw size={14} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">Round-Robin</span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          توزيع عادل بالتساوي على التيم · {agents.length} agents
                        </span>
                      </span>
                    </>
                  ) : assignee !== 'unassigned' && agents.find((a) => a.id === assignee) ? (
                    <>
                      <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {initialsOf(agents.find((a) => a.id === assignee)!.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">
                          {agents.find((a) => a.id === assignee)!.name}
                        </span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {roleLabel(agents.find((a) => a.id === assignee)!.role)}
                          {agents.find((a) => a.id === assignee)!.teamName
                            ? ` · ${agents.find((a) => a.id === assignee)!.teamName}`
                            : ''}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
                        <Users size={14} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">Unassigned / Pool</span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">بدون تعيين</span>
                      </span>
                    </>
                  )}
                  <ChevronDown
                    size={15}
                    className={`text-zinc-400 shrink-0 transition-transform ${assigneeOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {assigneeOpen && (
                  <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                    <div className="max-h-60 overflow-y-auto py-1">
                      {/* Option 1 — Pool */}
                      <button
                        type="button"
                        onClick={() => {
                          setAssignee('unassigned');
                          setAssigneeOpen(false);
                        }}
                        className={`w-full text-start px-3.5 py-2.5 flex items-center gap-2.5 transition-colors ${
                          assignee === 'unassigned'
                            ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
                          <Users size={14} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm">بدون تعيين (Pool / Unassigned)</span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Default fallback option</span>
                        </span>
                        {assignee === 'unassigned' && <Check size={14} className="shrink-0" />}
                      </button>
                      {/* Option 2 — Round-Robin */}
                      <button
                        type="button"
                        onClick={() => {
                          setAssignee('round-robin');
                          setAssigneeOpen(false);
                        }}
                        className={`w-full text-start px-3.5 py-2.5 flex items-center gap-2.5 transition-colors ${
                          assignee === 'round-robin'
                            ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-full bg-lime-500 text-zinc-950 flex items-center justify-center shrink-0">
                          <RefreshCw size={14} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm">توزيع عادل بالتساوي (Round-Robin)</span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                            Even split across {agents.length} active sales agents
                          </span>
                        </span>
                        {assignee === 'round-robin' && <Check size={14} className="shrink-0" />}
                      </button>
                      {/* Group divider */}
                      <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-1">
                        أعضاء الفريق (Team Members) · {agents.length}
                      </p>
                      {agents.length === 0 && (
                        <p className="px-3.5 py-3 text-xs text-zinc-500 text-center">
                          {loadingMeta ? 'Loading team…' : 'No active sales members found'}
                        </p>
                      )}
                      {agents.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setAssignee(a.id);
                            setAssigneeOpen(false);
                          }}
                          className={`w-full text-start px-3.5 py-2.5 flex items-center gap-2.5 transition-colors ${
                            assignee === a.id
                              ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {initialsOf(a.name)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm truncate">{a.name}</span>
                            <span className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{roleLabel(a.role)}</span>
                              {a.teamName && (
                                <span className="text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-px rounded-full truncate max-w-[120px]">
                                  {a.teamName}
                                </span>
                              )}
                            </span>
                          </span>
                          {assignee === a.id && <Check size={14} className="shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
            className="h-11 px-5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            <X size={14} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="h-11 px-6 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 text-sm font-bold flex items-center gap-2 disabled:opacity-40 shadow-sm transition-colors"
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

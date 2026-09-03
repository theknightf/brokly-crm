'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Settings2,
  RefreshCw,
  Plus,
  Check,
  X,
  FileText,
  Users,
  Database,
  Eye,
  Palette,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { leadsService, teamsService, adminSettingsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { parseLeadFile, ImportField, ImportParseResult, ParsedRow } from '@/lib/leadsImport';
import { PIPELINE_STAGES } from './leadStages';

const IMPORT_FIELDS: { value: ImportField; label: string; required?: boolean }[] = [
  { value: 'phone', label: 'Mobile / Phone *', required: true },
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'budget', label: 'Budget' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' },
  { value: 'developer', label: 'Developer' },
  { value: 'project', label: 'Project' },
  { value: 'unit', label: 'Unit' },
  { value: 'interestLevel', label: 'Interest Level' },
  { value: 'assigned', label: 'Assigned To' },
  { value: 'location', label: 'Location' },
  { value: 'notes', label: 'Notes' },
  { value: 'date', label: 'Date' },
];

const STEP_LABELS = [
  { n: 1, title: 'File Upload', desc: 'رفع الملف' },
  { n: 2, title: 'Batch Configuration', desc: 'إعدادات الشيت' },
  { n: 3, title: 'Mapping & Preview', desc: 'المطابقة والمعاينة' },
  { n: 4, title: 'Import & Summary', desc: 'التأكيد والملخص' },
];

const STAGE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#f97316', '#6b7280', '#10b981'];

interface ImportLeadsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportLeadsModal({ open, onClose, onImported }: ImportLeadsModalProps) {
  const { user, profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [storedFile, setStoredFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<number, ImportField>>({});
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [duplicatePhones, setDuplicatePhones] = useState<Set<string>>(new Set());

  // Global Settings — Batch Configuration Panel
  const [defaultSource, setDefaultSource] = useState('');
  const [sourceList, setSourceList] = useState<{ id: string; name: string }[]>([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [addingSource, setAddingSource] = useState(false);

  const [defaultStage, setDefaultStage] = useState('New Fresh');
  const [stageList, setStageList] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [stageQuery, setStageQuery] = useState('');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageColor, setStageColor] = useState('#22c55e');
  const [addingStage, setAddingStage] = useState(false);

  const [defaultOwner, setDefaultOwner] = useState<string>('');
  const [ownerList, setOwnerList] = useState<{ id: string; name: string }[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ imported: number; updated: number; skipped: number; invalid: number; total: number; details: string[] } | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFileName('');
    setStoredFile(null);
    setResult(null);
    setMapping({});
    setRows([]);
    setDuplicatePhones(new Set());
    setDefaultSource('');
    setSourceQuery('');
    setSourceOpen(false);
    setDefaultStage('New Fresh');
    setStageQuery('');
    setStageOpen(false);
    setDefaultOwner('');
    setDuplicateAction('skip');
    setProgress(null);
    setSummary(null);
    setParsing(false);
    setCheckingDupes(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  // Fetch live meta on open
  useEffect(() => {
    if (!open) return;
    setLoadingMeta(true);
    Promise.all([
      teamsService.getAssignableUsers().then((d: any) => (d || []).map((u: any) => ({ id: u.id, name: u.name }))).catch(() => []),
      fetch('/api/lead-sources?active=true', { cache: 'no-store' }).then(r => r.json()).then(j => (j.sources || []).map((s: any) => ({ id: s.id, name: s.name }))).catch(() => []),
      adminSettingsService.getAll().then((g: any) => (g.pipelineStages || []).filter((s: any) => s.active).map((s: any) => ({ id: s.id, name: s.name, color: s.color }))).catch(() => PIPELINE_STAGES.map(s => ({ id: s, name: s, color: '#6b7280' }))),
    ]).then(([users, sources, stages]) => {
      setOwnerList(users);
      setSourceList(sources);
      const stagesToUse = stages.length ? stages : PIPELINE_STAGES.map(s => ({ id: s, name: s, color: '#6b7280' }));
      setStageList(stagesToUse);
      if (!stagesToUse.find(s => s.name === 'New Fresh') && stagesToUse.length) {
        setDefaultStage(stagesToUse[0].name);
      }
    }).finally(() => setLoadingMeta(false));
  }, [open]);

  // Close dropdowns on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-combobox="source"]')) setSourceOpen(false);
      if (!target.closest('[data-combobox="stage"]')) setStageOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleAddSource = async (nameRaw?: string) => {
    const name = (nameRaw ?? sourceQuery).trim();
    if (!name || name.length < 2) { toast.error('Source name min 2 chars'); return; }
    if (sourceList.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Source already exists'); setDefaultSource(sourceList.find(s=> s.name.toLowerCase()===name.toLowerCase())!.name); setSourceQuery(''); setSourceOpen(false); return;
    }
    if (!isAdmin) { toast.error('Only Admin/Owner can create new sources'); return; }
    setAddingSource(true);
    try {
      const res = await fetch('/api/lead-sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Failed to create source');
      const newSrc = j.source;
      setSourceList(prev => [...prev, { id: newSrc.id, name: newSrc.name }].sort((a,b)=> a.name.localeCompare(b.name)));
      setDefaultSource(newSrc.name);
      setSourceQuery('');
      setSourceOpen(false);
      toast.success(`Source "${newSrc.name}" added`);
    } catch (e:any) { toast.error(e?.message || 'Failed to add source'); } finally { setAddingSource(false); }
  };

  const handleAddStage = async () => {
    const name = stageQuery.trim();
    if (!name || name.length < 2) { toast.error('Stage name min 2 chars'); return; }
    if (stageList.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Stage already exists'); setDefaultStage(stageList.find(s=> s.name.toLowerCase()===name.toLowerCase())!.name); setStageQuery(''); setStageOpen(false); return;
    }
    if (!isAdmin) { toast.error('Only Admin/Owner can create new stages'); return; }
    setAddingStage(true);
    try {
      const created = await adminSettingsService.create('pipelineStages', { name, color: stageColor, order: stageList.length + 1, active: true });
      const newStage = { id: created.id, name: created.name, color: created.color || stageColor };
      setStageList(prev => [...prev, newStage]);
      setDefaultStage(newStage.name);
      setStageQuery('');
      setStageOpen(false);
      toast.success(`Stage "${newStage.name}" added`);
    } catch (e:any) { toast.error(e?.message || 'Failed to create stage'); } finally { setAddingStage(false); }
  };

  const reloadDupes = async (parsed: ParsedRow[]) => {
    setCheckingDupes(true);
    try {
      const phones = parsed.map(r => r.phone || '').filter(Boolean);
      const existing = await leadsService.findDuplicatePhones(phones);
      const inFile = new Map<string, number>();
      phones.forEach(p => { const k = p.replace(/\D/g,''); inFile.set(k, (inFile.get(k)||0)+1); });
      const dupes = new Set<string>(existing);
      phones.forEach(p => { const k = p.replace(/\D/g,''); if ((inFile.get(k)||0) > 1) dupes.add(k); });
      setDuplicatePhones(dupes);
      setRows(parsed);
    } catch {
      setRows(parsed);
      setDuplicatePhones(new Set());
    } finally { setCheckingDupes(false); }
  };

  const processFile = async (file: File) => {
    setParsing(true);
    try {
      if (ownerList.length === 0) {
        try {
          const data = (await teamsService.getAssignableUsers()) as any[];
          setOwnerList((data || []).map((u:any)=> ({id:u.id, name:u.name})));
        } catch {}
      }
      const res = await parseLeadFile(file, undefined, ownerList.length ? ownerList : undefined);
      setStoredFile(file);
      setFileName(file.name);
      setResult(res);
      setMapping(res.mapping);
      await reloadDupes(res.rows);
      setStep(2);
      toast.success(`File parsed: ${res.rows.length} rows found`);
    } catch (err:any) { toast.error(err?.message || 'Failed to read file'); } finally { setParsing(false); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleMappingChange = async (headerIdx: number, field: ImportField | '') => {
    if (!result || !storedFile) return;
    const next: Record<number, ImportField> = { ...mapping };
    if (!field) delete next[headerIdx];
    else {
      Object.keys(next).forEach(k => { if (Number(k) !== headerIdx && next[Number(k)] === field) delete next[Number(k)]; });
      next[headerIdx] = field;
    }
    setMapping(next);
    setParsing(true);
    try {
      const res = await parseLeadFile(storedFile, next, ownerList);
      setRows(res.rows);
      setResult(res);
      const phones = res.rows.map(r => r.phone || '').filter(Boolean);
      const existing = await leadsService.findDuplicatePhones(phones);
      setDuplicatePhones(existing);
    } catch (err:any) { toast.error(err?.message || 'Failed to re-map'); } finally { setParsing(false); }
  };

  const getPreviewAssignee = (row: ParsedRow, index: number): string => {
    if (defaultOwner === '__ROUND_ROBIN__') {
      if (!ownerList.length) return 'Round-Robin';
      return ownerList[index % ownerList.length].name + ' (RR)';
    }
    if (defaultOwner) {
      return ownerList.find(u => u.id === defaultOwner)?.name || defaultOwner;
    }
    if (row.assignedName) return row.assignedName;
    return 'بدون تعيين / Pool';
  };

  const validRows = rows.filter(r => r.reasons.length === 0);
  const invalidRows = rows.filter(r => r.reasons.length > 0);
  const duplicateRows = rows.filter(r => r.phone && duplicatePhones.has(r.phone.replace(/\D/g,'')));
  const importableRows = rows.filter(r => {
    const dup = !!r.phone && duplicatePhones.has(r.phone.replace(/\D/g,''));
    if (r.reasons.length > 0) return false;
    if (duplicateAction === 'skip' && dup) return false;
    return !!r.phone;
  });

  const canProceedFromSettings = !!defaultSource && !!defaultStage;
  const unmappedColumns = result ? result.headers.filter((h,i)=> !mapping[i]).filter(Boolean) : [];

  const filteredSources = sourceList.filter(s => s.name.toLowerCase().includes(sourceQuery.toLowerCase()));
  const isSourceExactMatch = sourceList.some(s => s.name.toLowerCase() === sourceQuery.toLowerCase().trim());
  const showCreateSource = isAdmin && sourceQuery.trim().length >= 2 && !isSourceExactMatch;

  const filteredStages = stageList.filter(s => s.name.toLowerCase().includes(stageQuery.toLowerCase()));
  const isStageExactMatch = stageList.some(s => s.name.toLowerCase() === stageQuery.toLowerCase().trim());
  const showCreateStage = isAdmin && stageQuery.trim().length >= 2 && !isStageExactMatch;

  const doImport = async () => {
    if (!result) return;
    if (!canProceedFromSettings) { toast.error('Please select Source and Stage in Batch Configuration'); setStep(2); return; }
    setImporting(true);
    setProgress({ current: 0, total: rows.length });
    setSummary(null);

    const chunkSize = 50;
    const chunks: ParsedRow[][] = [];
    for (let i=0;i<rows.length;i+=chunkSize) chunks.push(rows.slice(i,i+chunkSize));

    let totalImported = 0, totalUpdated = 0, totalSkipped = 0, totalInvalid = 0;
    const allDetails: string[] = [];
    const allErrors: string[] = [];

    const matchedSource = sourceList.find(s => s.name.toLowerCase() === defaultSource.toLowerCase());
    const sourceId = matchedSource?.id || null;

    for (let cIdx=0; cIdx<chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      setProgress({ current: Math.min((cIdx+1)*chunkSize, rows.length), total: rows.length });
      try {
        const res = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: chunk,
            globalSource: defaultSource,
            sourceId,
            globalStage: defaultStage,
            globalAssignedTo: defaultOwner || '',
            duplicateAction,
          }),
        });
        const j = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(j?.error || 'Import chunk failed');
        totalImported += Number(j.imported||0);
        totalUpdated += Number(j.updated||0);
        totalSkipped += Number(j.skipped||0);
        totalInvalid += Number(j.invalid||0);
        if (Array.isArray(j.details)) allDetails.push(...j.details);
        if (Array.isArray(j.errors)) allErrors.push(...j.errors);
      } catch (e:any) {
        const msg = e?.message || 'Chunk failed';
        allErrors.push(`Chunk ${cIdx+1}: ${msg}`);
        if (duplicateAction === 'skip') {
          try {
            const fallbackBatch = chunk.filter(r=>{
              const dup = !!r.phone && duplicatePhones.has(r.phone.replace(/\D/g,''));
              return r.phone && r.reasons.length===0 && !dup;
            }).map(r=> ({
              name: r.name || 'Unknown',
              phone: r.phone,
              email: r.email || '',
              location: r.location || '',
              source: defaultSource,
              leadSourceId: sourceId,
              status: defaultStage,
              agent: (()=> {
                if (defaultOwner === '__ROUND_ROBIN__') {
                  const idx = chunk.indexOf(r);
                  const u = ownerList[(cIdx*chunkSize + idx) % (ownerList.length||1)];
                  return u?.name || '';
                }
                return ownerList.find(u=> u.id===defaultOwner)?.name || r.assignedName || '';
              })(),
              budgetMin: r.budgetMin,
              budgetMax: r.budgetMax,
              notes: r.notes || '',
            }));
            if (fallbackBatch.length) {
              const withOwner = fallbackBatch.map(r=> ({...r, assignedTo: defaultOwner==='__ROUND_ROBIN__' ? undefined : (defaultOwner||null) }));
              const imported = await leadsService.bulkInsert(withOwner as any, user?.id||'');
              totalImported += imported.length;
            }
          } catch {}
        }
      }
      await new Promise(r=> setTimeout(r, 150));
    }

    setProgress({ current: rows.length, total: rows.length });
    const summaryData = {
      imported: totalImported,
      updated: totalUpdated,
      skipped: totalSkipped,
      invalid: totalInvalid,
      total: rows.length,
      details: [...allDetails.slice(0,20), ...allErrors.slice(0,10)],
    };
    setSummary(summaryData);
    setImporting(false);
    setStep(4);

    const toastMsg = `Successfully imported ${totalImported} leads${totalUpdated? `, ${totalUpdated} updated`:''}${totalSkipped? `, ${totalSkipped} duplicates skipped`:''}${totalInvalid? `, ${totalInvalid} invalid`:''}.`;
    toast.success(toastMsg, { duration: 5000 });
    onImported();
  };

  if (!open) return null;

  const StepIndicator = () => (
    <div className="flex items-center justify-between px-1 mb-1">
      {STEP_LABELS.map((s, idx)=> (
        <React.Fragment key={s.n}>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${step===s.n ? 'bg-primary text-primary-foreground border-primary shadow-md scale-110' : step > s.n ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-zinc-900 text-muted-foreground border-zinc-200 dark:border-zinc-700'}`}>
              {step > s.n ? <Check size={16} /> : s.n}
            </div>
            <div className="text-center">
              <p className={`text-xs font-bold leading-none ${step===s.n ? 'text-foreground' : 'text-muted-foreground'}`}>{s.title}</p>
              <p className="text-[11px] text-muted-foreground">{s.desc}</p>
            </div>
          </div>
          {idx < STEP_LABELS.length-1 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${step > s.n ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={handleClose} title="Import Leads" subtitle="Upload Excel/CSV → Configure → Map → Import (بركة الليدز مدعومة)" size="xl">
      <div className="p-6 space-y-4">
        <StepIndicator />

        {step===1 && (
          <div className="space-y-4">
            {parsing ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={28} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Reading {fileName||'file'}…</p>
              </div>
            ) : storedFile ? (
              <div className="border border-border rounded-2xl p-5 bg-card flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 flex items-center justify-center"><FileSpreadsheet size={20} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{(storedFile.size/1024).toFixed(1)} KB · {rows.length} rows detected</p>
                </div>
                <button onClick={()=> { setStoredFile(null); setFileName(''); setResult(null); setRows([]); }} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X size={14} /></button>
              </div>
            ) : (
              <div
                onDragOver={e=> { e.preventDefault(); setDragOver(true); }}
                onDragLeave={()=> setDragOver(false)}
                onDrop={onDrop}
                onClick={()=> fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-primary bg-primary/5 scale-[0.99]' : 'border-zinc-200 dark:border-zinc-800 hover:border-primary/40 bg-white dark:bg-zinc-900'}`}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFilePicked} />
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  {dragOver ? <Upload size={26}/> : <FileSpreadsheet size={26}/>}
                </div>
                <p className="text-sm font-bold text-foreground">{dragOver ? 'Drop it here' : 'Drag & drop your sheet, or click to browse'}</p>
                <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls and .csv — Arabic headers supported</p>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
                  {[
                    { icon: <FileText size={14}/>, title:'Step 1', desc:'Upload .xlsx/.csv' },
                    { icon: <Settings2 size={14}/>, title:'Step 2', desc:'Batch Configuration' },
                    { icon: <Eye size={14}/>, title:'Step 3', desc:'Map & Preview 5 rows' },
                  ].map(card=> (
                    <div key={card.title} className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 flex gap-2">
                      <span className="text-primary mt-0.5">{card.icon}</span>
                      <div><p className="text-xs font-bold text-foreground">{card.title}</p><p className="text-[11px] text-muted-foreground">{card.desc}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button disabled={!storedFile || parsing} onClick={()=> setStep(2)} className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-40 hover:bg-primary/90">
                Next — Batch Configuration <ArrowRight size={14}/>
              </button>
            </div>
          </div>
        )}

        {step===2 && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center flex-shrink-0"><FileSpreadsheet size={14}/></div>
              <div>
                <p className="text-sm font-bold text-sky-900 dark:text-sky-200">تم قراءة {rows.length} ليد من الشيت — نافذة إعدادات الشيت</p>
                <p className="text-xs text-sky-700 dark:text-sky-300">Batch Configuration Panel — جميع الإعدادات التالية ستُطبق على كل الليدات في هذه الدفعة.</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>
              <p className="text-xs leading-relaxed">All settings below will be <b>applied to every lead in this batch</b>. Please review carefully before continuing.</p>
            </div>

            {/* Source — Creatable Combobox */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 flex items-center justify-center"><Database size={14}/></div>
                <h3 className="text-sm font-bold text-foreground">Lead Source (مصدر الليد) *</h3>
                <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">Required</span>
                {!isAdmin && <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full text-muted-foreground">Admin/Owner can create</span>}
              </div>
              <div className="relative" data-combobox="source">
                <div className="relative">
                  <input
                    value={sourceOpen ? sourceQuery : (defaultSource || '')}
                    onFocus={()=> { setSourceOpen(true); setSourceQuery(defaultSource || ''); }}
                    onChange={e=> { setSourceQuery(e.target.value); setSourceOpen(true); }}
                    placeholder="Select or search source…"
                    className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 pr-8 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                  />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
                </div>
                {sourceOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    {filteredSources.length === 0 && !showCreateSource ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground text-center">No sources found</div>
                    ) : (
                      <>
                        {filteredSources.map(s=> (
                          <button key={s.id} onClick={()=> { setDefaultSource(s.name); setSourceQuery(''); setSourceOpen(false); }} className={`w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between ${defaultSource===s.name ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold' : 'text-foreground'}`}>
                            <span>{s.name}</span>{defaultSource===s.name && <Check size={14}/>}
                          </button>
                        ))}
                        {showCreateSource && (
                          <button onClick={()=> handleAddSource(sourceQuery)} disabled={addingSource} className="w-full text-left px-3 py-2.5 text-sm bg-lime-50 dark:bg-lime-500/10 hover:bg-lime-100 dark:hover:bg-lime-500/20 text-lime-700 dark:text-lime-300 border-t border-lime-200 dark:border-lime-500/20 flex items-center gap-2 font-semibold disabled:opacity-50">
                            <Plus size={14}/>{addingSource ? 'Creating…' : `+ إضافة مصدر جديد: "${sourceQuery.trim()}"`}
                          </button>
                        )}
                        {!isAdmin && sourceQuery && !isSourceExactMatch && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-zinc-200 dark:border-zinc-700">Only Admin/Owner can create new sources</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {defaultSource && <p className="text-xs text-muted-foreground">Selected: <span className="font-semibold text-foreground">{defaultSource}</span></p>}
            </div>

            {/* Stage — Creatable with color */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center"><FileText size={14}/></div>
                <h3 className="text-sm font-bold text-foreground">Stage / Pipeline (مرحلة الليد) *</h3>
                <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">Default: New Fresh</span>
                {!isAdmin && <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full text-muted-foreground">Admin create only</span>}
              </div>
              <div className="relative" data-combobox="stage">
                <div className="relative">
                  <input
                    value={stageOpen ? stageQuery : (defaultStage || '')}
                    onFocus={()=> { setStageOpen(true); setStageQuery(defaultStage || ''); }}
                    onChange={e=> { setStageQuery(e.target.value); setStageOpen(true); }}
                    placeholder="Select or search stage…"
                    className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 pr-8 text-sm placeholder:text-zinc-400 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none"
                  />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
                </div>
                {stageOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl max-h-72 overflow-y-auto">
                    {filteredStages.map(s=> (
                      <button key={s.id} onClick={()=> { setDefaultStage(s.name); setStageQuery(''); setStageOpen(false); }} className={`w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2 ${defaultStage===s.name ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-300 font-semibold' : 'text-foreground'}`}>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: (s as any).color || '#6b7280' }} />
                        <span>{s.name}</span>{defaultStage===s.name && <Check size={14} className="ml-auto"/>}
                      </button>
                    ))}
                    {isAdmin ? (
                      showCreateStage ? (
                        <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
                          <p className="text-xs font-bold text-foreground">+ إضافة مرحلة جديدة</p>
                          <div className="flex gap-2">
                            <input value={stageQuery} onChange={e=> setStageQuery(e.target.value)} placeholder="Stage name" className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none" />
                            <div className="relative">
                              <input type="color" value={stageColor} onChange={e=> setStageColor(e.target.value)} className="w-10 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1 bg-white dark:bg-zinc-900" title="Stage color" />
                              <Palette size={10} className="absolute -top-1 -right-1 text-zinc-400 pointer-events-none bg-white dark:bg-zinc-900 rounded-full p-0.5" />
                            </div>
                          </div>
                          <button onClick={handleAddStage} disabled={addingStage || stageQuery.trim().length<2} className="w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40">
                            {addingStage ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} {addingStage ? 'Creating…' : `إضافة "${stageQuery.trim()}"`}
                          </button>
                        </div>
                      ) : stageQuery.trim().length>=2 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-zinc-200 dark:border-zinc-700">No matching stage — keep typing to create</div>
                      ) : null
                    ) : (
                      stageQuery && !isStageExactMatch && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-zinc-200 dark:border-zinc-700">Only Admin/Owner can create new stages</div>
                      )
                    )}
                  </div>
                )}
              </div>
              {defaultStage && (
                <p className="text-xs flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: (stageList.find(s=> s.name===defaultStage) as any)?.color || '#22c55e' }} />
                  <span className="text-muted-foreground">Selected:</span> <span className="font-semibold text-foreground">{defaultStage}</span>
                </p>
              )}
            </div>

            {/* Assignment */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 flex items-center justify-center"><Users size={14}/></div>
                <h3 className="text-sm font-bold text-foreground">Assignee (تعيين الليدز) *</h3>
                <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full">Required</span>
              </div>
              <div className="relative">
                <select value={defaultOwner} onChange={e=> setDefaultOwner(e.target.value)} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
                  <option value="">بدون تعيين (Pool / Unassigned)</option>
                  {ownerList.map(u=> <option key={u.id} value={u.id}>{u.name}</option>)}
                  <option value="__ROUND_ROBIN__">🔄 توزيع عادل بالتساوي (Round-Robin)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
              </div>
              {defaultOwner === '__ROUND_ROBIN__' && (
                <p className="text-xs bg-lime-50 dark:bg-lime-500/10 border border-lime-200 dark:border-lime-500/20 text-lime-700 dark:text-lime-300 rounded-xl px-3 py-2">سيتم التوزيع بالتساوي على {ownerList.length} عضو نشط.</p>
              )}
            </div>

            {/* Duplicate handling */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><RefreshCw size={14} className="text-muted-foreground"/> Duplicate Handling</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=> setDuplicateAction('skip')} className={`p-3 rounded-xl border-2 text-left transition-all ${duplicateAction==='skip' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 text-amber-800 dark:text-amber-200' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-muted-foreground'}`}>
                  <p className="text-xs font-bold">Skip Duplicates</p><p className="text-[11px]">تخطي المكرر</p>
                </button>
                <button onClick={()=> setDuplicateAction('update')} className={`p-3 rounded-xl border-2 text-left transition-all ${duplicateAction==='update' ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-400 text-sky-800 dark:text-sky-200' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-muted-foreground'}`}>
                  <p className="text-xs font-bold">Update Existing</p><p className="text-[11px]">تحديث البيانات</p>
                </button>
              </div>
              {duplicateRows.length>0 && <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1"><AlertTriangle size={12}/>{duplicateRows.length} duplicates detected in file + DB.</p>}
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={()=> setStep(1)} className="h-10 px-4 rounded-xl border border-border bg-white dark:bg-zinc-900 text-sm font-semibold flex items-center gap-2"><ArrowLeft size={14}/> Back</button>
              <button disabled={!canProceedFromSettings} onClick={()=> setStep(3)} className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-40">Next — Mapping <ArrowRight size={14}/></button>
            </div>
          </div>
        )}

        {step===3 && result && (
          <div className="space-y-4">
            {unmappedColumns.length>0 && (
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-800 dark:text-sky-200 text-sm flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>
                <div><p className="font-bold">{unmappedColumns.length} column(s) will be skipped — map them to preserve data</p><p className="text-xs opacity-80">{unmappedColumns.join(' • ')}</p></div>
              </div>
            )}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-1">Map columns</h3>
              <p className="text-xs text-muted-foreground mb-3">Auto-detected — adjust for Arabic headers if needed.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {result.headers.map((h,i)=> (
                  <div key={`map-${i}`} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 truncate" title={h}>{h || `Col ${i+1}`}</span>
                    <div className="relative flex-1">
                      <select value={mapping[i]||''} onChange={e=> handleMappingChange(i, e.target.value as ImportField | '')} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2 py-1.5 pr-7 text-xs focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
                        <option value="">— Skip —</option>
                        {IMPORT_FIELDS.map(f=> <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Quick Preview — First 3-5 rows with Source/Stage/Agent</h3>
                <span className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-full">{importableRows.length}/{rows.length} ready</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-border">
                    <tr>{['#','Name','Phone','Email','Budget','Source*','Stage*','Assigned*','Status'].map(h=> <th key={h} className="px-3 py-2 text-left text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0,5).map((r, idx)=> {
                      const dup = !!r.phone && duplicatePhones.has(r.phone.replace(/\D/g,''));
                      return (
                        <tr key={r.rowNumber} className={r.reasons.length ? 'bg-red-50/50 dark:bg-red-500/5' : dup ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''}>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.rowNumber}</td>
                          <td className="px-3 py-2 text-xs font-semibold truncate max-w-[120px]">{r.name || <span className="text-red-500 italic">— missing</span>}</td>
                          <td className="px-3 py-2 text-xs font-mono">{r.phone || <span className="text-red-500">—</span>}</td>
                          <td className="px-3 py-2 text-xs truncate max-w-[120px]">{r.email || '—'}</td>
                          <td className="px-3 py-2 text-xs">{r.budget || '—'}</td>
                          <td className="px-3 py-2 text-xs"><span className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full text-xs">{defaultSource || r.source}</span></td>
                          <td className="px-3 py-2 text-xs"><span className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full text-xs">{defaultStage}</span></td>
                          <td className="px-3 py-2 text-xs truncate max-w-[120px]">{getPreviewAssignee(r, idx)}</td>
                          <td className="px-3 py-2 text-xs">
                            {r.reasons.length ? <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12}/>{r.reasons[0].slice(0,30)}</span> : dup ? <span className="text-amber-600 flex items-center gap-1"><AlertTriangle size={12}/>Duplicate</span> : <span className="text-emerald-600 flex items-center gap-1"><Check size={12}/>Valid</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length>5 && <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">Showing 5 of {rows.length} rows — applies to all {rows.length}.</p>}
              <div className="px-4 py-3 bg-muted/20 border-t border-border flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Valid: {validRows.length}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/> Invalid: {invalidRows.length}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"/> Duplicates: {duplicateRows.length}</span>
                <span className="ml-auto font-bold text-primary">Will import: {importableRows.length}</span>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={()=> setStep(2)} className="h-10 px-4 rounded-xl border border-border bg-white dark:bg-zinc-900 text-sm font-semibold flex items-center gap-2"><ArrowLeft size={14}/> Back</button>
              <button onClick={()=> { setProgress({current:0, total: rows.length}); setStep(4); }} className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-40" disabled={importableRows.length===0}>
                تأكيد الاستيراد وتطبيق البيانات — Import {importableRows.length} <ArrowRight size={14}/>
              </button>
            </div>
          </div>
        )}

        {step===4 && (
          <div className="space-y-4">
            {!summary ? (
              <>
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Loader2 size={18} className={importing ? 'animate-spin' : ''}/></div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{importing ? 'Importing leads…' : 'Ready to import — تأكيد الاستيراد وتطبيق البيانات'}</p>
                      <p className="text-xs text-muted-foreground">{importing && progress ? `Importing ${progress.current} of ${progress.total} leads…` : `${importableRows.length} leads will be imported • Source: ${defaultSource} • Stage: ${defaultStage}`}</p>
                    </div>
                  </div>
                  {importing && progress && (
                    <div className="space-y-2">
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.round((progress.current/progress.total)*100)}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">{Math.round((progress.current/progress.total)*100)}% — {progress.current}/{progress.total}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3"><p className="text-lg font-black text-foreground">{rows.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-3"><p className="text-lg font-black text-emerald-600">{importableRows.length}</p><p className="text-xs text-muted-foreground">Will import</p></div>
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3"><p className="text-lg font-black text-red-600">{invalidRows.length + (duplicateAction==='skip' ? duplicateRows.length : 0)}</p><p className="text-xs text-muted-foreground">Skipped</p></div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <button disabled={importing} onClick={()=> setStep(3)} className="h-10 px-4 rounded-xl border border-border bg-white dark:bg-zinc-900 text-sm font-semibold flex items-center gap-2 disabled:opacity-40"><ArrowLeft size={14}/> Back</button>
                  <button disabled={importing || importableRows.length===0} onClick={doImport} className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-40 min-w-[180px] justify-center">
                    {importing ? <><Loader2 size={16} className="animate-spin"/> Importing…</> : <>تأكيد الاستيراد وتطبيق البيانات</>}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl p-6 text-center border bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={28}/></div>
                  <h3 className="text-base font-bold text-foreground">Import Complete</h3>
                  <p className="text-sm text-muted-foreground mt-1">Successfully imported <b className="text-foreground">{summary.imported}</b> leads{summary.updated? `, ${summary.updated} updated`:''}{summary.skipped? `, ${summary.skipped} duplicates skipped`:''}.</p>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3"><p className="text-lg font-black text-emerald-600">{summary.imported}</p><p className="text-xs text-muted-foreground">Imported</p></div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3"><p className="text-lg font-black text-sky-600">{summary.updated}</p><p className="text-xs text-muted-foreground">Updated</p></div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3"><p className="text-lg font-black text-amber-600">{summary.skipped}</p><p className="text-xs text-muted-foreground">Skipped</p></div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3"><p className="text-lg font-black text-red-600">{summary.invalid}</p><p className="text-xs text-muted-foreground">Invalid</p></div>
                  </div>
                  {summary.details.length>0 && (
                    <div className="mt-4 text-left bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 max-h-32 overflow-y-auto">
                      <p className="text-xs font-bold text-foreground mb-1">Details</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {summary.details.map((d,i)=> <li key={i}>• {d}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={handleClose} className="h-10 px-4 rounded-xl border border-border bg-white dark:bg-zinc-900 text-sm font-semibold">Close</button>
                  <button onClick={()=> { reset(); }} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Import Another File</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {step!==4 && (
        <div className="px-6 pb-6 flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4">
          <span>{loadingMeta ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Loading…</span> : `${rows.length? `${rows.length} rows · ${validRows.length} valid` : 'No rows yet'} · ${duplicateAction==='skip'?'Skip':'Update'} duplicates`}</span>
          <span className="hidden sm:inline">High-contrast • Dark/Light • Creatable for Admin/Owner</span>
        </div>
      )}
    </Modal>
  );
}

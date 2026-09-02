'use client';
import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { leadsService, teamsService, adminSettingsService, projectsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { parseLeadFile, ImportField, ImportParseResult, ParsedRow } from '@/lib/leadsImport';
import { PIPELINE_STAGES, ALL_REAL_STATUSES } from './leadStages';

const IMPORT_FIELDS: { value: ImportField; label: string; required?: boolean }[] = [
  { value: 'phone', label: 'Mobile / Phone', required: true },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'date', label: 'Date' },
  { value: 'source', label: 'Source' },
  { value: 'developer', label: 'Developer' },
  { value: 'project', label: 'Project' },
  { value: 'unit', label: 'Unit' },
  { value: 'interestLevel', label: 'Interest Level' },
  { value: 'assigned', label: 'Assigned To' },
  { value: 'email', label: 'Email' },
  { value: 'location', label: 'Location' },
  { value: 'notes', label: 'Notes' },
];

interface ImportLeadsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportLeadsModal({ open, onClose, onImported }: ImportLeadsModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storedFile, setStoredFile] = useState<File | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<number, ImportField>>({});
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [duplicatePhones, setDuplicatePhones] = useState<Set<string>>(new Set());
  const [defaultOwner, setDefaultOwner] = useState('');
  const [ownerList, setOwnerList] = useState<{ id: string; name: string }[]>([]);
  const [defaultSource, setDefaultSource] = useState('');
  const [sourceList, setSourceList] = useState<{ id: string; name: string }[]>([]);
  const [defaultStage, setDefaultStage] = useState('');
  const [defaultStatus, setDefaultStatus] = useState('');
  const [stageList, setStageList] = useState<{ id: string; name: string }[]>([]);
  const [statusList, setStatusList] = useState<string[]>([]);
  const [defaultProject, setDefaultProject] = useState('');
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [importing, setImporting] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [summary, setSummary] = useState<{
    imported: number;
    skipped: number;
    duplicateCount: number;
    reasons: string[];
  } | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setStoredFile(null);
    setResult(null);
    setMapping({});
    setRows([]);
    setDuplicatePhones(new Set());
    setDefaultOwner('');
    setOwnerList([]);
    setDefaultSource('');
    setSourceList([]);
    setDefaultStage('');
    setDefaultStatus('');
    setStageList([]);
    setStatusList([]);
    setDefaultProject('');
    setProjectList([]);
    setLoadingMeta(false);
    setParsing(false);
    setCheckingDupes(false);
    setImporting(false);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  // Fetch live users + sources + stages + projects on mount — no stale cache, active only
  React.useEffect(() => {
    if (!open) return;
    setLoadingMeta(true);
    Promise.all([
      teamsService.getAssignableUsers().then((d:any)=>(d||[]).map((u:any)=>({id:u.id,name:u.name}))).catch(()=>[]),
      fetch('/api/lead-sources?active=true', { cache: 'no-store' }).then(r=>r.json()).then(j=> (j.sources||[]).map((s:any)=>({id:s.id,name:s.name}))).catch(()=>[]),
      adminSettingsService.getAll().then((g:any)=> (g.pipelineStages||[]).filter((s:any)=>s.active).map((s:any)=>({id:s.id,name:s.name}))).catch(()=> PIPELINE_STAGES.map(s=>({id:s,name:s})) ),
      projectsService.getAll().then((d:any)=>(d||[]).filter((p:any)=>p.status==='Active').map((p:any)=>({id:p.id,name:p.name}))).catch(()=>[]),
    ]).then(([users, sources, stages, projects])=>{
      setOwnerList(users);
      if (users.length && !defaultOwner) setDefaultOwner(users[0].id);
      setSourceList(sources);
      const stagesToUse = stages.length ? stages : PIPELINE_STAGES.map(s=>({id:s,name:s}));
      setStageList(stagesToUse);
      setStatusList(ALL_REAL_STATUSES);
      setProjectList(projects);
    }).finally(()=> setLoadingMeta(false));
  }, [open]);

  const loadOwners = async () => {
    try {
      const data = (await teamsService.getAssignableUsers()) as { id: string; name: string }[];
      const list = (data || []).map((u) => ({ id: u.id, name: u.name }));
      setOwnerList(list);
      if (!defaultOwner && list.length) setDefaultOwner(list[0].id);
    } catch {
      setOwnerList([]);
    }
  };

  const reloadRows = async (parsed: ParsedRow[]) => {
    setCheckingDupes(true);
    try {
      const phones = parsed.map((r) => r.phone || '').filter(Boolean);
      const existing = await leadsService.findDuplicatePhones(phones);
      const inFile = new Map<string, number>();
      phones.forEach((p) => {
        const k = p.replace(/\D/g, '');
        inFile.set(k, (inFile.get(k) || 0) + 1);
      });
      const dupes = new Set<string>();
      existing.forEach((p) => dupes.add(p));
      phones.forEach((p) => {
        const k = p.replace(/\D/g, '');
        if ((inFile.get(k) || 0) > 1) dupes.add(k);
      });
      setDuplicatePhones(dupes);
      setRows(parsed);
    } catch {
      setRows(parsed);
      setDuplicatePhones(new Set());
      toast.error('Could not check for duplicates');
    } finally {
      setCheckingDupes(false);
    }
  };

  const processFile = async (file: File) => {
    setParsing(true);
    try {
      if (ownerList.length === 0) await loadOwners();
      const res = await parseLeadFile(file, undefined, ownerList);
      setStoredFile(file);
      setFileName(file.name);
      setResult(res);
      setMapping(res.mapping);
      setStep('preview');
      await reloadRows(res.rows);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to read the file');
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleMappingChange = async (headerIdx: number, field: ImportField | '') => {
    if (!result) return;
    const next: Record<number, ImportField> = { ...mapping };
    if (!field) delete next[headerIdx];
    else {
      Object.keys(next).forEach((k) => {
        if (Number(k) !== headerIdx && next[Number(k)] === field) delete next[Number(k)];
      });
      next[headerIdx] = field;
    }
    setMapping(next);
    setParsing(true);
    try {
      if (!storedFile) throw new Error('File not found');
      const res = await parseLeadFile(storedFile, next, ownerList);
      setRows(res.rows);
      setResult(res);
      const phones = res.rows.map((r) => r.phone || '').filter(Boolean);
      const existing = await leadsService.findDuplicatePhones(phones);
      setDuplicatePhones(existing);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to re-map columns');
    } finally {
      setParsing(false);
    }
  };

  const checkDuplicates = async () => {
    if (!result) return;
    setCheckingDupes(true);
    try {
      const phones = result.rows.map((r) => r.phone || '').filter(Boolean);
      const existing = await leadsService.findDuplicatePhones(phones);
      const inFile = new Map<string, number>();
      phones.forEach((p) => {
        const k = p.replace(/\D/g, '');
        inFile.set(k, (inFile.get(k) || 0) + 1);
      });
      const dupes = new Set<string>();
      existing.forEach((p) => dupes.add(p));
      phones.forEach((p) => {
        const k = p.replace(/\D/g, '');
        if ((inFile.get(k) || 0) > 1) dupes.add(k);
      });
      setDuplicatePhones(dupes);
      toast.success('Duplicate check complete');
    } catch {
      toast.error('Could not check for duplicates');
    } finally {
      setCheckingDupes(false);
    }
  };

  const importableCount = rows.filter((r) => {
    const dup = !!r.phone && duplicatePhones.has(r.phone.replace(/\D/g, ''));
    return r.phone && r.reasons.length === 0 && (skipDuplicates ? !dup : true);
  }).length;

  const unmappedColumns = result
    ? result.headers.filter((h, i) => !mapping[i]).filter(Boolean)
    : [];

  const doImport = async () => {
    setImporting(true);
    try {
      const batch: any[] = [];
      const skippedReasons: string[] = [];
      const mergedImported: string[] = [];
      let duplicateCount = 0;
      rows.forEach((row) => {
        const dup = !!row.phone && duplicatePhones.has(row.phone.replace(/\D/g, ''));
        if (!row.phone) {
          skippedReasons.push(`Row ${row.rowNumber}: missing phone number`);
          return;
        }
        if (row.reasons.length > 0) {
          skippedReasons.push(`Row ${row.rowNumber}: ${row.reasons.join(', ')}`);
          return;
        }
        if (skipDuplicates && dup) {
          duplicateCount += 1;
          skippedReasons.push(`Row ${row.rowNumber}: duplicate phone ${row.phone}`);
          return;
        }
        if (dup) {
          // "Skip duplicates" is OFF: import it anyway, but flag it for the
          // user in the summary so the duplicate is intentional.
          mergedImported.push(
            `Row ${row.rowNumber}: phone ${row.phone} already existed — imported as a new lead`
          );
        }
        // Default dropdowns override file values per spec — Stage/Status/Project/Source
        const finalSource = (defaultSource || row.source || 'Other').trim();
        const matchedSource = sourceList.find(s => s.name.toLowerCase() === finalSource.toLowerCase());
        const resolvedSource = matchedSource ? matchedSource.name : finalSource;
        const resolvedSourceId = matchedSource ? matchedSource.id : (sourceList.find(s=>s.name==='Other')?.id || null);
        // Stage/Status precedence: Default Status > Default Stage > file status > system default
        const rawStageStatus = (defaultStatus || defaultStage || row.status || 'Fresh Leads').trim();
        const finalStatus = rawStageStatus || 'Fresh Leads';
        const finalProject = (defaultProject || row.project || '').trim();
        batch.push({
          name: row.name || 'Unknown',
          phone: row.phone,
          email: row.email || '',
          location: row.location || '',
          propertyType: undefined,
          budgetMin: undefined,
          budgetMax: undefined,
          source: resolvedSource,
          leadSourceId: resolvedSourceId,
          status: finalStatus,
          project: finalProject,
          agent: row.assignedName || '',
          agentInitials: row.assignedName
            ? row.assignedName
                .split(' ')
                .map((p) => p[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)
            : '',
          lastContact: row.date || new Date().toISOString().split('T')[0],
          followUpDue: row.date || new Date().toISOString().split('T')[0],
          createdAt: row.date || undefined,
          developer: row.developer || '',
          unit: row.unit || '',
          interestLevel: row.interestLevel || '',
          notes: row.notes || '',
        });
      });

      if (batch.length > 0) {
        const ownerId = defaultOwner || user?.id || null;
        const withOwner = batch.map((r) => ({
          ...r,
          assignedTo: r.assignedTo || ownerId,
        }));
        const imported = await leadsService.bulkInsert(withOwner, user?.id || '');
        if (!imported.length) throw new Error('No leads were inserted');
      }

      setSummary({
        imported: batch.length,
        skipped: skippedReasons.length,
        duplicateCount,
        reasons: [...skippedReasons.slice(0, 20), ...mergedImported.slice(0, 10)],
      });
      setStep('done');
      onImported();
      toast.success(`Imported ${batch.length} lead${batch.length !== 1 ? 's' : ''}`);
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Leads"
      subtitle="Upload an Excel (.xlsx / .xls) or CSV file to bulk-add leads"
      size="xl"
    >
      {step === 'upload' && (
        <div className="p-6 space-y-4">
          {/* Global defaults toolbar — 3 selectors side-by-side next to file upload per spec */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Lead Source</label>
              <div className="relative">
                <select value={defaultSource} onChange={e=>setDefaultSource(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700/80 text-zinc-100 rounded-xl px-3 py-2 pr-8 text-xs focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
                  <option value="">Use file value</option>
                  {sourceList.map(s=> <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Assign To</label>
              <div className="relative">
                <select value={defaultOwner} onChange={e=>setDefaultOwner(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700/80 text-zinc-100 rounded-xl px-3 py-2 pr-8 text-xs focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
                  <option value="">— Unassigned —</option>
                  {ownerList.map(u=> <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Stage</label>
              <div className="relative">
                <select value={defaultStage} onChange={e=>{ setDefaultStage(e.target.value); setDefaultStatus(''); }} className="w-full bg-zinc-900 border border-zinc-700/80 text-zinc-100 rounded-xl px-3 py-2 pr-8 text-xs focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none appearance-none">
                  <option value="">Use file value</option>
                  {stageList.map(s=> <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              </div>
            </div>
          </div>
          {parsing ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm">Reading {fileName || 'file'}…</p>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
              role="button"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={onFilePicked}
              />
              <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                {dragOver ? <Upload size={26} /> : <FileSpreadsheet size={26} />}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {dragOver ? 'Drop it here' : 'Drag & drop your file, or click to browse'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls and .csv</p>
              <div className="mt-5 px-4 py-3 bg-muted/40 rounded-xl text-left">
                <p className="text-xs font-medium text-foreground mb-1">Expected columns</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  <li>
                    <strong>Mobile / Phone</strong> (required)
                  </li>
                  <li>Name, Status, Date (optional)</li>
                  <li>Developer / Project (optional)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'preview' && result && (
        <div className="p-6 space-y-5">
          {/* Unmapped / skipped columns (data preservation) */}
          {unmappedColumns.length > 0 && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-800 text-sm flex items-start gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">
                  {unmappedColumns.length} column{unmappedColumns.length !== 1 ? 's' : ''} will be
                  skipped — map them below to preserve their data
                </p>
                <p className="text-xs mt-0.5 text-sky-700/80">
                  {unmappedColumns.join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Column mapping */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Map columns</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Auto-detected automatically. Adjust if your headers use different names (e.g. Arabic).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.headers.map((h, i) => (
                <div key={`map-${i}`} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-32 truncate" title={h}>
                    {h || `Column ${i + 1}`}
                  </span>
                  <div className="relative flex-1">
                    <select
                      value={mapping[i] || ''}
                      onChange={(e) => handleMappingChange(i, e.target.value as ImportField | '')}
                      className="input-base h-8 text-xs appearance-none pr-8 w-full"
                    >
                      <option value="">— Skip column —</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                          {f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto card-base !p-0">
            <table className="w-full text-sm table-mobile">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Developer</th>
                  <th className="table-th">Unit</th>
                  <th className="table-th">Interest</th>
                  <th className="table-th">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 8).map((data) => {
                  const dup = !!data.phone && duplicatePhones.has(data.phone.replace(/\D/g, ''));
                  return (
                    <tr key={data.rowNumber} className={dup ? 'bg-yellow-50/40' : ''}>
                      <td className="table-td">
                        {data.name || <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="table-td font-mono-data">{data.phone || '—'}</td>
                      <td className="table-td">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-lg font-medium ${data.status ? 'bg-secondary text-foreground' : 'text-red-500'}`}
                        >
                          {data.status || '?'}
                        </span>
                      </td>
                      <td className="table-td text-muted-foreground">{data.date || '—'}</td>
                      <td className="table-td text-muted-foreground">{data.developer || '—'}</td>
                      <td className="table-td text-muted-foreground">{data.unit || '—'}</td>
                      <td className="table-td text-muted-foreground">{data.interestLevel || '—'}</td>
                      <td className="table-td">
                        {data.reasons.length > 0 ? (
                          <span className="text-xs text-red-500 flex items-center gap-1">
                            <AlertTriangle size={12} /> {data.reasons[0]}
                          </span>
                        ) : dup ? (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={12} /> Duplicate
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 8 && (
              <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                Showing first 8 of {rows.length} rows
              </p>
            )}
          </div>

          {duplicatePhones.size > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-sm flex items-center gap-2 flex-wrap">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>
                {duplicatePhones.size} phone number{duplicatePhones.size !== 1 ? 's' : ''} already
                appear in your leads.
              </span>
              <label className="ml-auto flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="accent-amber-600"
                />
                Skip duplicates
              </label>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{importableCount}</span> of{' '}
              {rows.length} rows ready to import
            </p>
            <button
              onClick={checkDuplicates}
              disabled={checkingDupes || parsing}
              className="btn-secondary text-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {checkingDupes ? <Loader2 size={14} className="animate-spin" /> : null}
              Check duplicates
            </button>
          </div>
        </div>
      )}

      {step === 'done' && summary && (
        <div className="p-6">
          <div className="rounded-2xl p-6 text-center border border-border">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={26} />
            </div>
            <h3 className="text-base font-semibold text-foreground">Import complete</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {summary.imported} lead{summary.imported !== 1 ? 's' : ''} imported successfully.
            </p>
            {summary.skipped > 0 && (
              <div className="mt-4 text-left">
                <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <XCircle size={14} className="text-red-500" />
                  {summary.skipped} row{summary.skipped !== 1 ? 's' : ''} skipped
                  {summary.duplicateCount > 0 && (
                    <span className="text-amber-600 font-semibold">
                      · {summary.duplicateCount} duplicate{summary.duplicateCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                  {summary.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={handleClose} className="btn-secondary">
              Close
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setSummary(null);
              }}
              className="btn-primary"
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* Footer — actions only; defaults are in header toolbar and persist */}
      {step !== 'done' && (
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {loadingMeta ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Loading…</span> : <span>{defaultSource || defaultOwner || defaultStage ? `Defaults: ${[defaultSource && `Source=${defaultSource}`, defaultOwner && `Assign=${ownerList.find(u=>u.id===defaultOwner)?.name || defaultOwner}`, defaultStage && `Stage=${defaultStage}`].filter(Boolean).join(' · ') || 'Using file values'}` : 'Using file values'}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleClose} className="btn-secondary">
              Cancel
            </button>
            {step === 'preview' && (
              <button
                onClick={doImport}
                disabled={importing || importableCount === 0}
                className="btn-primary flex items-center gap-1.5 min-w-[140px] justify-center disabled:opacity-50"
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {importing ? 'Importing…' : `Import ${importableCount} lead${importableCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

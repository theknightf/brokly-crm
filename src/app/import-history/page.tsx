'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Download,
  Eye,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Upload,
  Filter,
  Calendar,
  User,
  FileWarning,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CopyCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const ImportLeadsModal = dynamic(
  () => import('@/app/leads-management/components/ImportLeadsModal'),
  { ssr: false }
);

interface ErrorDetailItem {
  rowNumber: number;
  name?: string;
  phone?: string;
  type: 'invalid' | 'skipped' | 'duplicate_routed' | 'error';
  reason: string;
}

interface ImportLogRecord {
  id: string;
  originalFileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedBy: string | null;
  uploadedByName: string;
  uploadedByRole: string;
  status: 'Processing' | 'Completed' | 'Partially Imported' | 'Failed';
  sourceName: string;
  targetStage: string;
  assignmentMode: string;
  totalRows: number;
  importedCount: number;
  routedDuplicatesCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  summary: string;
  errorDetails: ErrorDetailItem[];
  createdAt: string;
  completedAt: string | null;
  downloadUrl: string;
}

interface UploaderOption {
  id: string;
  name: string;
  role: string;
}

interface SummaryStats {
  totalImports: number;
  totalRows: number;
  totalImported: number;
  totalDuplicatesRouted: number;
  totalErrors: number;
}

function formatBytes(bytes: number): string {
  const b = Number(bytes || 0);
  if (b <= 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function roleBadgeLabel(role?: string): string {
  const r = String(role || 'admin').toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    owner: 'Owner',
    owner_admin: 'Owner',
    admin: 'Admin',
    branch_manager: 'Branch Manager',
    team_leader: 'Team Leader',
    senior_agent: 'Senior Agent',
    agent: 'Sales Agent',
  };
  return map[r] || role || 'User';
}

export default function ImportHistoryPage() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<ImportLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SummaryStats>({
    totalImports: 0,
    totalRows: 0,
    totalImported: 0,
    totalDuplicatesRouted: 0,
    totalErrors: 0,
  });
  const [uploaders, setUploaders] = useState<UploaderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [uploaderFilter, setUploaderFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals & Action states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<ImportLogRecord | null>(null);
  const [detailFilterType, setDetailFilterType] = useState<string>('all');
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Debounce text search (150ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 150);
    return () => clearTimeout(t);
  }, [search]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
      if (uploaderFilter) params.set('uploadedBy', uploaderFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch(`/api/leads/import-history?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load import history');
      }
      setLogs(data.logs || []);
      setTotal(Number(data.total || 0));
      if (data.stats) setStats(data.stats);
      if (data.uploaders) setUploaders(data.uploaders);
    } catch (e: any) {
      setError(e?.message || 'Failed to load import history');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, uploaderFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDownloadOriginal = async (log: ImportLogRecord) => {
    if (downloadingId === log.id) return;
    setDownloadingId(log.id);
    try {
      const res = await fetch(`/api/leads/import-history/${log.id}/download`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Failed to download file');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = log.originalFileName || `leads_import_${log.id.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded "${log.originalFileName}"`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to download original file');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadErrorReport = (log: ImportLogRecord) => {
    const details = log.errorDetails || [];
    if (!details.length) {
      toast.info('No error or duplicate row details to export for this import.');
      return;
    }
    const headers = ['Row Number', 'Lead Name', 'Phone Number', 'Category', 'Details / Reason'];
    const csvRows = [
      headers.join(','),
      ...details.map((d) =>
        [
          d.rowNumber,
          `"${String(d.name || '').replace(/"/g, '""')}"`,
          `"${String(d.phone || '').replace(/"/g, '""')}"`,
          `"${String(d.type || '').replace(/"/g, '""')}"`,
          `"${String(d.reason || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = log.originalFileName.replace(/\.(xlsx|xls|csv)$/i, '');
    a.download = `${baseName}_report.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('All');
    setUploaderFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    statusFilter !== 'All' ||
    Boolean(uploaderFilter) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const renderStatusBadge = (status: ImportLogRecord['status']) => {
    switch (status) {
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={13} />
            Completed
          </span>
        );
      case 'Partially Imported':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle size={13} />
            Partially Imported
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <XCircle size={13} />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <Clock size={13} className="animate-spin" />
            Processing
          </span>
        );
    }
  };

  const filteredDetails = (selectedLog?.errorDetails || []).filter((item) => {
    if (detailFilterType === 'all') return true;
    return item.type === detailFilterType;
  });

  return (
    <AppLayout>
      <div className="page-aurora min-h-[calc(100dvh-8rem)] space-y-5 rounded-[2rem] p-3 sm:p-5 flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-[1.75rem] border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link
                href="/leads-management"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ArrowLeft size={13} />
                Back to Leads Management
              </Link>
              <span>·</span>
              <span>Excel / CSV Archive</span>
            </div>
            <h1 className="page-title flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <FileSpreadsheet size={20} />
              </span>
              Import History & File Archive
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Audit every Excel / CSV lead import, inspect row-level reports, and re-download the exact uploaded sheet at any time.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link
              href="/duplicate-leads"
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <CopyCheck size={15} />
              Duplicate Center
            </Link>
            <button
              onClick={() => setImportModalOpen(true)}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl font-semibold shadow-sm"
            >
              <Upload size={15} />
              Upload / Import Sheet
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="card-base !p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Uploaded Sheets</span>
            <span className="text-2xl font-bold text-foreground mt-1">
              {stats.totalImports.toLocaleString()}
            </span>
          </div>
          <div className="card-base !p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Rows Processed</span>
            <span className="text-2xl font-bold text-foreground mt-1">
              {stats.totalRows.toLocaleString()}
            </span>
          </div>
          <div className="card-base !p-4 flex flex-col justify-between border-emerald-500/20">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Successfully Imported
            </span>
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.totalImported.toLocaleString()}
            </span>
          </div>
          <div className="card-base !p-4 flex flex-col justify-between border-amber-500/20">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Routed to Duplicate Center
            </span>
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.totalDuplicatesRouted.toLocaleString()}
            </span>
          </div>
          <div className="card-base !p-4 flex flex-col justify-between border-red-500/20 col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              Skipped / Invalid Rows
            </span>
            <span className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
              {stats.totalErrors.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="card-base !p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name, uploader, source, or stage…"
                className="input-base pl-9 pr-3 h-10 w-full text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="input-base h-10 w-full text-sm"
              >
                <option value="All">All Statuses</option>
                <option value="Completed">Completed</option>
                <option value="Partially Imported">Partially Imported</option>
                <option value="Failed">Failed</option>
                <option value="Processing">Processing</option>
              </select>
            </div>

            {/* Uploader Filter */}
            <div>
              <select
                value={uploaderFilter}
                onChange={(e) => {
                  setUploaderFilter(e.target.value);
                  setPage(1);
                }}
                className="input-base h-10 w-full text-sm"
              >
                <option value="">All Uploaders</option>
                {uploaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({roleBadgeLabel(u.role)})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                title="From date"
                className="input-base h-10 w-full text-xs px-2.5"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                title="To date"
                className="input-base h-10 w-full text-xs px-2.5"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-1 border-t border-border/60 text-xs">
              <span className="text-muted-foreground">
                Showing {logs.length} of {total} matching import records
              </span>
              <button
                onClick={clearFilters}
                className="font-semibold text-primary hover:underline"
              >
                Reset all filters
              </button>
            </div>
          )}
        </div>

        {/* History Table */}
        <div className="card-base !p-0 overflow-hidden flex-1 flex flex-col">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm">Loading import history…</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center space-y-3">
              <AlertTriangle size={28} className="text-destructive mx-auto" />
              <p className="text-sm font-semibold text-destructive">{error}</p>
              <button onClick={fetchHistory} className="btn-secondary text-xs mx-auto">
                Retry
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-14 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <FileSpreadsheet size={24} />
              </div>
              <p className="text-base font-semibold text-foreground">No import history found</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {hasActiveFilters
                  ? 'No uploaded Excel/CSV files match your current filter criteria.'
                  : 'Whenever you or your team upload an Excel (.xlsx / .xls) or CSV sheet, the original file and import report will appear here automatically.'}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setImportModalOpen(true)}
                  className="btn-primary text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5"
                >
                  <Upload size={14} />
                  Upload First Sheet
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3.5 px-4">File Name</th>
                    <th className="py-3.5 px-4">Uploaded By</th>
                    <th className="py-3.5 px-4">Date & Time</th>
                    <th className="py-3.5 px-4">Total Records / Processed</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {logs.map((log) => {
                    const dt = formatDateTime(log.createdAt);
                    const isCsv = log.originalFileName.toLowerCase().endsWith('.csv');
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        {/* 1. File Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                              <FileSpreadsheet size={18} />
                            </div>
                            <div className="min-w-0">
                              <p
                                className="font-semibold text-foreground truncate max-w-[260px]"
                                title={log.originalFileName}
                              >
                                {log.originalFileName}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                  {isCsv ? 'CSV' : 'EXCEL'} · {formatBytes(log.fileSizeBytes)}
                                </span>
                                {log.sourceName && log.sourceName !== '—' && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                    Source: {log.sourceName}
                                  </span>
                                )}
                                {log.targetStage && log.targetStage !== '—' && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">
                                    Stage: {log.targetStage}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Uploaded By */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                              {String(log.uploadedByName || 'U')
                                .trim()
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-foreground text-sm">
                                {log.uploadedByName}
                              </p>
                              <span className="text-[11px] text-muted-foreground">
                                {roleBadgeLabel(log.uploadedByRole)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 3. Date & Time */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <p className="font-medium text-foreground">{dt.date}</p>
                          <p className="text-xs text-muted-foreground">{dt.time}</p>
                        </td>

                        {/* 4. Total Records / Processed */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1.5 min-w-[200px]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">
                                {log.totalRows.toLocaleString()} Total Rows
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {log.importedCount.toLocaleString()} Imported
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                              {log.routedDuplicatesCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                  {log.routedDuplicatesCount} Duplicates Routed
                                </span>
                              )}
                              {log.updatedCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium">
                                  {log.updatedCount} Updated
                                </span>
                              )}
                              {log.skippedCount + log.errorCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                                  {log.skippedCount + log.errorCount} Skipped / Invalid
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 5. Status Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {renderStatusBadge(log.status)}
                        </td>

                        {/* 6. Action Buttons */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadOriginal(log)}
                              disabled={downloadingId === log.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:brightness-105 active:scale-95 transition-all disabled:opacity-60 shadow-sm"
                              title="Download the exact uploaded Excel/CSV file"
                            >
                              {downloadingId === log.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Download size={13} />
                              )}
                              Download Original File
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDetailFilterType('all');
                                setSelectedLog(log);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                              title="View import statistics and row-level error/duplicate report"
                            >
                              <Eye size={13} />
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {!loading && total > 0 && (
            <div className="border-t border-border px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 text-xs">
              <div className="text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{(page - 1) * pageSize + 1}</span>–
                <span className="font-semibold text-foreground">
                  {Math.min(page * pageSize, total)}
                </span>{' '}
                of <span className="font-semibold text-foreground">{total}</span> import jobs
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="input-base h-8 text-xs px-2 py-1"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-secondary h-8 px-2.5 flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <span className="px-2 font-semibold text-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="btn-secondary h-8 px-2.5 flex items-center gap-1 disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Details / Error Report Modal */}
      {selectedLog && (
        <Modal
          open={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title="Import Job Details & Report"
          subtitle={`${selectedLog.originalFileName} · Uploaded by ${selectedLog.uploadedByName}`}
          size="xl"
        >
          <div className="p-5 sm:p-6 space-y-5">
            {/* Metadata & Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <span className="text-[11px] text-muted-foreground block">Total Rows</span>
                <span className="text-lg font-bold text-foreground">
                  {selectedLog.totalRows.toLocaleString()}
                </span>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block">
                  Imported Leads
                </span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedLog.importedCount.toLocaleString()}
                </span>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <span className="text-[11px] text-amber-600 dark:text-amber-400 block">
                  Duplicates Routed
                </span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {selectedLog.routedDuplicatesCount.toLocaleString()}
                </span>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <span className="text-[11px] text-red-600 dark:text-red-400 block">
                  Invalid / Errors
                </span>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {(selectedLog.errorCount + selectedLog.skippedCount).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Batch Settings */}
            <div className="rounded-xl border border-border bg-card p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-muted-foreground">Source: </span>
                  <span className="font-semibold text-foreground">{selectedLog.sourceName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Target Stage: </span>
                  <span className="font-semibold text-foreground">{selectedLog.targetStage}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Assignment: </span>
                  <span className="font-semibold text-foreground">{selectedLog.assignmentMode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">File Size: </span>
                  <span className="font-semibold text-foreground">
                    {formatBytes(selectedLog.fileSizeBytes)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadOriginal(selectedLog)}
                  disabled={downloadingId === selectedLog.id}
                  className="btn-primary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Download size={13} />
                  Download Original Sheet
                </button>
                {selectedLog.errorDetails?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadErrorReport(selectedLog)}
                    className="btn-secondary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <FileWarning size={13} />
                    Export Report (.csv)
                  </button>
                )}
              </div>
            </div>

            {/* Row-Level Log Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">
                  Row-Level Event & Error Log ({filteredDetails.length})
                </h3>
                <div className="flex items-center gap-1.5 text-xs">
                  {(['all', 'duplicate_routed', 'invalid', 'error', 'skipped'] as const).map(
                    (tKey) => (
                      <button
                        key={tKey}
                        type="button"
                        onClick={() => setDetailFilterType(tKey)}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          detailFilterType === tKey
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tKey === 'all'
                          ? 'All'
                          : tKey === 'duplicate_routed'
                            ? 'Duplicates'
                            : tKey.charAt(0).toUpperCase() + tKey.slice(1)}
                      </button>
                    )
                  )}
                </div>
              </div>

              {filteredDetails.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
                  No row issues or flagged events recorded for this filter. All rows were imported cleanly!
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0 border-b border-border text-left text-muted-foreground">
                      <tr>
                        <th className="py-2.5 px-3">Row #</th>
                        <th className="py-2.5 px-3">Lead Name</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Details / Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredDetails.map((d, idx) => (
                        <tr key={`${d.rowNumber}-${idx}`} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-mono font-semibold">#{d.rowNumber}</td>
                          <td className="py-2 px-3 font-medium text-foreground">{d.name || '—'}</td>
                          <td className="py-2 px-3 font-mono">{d.phone || '—'}</td>
                          <td className="py-2 px-3">
                            {d.type === 'duplicate_routed' ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                                Duplicate Routed
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-semibold capitalize">
                                {d.type}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{d.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Upload / Import Modal */}
      <ImportLeadsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          setImportModalOpen(false);
          fetchHistory();
        }}
      />
    </AppLayout>
  );
}

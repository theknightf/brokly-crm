'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Building2,
  Search,
  Image as ImageIcon,
  LayoutGrid,
  Table2,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Check,
  Filter,
  Eye,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import UnitCard from '@/components/ui/UnitCard';
import { unitsService, projectsService, UnitFile } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import QuickAddUnitDrawer from './QuickAddUnitDrawer';

const fmt = (n: number) => (n ? n.toLocaleString('en-US') : '0');

export default function UnitsScreen() {
  const { user } = useAuth();
  const [units, setUnits] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});

  // Quick-Add Drawer
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Modals
  const [preview, setPreview] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  // Inline Price Editing State
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [inlinePriceValue, setInlinePriceValue] = useState<string>('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

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

  // Load cover image URLs
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

  // Quick stats calculations
  const stats = useMemo(() => {
    const total = units.length;
    const available = units.filter((u) => u.status === 'Available' || u.status === 'متاح').length;
    const reserved = units.filter((u) => u.status === 'Reserved' || u.status === 'محجوز').length;
    const sold = units.filter((u) => u.status === 'Sold' || u.status === 'مباع').length;
    return { total, available, reserved, sold };
  }, [units]);

  // Filtered list
  const filtered = units.filter((u) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = [u.name, u.unitType, u.projectName, u.paymentPlan, u.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter) {
      if (statusFilter === 'Available' && u.status !== 'Available' && u.status !== 'متاح') return false;
      if (statusFilter === 'Reserved' && u.status !== 'Reserved' && u.status !== 'محجوز') return false;
      if (statusFilter === 'Sold' && u.status !== 'Sold' && u.status !== 'مباع') return false;
    }
    if (projectFilter && u.projectId !== projectFilter) return false;
    return true;
  });

  // Change Unit Status directly with optimistic UI
  const changeStatus = async (unit: any, newStatus: string) => {
    const oldStatus = unit.status;
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: newStatus } : u)));
    try {
      await unitsService.update(unit.id, { ...unit, status: newStatus });
      const statusLabel =
        newStatus === 'Available' ? 'متاح' : newStatus === 'Reserved' ? 'محجوز' : 'مباع';
      toast.success(`تم تحديث حالة "${unit.name}" إلى ${statusLabel}`);
    } catch (err: any) {
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: oldStatus } : u)));
      toast.error(err?.message || 'تعذر تحديث الحالة');
    }
  };

  // Inline Price Editing
  const startEditingPrice = (unit: any) => {
    setEditingPriceId(unit.id);
    setInlinePriceValue(unit.price ? String(unit.price) : '');
  };

  const handleSaveInlinePrice = async (unit: any) => {
    const cleanNum = parseFloat(inlinePriceValue.replace(/,/g, ''));
    if (isNaN(cleanNum) || cleanNum < 0) {
      setEditingPriceId(null);
      return;
    }

    if (cleanNum === unit.price) {
      setEditingPriceId(null);
      return;
    }

    setSavingPriceId(unit.id);
    const oldPrice = unit.price;
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, price: cleanNum } : u)));

    try {
      await unitsService.update(unit.id, { ...unit, price: cleanNum });
      toast.success(`تم تحديث سعر "${unit.name}" بنجاح`);
    } catch (err: any) {
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, price: oldPrice } : u)));
      toast.error('تعذر حفظ السعر');
    } finally {
      setSavingPriceId(null);
      setEditingPriceId(null);
    }
  };

  // Delete Unit
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await unitsService.delete(deleting.id);
      toast.success('تم حذف الوحدة بنجاح');
      setDeleting(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حذف الوحدة');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* 1. Header & Primary Sticky Quick-Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            إدارة الوحدات والعقارات
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {units.length} وحدة
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            إدارة فورية سريعة لوحدات السوق العقاري مع تعديل مباشر للأسعار والحالات
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="inline-flex p-1 rounded-xl bg-muted border border-border/60">
            <button
              type="button"
              onClick={() => setView('table')}
              className={`flex items-center justify-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-all ${
                view === 'table' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Table2 size={14} />
              جدول
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`flex items-center justify-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-all ${
                view === 'grid' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid size={14} />
              كروت
            </button>
          </div>

          {/* Prominent Quick-Add Unit Button */}
          <button
            onClick={() => setQuickAddOpen(true)}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:bg-primary/95 active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Plus size={17} className="stroke-[2.5]" />
            + إضافة وحدة سريعة
          </button>
        </div>
      </div>

      {/* 2. Quick-Stats Bar with 1-Click Filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Units */}
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`p-4 rounded-2xl border text-right transition-all flex items-center justify-between ${
            statusFilter === ''
              ? 'bg-card border-primary ring-2 ring-primary/20 shadow-sm'
              : 'bg-card/70 border-border hover:bg-muted/40'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground">إجمالي الوحدات</p>
            <p className="text-2xl font-black text-foreground mt-0.5">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
            <Building2 size={20} />
          </div>
        </button>

        {/* Available Units */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Available' ? '' : 'Available')}
          className={`p-4 rounded-2xl border text-right transition-all flex items-center justify-between ${
            statusFilter === 'Available'
              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-card/70 border-border hover:bg-emerald-50/20'
          }`}
        >
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              الوحدات المتاحة
            </p>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
              {stats.available}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </button>

        {/* Reserved Units */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Reserved' ? '' : 'Reserved')}
          className={`p-4 rounded-2xl border text-right transition-all flex items-center justify-between ${
            statusFilter === 'Reserved'
              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-card/70 border-border hover:bg-amber-50/20'
          }`}
        >
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              الوحدات المحجوزة
            </p>
            <p className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-0.5">
              {stats.reserved}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center">
            <Clock size={20} />
          </div>
        </button>

        {/* Sold Units */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Sold' ? '' : 'Sold')}
          className={`p-4 rounded-2xl border text-right transition-all flex items-center justify-between ${
            statusFilter === 'Sold'
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-500 ring-2 ring-slate-500/20 shadow-sm'
              : 'bg-card/70 border-border hover:bg-slate-100/50'
          }`}
        >
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              الوحدات المباعة
            </p>
            <p className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-0.5">
              {stats.sold}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <BadgeCheck size={20} />
          </div>
        </button>
      </div>

      {/* 3. Search & Filters Bar */}
      <div className="card-base !p-3.5 bg-card/60 backdrop-blur-sm border border-border/80">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search
              size={15}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم، المشروع، نوع العقار أو التفاصيل..."
              className="input-base !pr-10 text-xs sm:text-sm h-10 w-full"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-base text-xs sm:text-sm h-10 appearance-none bg-card"
          >
            <option value="">جميع الحالات</option>
            <option value="Available">متاح (Available)</option>
            <option value="Reserved">محجوز (Reserved)</option>
            <option value="Sold">مباع (Sold)</option>
          </select>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="input-base text-xs sm:text-sm h-10 appearance-none bg-card"
          >
            <option value="">جميع المشاريع / الكمبوندات</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Desktop Inline-Editable Table View */}
      {view === 'table' && (
        <div className="card-base !p-0 overflow-hidden border border-border shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground text-xs font-bold uppercase">
                <tr>
                  <th className="py-3.5 px-4">الوحدة</th>
                  <th className="py-3.5 px-4">المشروع / المنطقة</th>
                  <th className="py-3.5 px-4">النوع</th>
                  <th className="py-3.5 px-4 text-left">المساحة</th>
                  <th className="py-3.5 px-4 text-left">
                    <span className="flex items-center gap-1">السعر (تعديل مباشر) ⚡</span>
                  </th>
                  <th className="py-3.5 px-4">نظام الدفع</th>
                  <th className="py-3.5 px-4">الحالة (تغيير فوري)</th>
                  <th className="py-3.5 px-4 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 size={24} className="animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">جاري تحميل الوحدات...</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12">
                      <EmptyState
                        icon={<Building2 size={28} className="text-muted-foreground" />}
                        title="لا توجد وحدات مطابقة"
                        description="جرّب تغيير معايير البحث أو أضف وحدة جديدة الآن بنقرة واحدة."
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const isEditingPrice = editingPriceId === u.id;
                    const isSavingPrice = savingPriceId === u.id;
                    const isAvailable = u.status === 'Available' || u.status === 'متاح';
                    const isReserved = u.status === 'Reserved' || u.status === 'محجوز';

                    return (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors group">
                        {/* Unit Name & Image */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {coverUrls[u.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={coverUrls[u.id]}
                                alt={u.name}
                                className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-border shadow-2xs"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-muted/80 border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
                                <ImageIcon size={18} />
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-foreground text-sm leading-tight">
                                {u.name}
                              </p>
                              <span className="text-[11px] text-muted-foreground">
                                كود: #{u.id?.slice(0, 6)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Project / Location */}
                        <td className="py-3 px-4">
                          <span className="font-medium text-foreground text-xs">
                            {u.projectName || 'مشروع عام'}
                          </span>
                        </td>

                        {/* Unit Type */}
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground">
                            {u.unitType || 'وحدة سكنية'}
                          </span>
                        </td>

                        {/* Area */}
                        <td className="py-3 px-4 text-left font-bold text-xs tabular-nums">
                          {u.area ? `${u.area} م²` : '—'}
                        </td>

                        {/* Inline Editable Price */}
                        <td className="py-3 px-4 text-left">
                          {isEditingPrice ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <input
                                autoFocus
                                type="text"
                                value={inlinePriceValue}
                                onChange={(e) => setInlinePriceValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveInlinePrice(u);
                                  if (e.key === 'Escape') setEditingPriceId(null);
                                }}
                                onBlur={() => handleSaveInlinePrice(u)}
                                className="h-8 w-28 text-xs font-bold px-2 rounded-lg border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary text-left"
                              />
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSaveInlinePrice(u);
                                }}
                                className="h-8 px-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                              >
                                حفظ
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingPrice(u)}
                              className="group/price flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors text-left"
                              title="انقر لتعديل السعر فورياً"
                            >
                              <span className="font-extrabold text-foreground text-sm tabular-nums">
                                {isSavingPrice ? (
                                  <Loader2 size={12} className="animate-spin inline" />
                                ) : (
                                  fmt(Number(u.price || 0))
                                )}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-medium">ج.م</span>
                              <Pencil
                                size={11}
                                className="opacity-0 group-hover/price:opacity-100 text-primary transition-opacity"
                              />
                            </button>
                          )}
                        </td>

                        {/* Payment Plan */}
                        <td className="py-3 px-4 text-xs text-muted-foreground max-w-[180px] truncate">
                          {u.paymentPlan || 'كاش'}
                        </td>

                        {/* Status Toggle (Inline) */}
                        <td className="py-3 px-4">
                          <select
                            value={u.status}
                            onChange={(e) => changeStatus(u, e.target.value)}
                            className={`h-8 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              isAvailable
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : isReserved
                                  ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400'
                                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <option value="Available">متاح (Available)</option>
                            <option value="Reserved">محجوز (Reserved)</option>
                            <option value="Sold">مباع (Sold)</option>
                          </select>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-left">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setPreview(u)}
                              className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                              title="معاينة تفاصيل الوحدة"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => setDeleting(u)}
                              className="w-8 h-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                              title="حذف الوحدة"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Mobile Cards & Desktop Grid View */}
      {(view === 'grid' || !view) && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 size={28} className="text-muted-foreground" />}
              title="لا توجد وحدات متاحة"
              description="أضف وحدات جديدة إلى مخزونك لتظهر هنا وللعملاء."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((u) => (
                <UnitCard
                  key={u.id}
                  unit={u}
                  imageUrl={coverUrls[u.id]}
                  onReserve={(unit) => changeStatus(unit, 'Reserved')}
                  onPreview={(unit) => setPreview(unit)}
                  onDetails={(unit) => setPreview(unit)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 30-Second Quick-Add Drawer */}
      <QuickAddUnitDrawer
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSuccess={load}
        projects={projects}
        userId={user?.id}
      />

      {/* Quick Preview Modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name || 'تفاصيل العقار'}
        size="md"
      >
        {preview && (
          <div className="space-y-4" dir="rtl">
            <div className="relative h-52 bg-muted rounded-t-xl overflow-hidden -mx-6 -mt-6">
              {coverUrls[preview.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrls[preview.id]}
                  alt={preview.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
                  <Building2 size={36} className="text-primary/40" />
                </div>
              )}
              <div className="absolute top-3 left-3">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-sm">
                  {preview.status === 'Available'
                    ? 'متاح'
                    : preview.status === 'Reserved'
                      ? 'محجوز'
                      : 'مباع'}
                </span>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{preview.name}</h3>
                  <p className="text-xs text-muted-foreground">{preview.projectName || '—'}</p>
                </div>
                <div className="text-left">
                  <p className="text-xl font-black text-primary">
                    {fmt(Number(preview.price || 0))} ج.م
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <div className="bg-muted/50 p-2.5 rounded-xl text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">النوع</p>
                  <p className="text-xs font-bold mt-0.5">{preview.unitType || '—'}</p>
                </div>
                <div className="bg-muted/50 p-2.5 rounded-xl text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">المساحة</p>
                  <p className="text-xs font-bold mt-0.5">
                    {preview.area ? `${preview.area} م²` : '—'}
                  </p>
                </div>
                <div className="bg-muted/50 p-2.5 rounded-xl text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">الدور</p>
                  <p className="text-xs font-bold mt-0.5">{preview.floor || '—'}</p>
                </div>
                <div className="bg-muted/50 p-2.5 rounded-xl text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">طريقة السداد</p>
                  <p className="text-xs font-bold mt-0.5 truncate">
                    {preview.paymentPlan || 'كاش'}
                  </p>
                </div>
              </div>

              {preview.notes && (
                <div className="bg-muted/30 p-3 rounded-xl border border-border/60">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {preview.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between border-t border-border">
                <div className="flex items-center gap-2">
                  {preview.status === 'Available' && (
                    <button
                      onClick={() => {
                        changeStatus(preview, 'Reserved');
                        setPreview(null);
                      }}
                      className="btn-primary text-xs font-bold py-2 px-3 flex items-center gap-1.5"
                    >
                      <Check size={14} />
                      حجز الوحدة
                    </button>
                  )}
                  {preview.status === 'Reserved' && (
                    <button
                      onClick={() => {
                        changeStatus(preview, 'Sold');
                        setPreview(null);
                      }}
                      className="btn-primary text-xs font-bold py-2 px-3 flex items-center gap-1.5"
                    >
                      <BadgeCheck size={14} />
                      تأكيد البيع
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setDeleting(preview);
                    setPreview(null);
                  }}
                  className="btn-ghost text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} className="inline ml-1" />
                  حذف
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="تأكيد حذف الوحدة"
        size="sm"
      >
        <div className="p-4 space-y-4 text-right" dir="rtl">
          <p className="text-sm text-foreground">
            هل أنت متأكد من حذف الوحدة{' '}
            <span className="font-bold text-destructive">{deleting?.name}</span>؟ لن تظهر في قائمة
            الوحدات بعد الآن.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDeleting(null)} className="btn-secondary text-xs">
              إلغاء
            </button>
            <button onClick={confirmDelete} className="btn-danger text-xs">
              نعم، حذف الوحدة
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

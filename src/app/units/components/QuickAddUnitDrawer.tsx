'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Building2,
  Home,
  Waves,
  Layers,
  Briefcase,
  Store,
  Upload,
  Image as ImageIcon,
  Check,
  Star,
  Trash2,
  Loader2,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { unitsService, projectsService } from '@/lib/services/crmService';

export interface QuickAddUnitDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects: any[];
  userId?: string;
}

// Listing Types (نوع العرض)
const LISTING_TYPES = [
  { id: 'sale', label: 'بيع', en: 'Sale' },
  { id: 'rent', label: 'إيجار', en: 'Rent' },
  { id: 'resale', label: 'إعادة بيع', en: 'Resale' },
];

// Property Types (نوع العقار)
const PROPERTY_TYPES = [
  { id: 'apartment', label: 'شقة', icon: Building2 },
  { id: 'villa', label: 'فيلا', icon: Home },
  { id: 'chalet', label: 'شاليه', icon: Waves },
  { id: 'duplex', label: 'دوبلكس', icon: Layers },
  { id: 'office', label: 'مكتب إداري', icon: Briefcase },
  { id: 'commercial', label: 'محل تجاري', icon: Store },
];

// Tap numbers for rooms/baths
const NUMBER_OPTIONS = ['1', '2', '3', '4', '5+'];

// Finishing Types (التشطيب)
const FINISHING_TYPES = [
  { id: 'full', label: 'تشطيب كامل' },
  { id: 'semi', label: 'نصف تشطيب' },
  { id: 'core', label: 'طوب أحمر' },
];

// Payment Types (الدفع)
const PAYMENT_TYPES = [
  { id: 'cash', label: 'كاش' },
  { id: 'installment', label: 'تقسيط' },
];

// Amenities (المميزات)
const AMENITIES_LIST = [
  'عدادات كاملة',
  'جراج',
  'أمن وحراسة',
  'تطل على حديقة',
  'قريبة من الخدمات',
  'أسانسير',
  'حمام سباحة',
  'إطلالة بحر / بحيرة',
];

// Quick auto-suggestions for titles/locations
const DEFAULT_SUGGESTIONS = [
  'شقة فاخرة للبيع',
  'فيلا مستقلة جاهزة للاستلام',
  'دوبلكس بحديقة خاصة',
  'شاليه صف أول على البحر',
  'مكتب إداري مجهز بالكامل',
  'محل تجاري بموقع حيوي',
];

// Helper to format number with thousand separators
function formatThousand(val: string | number): string {
  if (val === '' || val === null || val === undefined) return '';
  const num = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US');
}

function parseThousand(val: string): number {
  const clean = val.replace(/,/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

export default function QuickAddUnitDrawer({
  open,
  onClose,
  onSuccess,
  projects,
  userId,
}: QuickAddUnitDrawerProps) {
  // Drawer state
  const [listingType, setListingType] = useState('sale');
  const [propertyType, setPropertyType] = useState('apartment');
  const [rooms, setRooms] = useState('3');
  const [baths, setBaths] = useState('2');
  const [finishing, setFinishing] = useState('full');
  const [paymentType, setPaymentType] = useState('cash');

  // Text / Numeric Inputs
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [area, setArea] = useState('');
  const [price, setPrice] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [installmentYears, setInstallmentYears] = useState('5');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    'أمن وحراسة',
    'أسانسير',
  ]);

  // Media Dropzone
  const [images, setImages] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission States
  const [submitting, setSubmitting] = useState(false);
  const [saveAction, setSaveAction] = useState<'close' | 'another'>('close');

  // Auto-fill project or suggest
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Clean previews on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, [images]);

  // Reset form or prepare for "Add Another"
  const resetForm = (keepLocationAndProject = false) => {
    if (!keepLocationAndProject) {
      setTitle('');
      setLocation('');
      setArea('');
      setPrice('');
      setDownPayment('');
    } else {
      // keep location, project, listingType, propertyType, finishing, paymentType
      setTitle('');
      setArea('');
      setPrice('');
      setDownPayment('');
    }
    // Clean uploaded images
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setCoverIndex(0);
  };

  const handleToggleAmenity = (item: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: { id: string; file: File; preview: string }[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        newItems.push({
          id: Math.random().toString(36).substring(7),
          file,
          preview: URL.createObjectURL(file),
        });
      }
    });

    if (newItems.length > 0) {
      setImages((prev) => [...prev, ...newItems]);
      toast.success(`تمت إضافة ${newItems.length} صورة`);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      const filtered = prev.filter((_, i) => i !== index);
      if (coverIndex >= filtered.length) {
        setCoverIndex(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  const handleSubmit = async (action: 'close' | 'another') => {
    if (!title.trim()) {
      toast.error('يرجى كتابة عنوان أو رقم الوحدة');
      return;
    }

    const numericPrice = parseThousand(price);
    if (numericPrice <= 0) {
      toast.error('يرجى تحديد سعر الوحدة بشكل صحيح');
      return;
    }

    setSubmitting(true);
    setSaveAction(action);

    try {
      // Resolve or create Project
      let projId = selectedProjectId;
      const targetProjectName = location.trim() || 'المشروع العام';

      if (!projId && projects.length > 0) {
        projId = projects[0].id;
      }

      // If no project exists at all in the DB, create one automatically
      if (!projId) {
        try {
          const newProj = await projectsService.create(
            {
              name: targetProjectName,
              status: 'Active',
              location: targetProjectName,
            },
            userId || ''
          );
          projId = newProj.id;
        } catch {
          // Fallback if projects table doesn't require user
        }
      }

      // Assemble Unit data
      const propLabel = PROPERTY_TYPES.find((p) => p.id === propertyType)?.label || propertyType;
      const listLabel = LISTING_TYPES.find((l) => l.id === listingType)?.label || listingType;
      const finishLabel = FINISHING_TYPES.find((f) => f.id === finishing)?.label || finishing;

      const fullUnitType = `${propLabel} - ${listLabel}`;
      const notesJson = JSON.stringify({
        listingType,
        propertyType,
        rooms,
        bathrooms: baths,
        finishing: finishLabel,
        paymentType,
        amenities: selectedAmenities,
        location: location.trim(),
      });

      const paymentPlanSummary =
        paymentType === 'installment'
          ? `تقسيط: مقدم ${downPayment || '0'} ج.م - ${installmentYears} سنوات`
          : 'كاش';

      const unitPayload = {
        projectId: projId,
        name: title.trim(),
        unitType: fullUnitType,
        area: parseThousand(area) || 0,
        price: numericPrice,
        paymentPlan: paymentPlanSummary,
        downPaymentPct: paymentType === 'installment' ? 10 : 0,
        installmentYears: paymentType === 'installment' ? parseInt(installmentYears, 10) || 0 : 0,
        status: 'Available',
        notes: notesJson,
      };

      // 1. Create Unit Row
      const createdUnit = await unitsService.create(unitPayload, userId);

      // 2. Upload images if any
      if (images.length > 0 && createdUnit?.id) {
        // Upload cover first
        const ordered = [...images];
        if (coverIndex > 0 && coverIndex < ordered.length) {
          const [coverImg] = ordered.splice(coverIndex, 1);
          ordered.unshift(coverImg);
        }

        let firstUploadedPath = '';
        for (let i = 0; i < ordered.length; i++) {
          try {
            const upResult = await unitsService.uploadFile(createdUnit.id, ordered[i].file);
            if (i === 0 && upResult?.file_path) {
              firstUploadedPath = upResult.file_path;
            }
          } catch (uploadErr) {
            console.error('Error uploading image', uploadErr);
          }
        }

        // Set unit cover photo if we uploaded
        if (firstUploadedPath) {
          await unitsService.update(createdUnit.id, {
            ...createdUnit,
            imagePath: firstUploadedPath,
          });
        }
      }

      toast.success(
        action === 'another'
          ? 'تم حفظ الوحدة بنجاح! جاهز لإضافة وحدة جديدة في نفس المشروع'
          : 'تم حفظ ونشر الوحدة بنجاح'
      );

      onSuccess();

      if (action === 'another') {
        resetForm(true);
      } else {
        resetForm(false);
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء حفظ الوحدة');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 left-0 pl-0 max-w-full flex">
        <div className="w-screen max-w-2xl bg-card border-r border-border shadow-2xl flex flex-col h-full animate-in slide-in-from-left duration-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40 sticky top-0 z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">إضافة وحدة سريعة (30 ثانية)</h2>
                <p className="text-xs text-muted-foreground">
                  أدخل بيانات الوحدة بنقرات سريعة بدون كتابة طويلة
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* 1. نوع العرض (Listing Type) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                نوع العرض
              </label>
              <div className="grid grid-cols-3 gap-2 bg-muted/50 p-1 rounded-xl">
                {LISTING_TYPES.map((type) => {
                  const active = listingType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setListingType(type.id)}
                      className={`h-10 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm scale-[1.01]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                      }`}
                    >
                      {active && <Check size={14} />}
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. نوع العقار (Property Type Cards) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                نوع العقار
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PROPERTY_TYPES.map((prop) => {
                  const Icon = prop.icon;
                  const active = propertyType === prop.id;
                  return (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() => setPropertyType(prop.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        active
                          ? 'border-primary bg-primary/5 text-primary font-bold shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-muted/50 text-foreground font-medium'
                      }`}
                    >
                      <Icon size={20} className={active ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="text-xs mt-1.5">{prop.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. الغرف والحمامات (Rooms & Bathrooms Tap Buttons) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  عدد الغرف
                </label>
                <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl">
                  {NUMBER_OPTIONS.map((num) => {
                    const active = rooms === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRooms(num)}
                        className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  عدد الحمامات
                </label>
                <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl">
                  {NUMBER_OPTIONS.map((num) => {
                    const active = baths === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setBaths(num)}
                        className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. التشطيب ونظام الدفع (Finishing & Payment Pills) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  حالة التشطيب
                </label>
                <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl">
                  {FINISHING_TYPES.map((f) => {
                    const active = finishing === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFinishing(f.id)}
                        className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? 'bg-card text-foreground shadow-sm border border-border'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  طريقة السداد
                </label>
                <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl">
                  {PAYMENT_TYPES.map((p) => {
                    const active = paymentType === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaymentType(p.id)}
                        className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 5. Essential Inputs (2-column Clean Grid) */}
            <div className="border border-border/80 rounded-2xl p-4 bg-muted/20 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Title / Unit Number */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      عنوان الوحدة / الكود <span className="text-destructive">*</span>
                    </label>
                    <span className="text-[10px] text-muted-foreground">اقتراحات سريعة</span>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: شقة 104 - برج الياسمين"
                    className="input-base text-sm font-medium w-full"
                  />
                  {/* Quick Suggestions Chips */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {DEFAULT_SUGGESTIONS.slice(0, 3).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setTitle(sug)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location / Compound */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    المنطقة / الكمبوند / المشروع
                  </label>
                  {projects.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={selectedProjectId}
                        onChange={(e) => {
                          setSelectedProjectId(e.target.value);
                          const p = projects.find((proj) => proj.id === e.target.value);
                          if (p) setLocation(p.name);
                        }}
                        className="input-base text-sm appearance-none"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="أو اكتب اسم المنطقة (مثال: التجمع الخامس)"
                        className="input-base text-xs text-muted-foreground"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="مثال: التجمع الخامس - هايد بارك"
                      className="input-base text-sm"
                    />
                  )}
                </div>
              </div>

              {/* Area & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Area */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    المساحة (م²) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={area}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setArea(formatThousand(raw));
                      }}
                      placeholder="180"
                      className="input-base text-sm font-bold pl-10"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                      م²
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    السعر الإجمالي (ج.م) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setPrice(formatThousand(raw));
                      }}
                      placeholder="3,500,000"
                      className="input-base text-sm font-bold pl-12 text-primary"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                      ج.م
                    </span>
                  </div>
                </div>
              </div>

              {/* Conditional Installment Fields */}
              {paymentType === 'installment' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/60 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      المقدم المطلوب (ج.م)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={downPayment}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setDownPayment(formatThousand(raw));
                        }}
                        placeholder="350,000"
                        className="input-base text-sm font-bold pl-12"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                        ج.م
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      سنوات التقسيط
                    </label>
                    <div className="flex items-center gap-1.5">
                      {['3', '5', '7', '8', '10'].map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setInstallmentYears(yr)}
                          className={`flex-1 h-9 rounded-lg text-xs font-bold border transition-colors ${
                            installmentYears === yr
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card border-border hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          {yr} سنين
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 6. Smart Media Dropzone */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  صور الوحدة ({images.length})
                </label>
                <span className="text-[11px] text-muted-foreground">
                  أول صورة تصبح صورة الغلاف تلقائياً
                </span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[0.99]'
                    : 'border-border hover:border-primary/60 bg-muted/10'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-primary shadow-sm">
                    <Upload size={18} />
                  </div>
                  <p className="text-xs font-bold text-foreground">
                    اسحب الصور هنا أو انقر لاختيار عدة صور دفعة واحدة
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    يدعم JPG, PNG, WEBP (حجم أقل من 10 ميجا)
                  </p>
                </div>
              </div>

              {/* Thumbnails list with cover selector */}
              {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
                  {images.map((img, idx) => {
                    const isCover = coverIndex === idx;
                    return (
                      <div
                        key={img.id}
                        className={`relative rounded-xl overflow-hidden aspect-[4/3] border group bg-muted ${
                          isCover ? 'ring-2 ring-primary border-primary' : 'border-border'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.preview}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />

                        {/* Cover Badge */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCoverIndex(idx);
                          }}
                          className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm transition-colors ${
                            isCover
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-black/60 text-white hover:bg-black/80'
                          }`}
                        >
                          <Star size={10} className={isCover ? 'fill-current' : ''} />
                          {isCover ? 'الغلاف' : 'اجعلها غلاف'}
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(idx);
                          }}
                          className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-md bg-destructive/90 text-destructive-foreground hover:bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 7. المميزات (Amenities Check-Chips) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                المميزات والخدمات
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AMENITIES_LIST.map((amenity) => {
                  const checked = selectedAmenities.includes(amenity);
                  return (
                    <button
                      key={amenity}
                      type="button"
                      onClick={() => handleToggleAmenity(amenity)}
                      className={`h-8 px-3 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                          : 'border-border bg-card hover:bg-muted text-foreground'
                      }`}
                    >
                      {checked && <Check size={12} />}
                      {amenity}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="p-4 border-t border-border bg-card/95 backdrop-blur-sm sticky bottom-0 z-10 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit('close')}
              className="w-full sm:flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:bg-primary/95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting && saveAction === 'close' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              حفظ ونشر الوحدة
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit('another')}
              className="w-full sm:flex-1 h-11 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-sm border border-border shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting && saveAction === 'another' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} className="text-primary" />
              )}
              حفظ وإضافة وحدة أخرى
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

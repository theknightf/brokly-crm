'use client';
import React, { useEffect, useState } from 'react';
import { X, Loader2, Save, Clock, AlertTriangle, Calendar, Users, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { teamShiftAdjustmentsService } from '@/lib/teamShiftAdjustmentsService';
import { DEFAULT_SHIFTS, getShiftForTeam, addMinutesToTime } from '@/lib/attendanceLogic';
import { formatMinutes } from '@/lib/officeHours';

interface TeamOption { id: string; name: string }

interface TeamShiftDelayModalProps {
  teams: TeamOption[];
  defaultTeamId?: string | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

export default function TeamShiftDelayModal({ teams, defaultTeamId, defaultDate, onClose, onSaved }: TeamShiftDelayModalProps) {
  const [teamId, setTeamId] = useState<string>(defaultTeamId || (teams[0]?.id || ''));
  const [adjustmentType, setAdjustmentType] = useState<'temporary' | 'permanent'>('temporary');
  const [date, setDate] = useState<string>(defaultDate || todayLocal());
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('20:00');
  const [grace, setGrace] = useState('20');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [offsetApplied, setOffsetApplied] = useState<number | null>(null);

  const selectedTeam = teams.find(t => t.id === teamId) || teams[0];
  const baseShift = getShiftForTeam(selectedTeam?.name || '', DEFAULT_SHIFTS);

  useEffect(() => {
    // Initialize with base shift times when team changes
    if (selectedTeam) {
      const base = getShiftForTeam(selectedTeam.name, DEFAULT_SHIFTS);
      setStartTime(base.start);
      setEndTime(base.end);
      setGrace(String(base.graceMinutes));
      setOffsetApplied(null);
    }
  }, [selectedTeam?.id]);

  const applyQuickOffset = (mins: number) => {
    const base = getShiftForTeam(selectedTeam?.name || '', DEFAULT_SHIFTS);
    const newStart = addMinutesToTime(base.start, mins);
    const newEnd = addMinutesToTime(base.end, mins);
    setStartTime(newStart);
    setEndTime(newEnd);
    setOffsetApplied(mins);
    toast.success(`Applied +${mins} mins — ${newStart} to ${newEnd}`);
  };

  const graceCutoff = (() => {
    try {
      const mins = startTime.split(':').map(Number);
      const total = mins[0]*60 + mins[1] + parseInt(grace||'0',10);
      return formatMinutes(total);
    } catch { return '—'; }
  })();

  const handleSave = async () => {
    if (!selectedTeam) { toast.error('اختر الفريق'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) {
      toast.error('صيغة الوقت غير صحيحة (HH:MM)'); return;
    }
    const g = parseInt(grace,10);
    if (Number.isNaN(g) || g<0 || g>120) { toast.error('فترة السماح 0–120'); return; }
    if (adjustmentType==='temporary' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error('اختر تاريخ صحيح'); return; }

    setSaving(true);
    try {
      // Prefer API route for proper admin check and fallback
      const res = await fetch('/api/attendance/team-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          teamName: selectedTeam.name,
          date: adjustmentType==='temporary' ? date : null,
          startTime,
          endTime,
          graceMinutes: g,
          reason: reason.trim(),
          isTemporary: adjustmentType==='temporary',
        }),
      });
      const j = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to save');
      // Also try service for local fallback consistency
      try {
        await teamShiftAdjustmentsService.create({
          teamId: selectedTeam.id,
          teamName: selectedTeam.name,
          date: adjustmentType==='temporary' ? date : null,
          startTime,
          endTime,
          graceMinutes: g,
          reason: reason.trim(),
          isTemporary: adjustmentType==='temporary',
        });
      } catch {}
      toast.success(adjustmentType==='temporary' ? `تم تأخير وردية ${selectedTeam.name} ليوم ${date}` : `تم تعديل وردية ${selectedTeam.name} بشكل دائم`);
      onSaved();
    } catch (e:any) {
      toast.error(e?.message || 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock size={14} />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground" dir="rtl">تأخير وردية الفريق</p>
              <p className="text-[11px] text-muted-foreground" dir="ltr">Delay Team Shift</p>
              <p className="text-xs text-muted-foreground" dir="rtl">ترحيل وتأخير مواعيد الورديات للفرق</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Team Selector */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-foreground" dir="rtl">الفريق المستهدف *</span>
              <span className="block text-[11px] text-muted-foreground" dir="ltr">Target Team</span>
            </label>
            <div className="relative">
              <select value={teamId} onChange={e=> setTeamId(e.target.value)} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none appearance-none">
                {teams.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Users size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
            {selectedTeam && (
              <p className="text-[11px] text-muted-foreground mt-1" dir="rtl">الوردية الأساسية: <bdi dir="ltr" className="font-semibold text-foreground">{getShiftForTeam(selectedTeam.name, DEFAULT_SHIFTS).start}–{getShiftForTeam(selectedTeam.name, DEFAULT_SHIFTS).end}</bdi> · <bdi dir="ltr">{selectedTeam.name}</bdi> {getShiftForTeam(selectedTeam.name, DEFAULT_SHIFTS).labelAr}</p>
            )}
          </div>

          {/* Adjustment Type */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-foreground" dir="rtl">نوع التعديل *</span>
              <span className="block text-[11px] text-muted-foreground" dir="ltr">Adjustment Type</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=> setAdjustmentType('temporary')} className={`p-3 rounded-xl border-2 text-left transition-all ${adjustmentType==='temporary' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 text-amber-800 dark:text-amber-200' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-muted-foreground'}`}>
                <p className="text-xs font-bold flex items-center gap-1"><Calendar size={12}/> Temporary Delay</p>
                <p className="text-[11px]">تأخير استثنائي لليوم فقط</p>
                <p className="text-[10px] opacity-70">Traffic/weather/event</p>
              </button>
              <button onClick={()=> setAdjustmentType('permanent')} className={`p-3 rounded-xl border-2 text-left transition-all ${adjustmentType==='permanent' ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-400 text-violet-800 dark:text-violet-200' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-muted-foreground'}`}>
                <p className="text-xs font-bold flex items-center gap-1"><Timer size={12}/> Permanent Update</p>
                <p className="text-[11px]">تعديل دائم للوردية</p>
                <p className="text-[10px] opacity-70">Schedule update</p>
              </button>
            </div>
            {adjustmentType==='temporary' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-foreground mb-1">التاريخ — Date *</label>
                <input type="date" value={date} onChange={e=> setDate(e.target.value)} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none" />
              </div>
            )}
          </div>

          {/* Quick Offset Buttons */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-foreground" dir="rtl">تأخير سريع</span>
              <span className="block text-[11px] text-muted-foreground" dir="ltr">Quick Offset</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '+30 mins', mins: 30 },
                { label: '+1 hour', mins: 60 },
                { label: '+2 hours', mins: 120 },
              ].map(btn=> (
                <button
                  key={btn.label}
                  onClick={()=> applyQuickOffset(btn.mins)}
                  className={`h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all ${offsetApplied===btn.mins ? 'bg-amber-500 text-white border-amber-500 shadow' : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-amber-400 hover:text-amber-600'}`}
                >
                  <Timer size={12}/> {btn.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">يُضاف إلى بداية ونهاية الوردية الأساسية</p>
          </div>

          {/* Custom Time Inputs */}
          <div className="bg-muted/30 border border-border rounded-xl p-3">
            <div className="mb-2">
              <p className="text-xs font-bold text-foreground" dir="rtl">أو تحديد يدوي</p>
              <p className="text-[11px] text-muted-foreground" dir="ltr">Custom Time Inputs</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground" dir="rtl">بداية جديدة *</span>
                <span className="text-[10px] text-muted-foreground" dir="ltr">New Start</span>
                <input type="time" value={startTime} onChange={e=> { setStartTime(e.target.value); setOffsetApplied(null); }} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground" dir="rtl">نهاية جديدة *</span>
                <span className="text-[10px] text-muted-foreground" dir="ltr">New End</span>
                <input type="time" value={endTime} onChange={e=> { setEndTime(e.target.value); setOffsetApplied(null); }} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none" />
              </label>
            </div>
            <label className="flex flex-col gap-1 mt-3">
              <span className="text-xs font-medium text-foreground flex items-center gap-1" dir="rtl"><Clock size={12}/> فترة السماح <span className="text-muted-foreground font-normal" dir="ltr">— Grace Period (mins)</span></span>
              <input type="number" min={0} max={120} value={grace} onChange={e=> setGrace(e.target.value)} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none" />
              <span className="text-[11px] text-muted-foreground" dir="rtl">السماح يبدأ من البداية الجديدة — Cutoff: <bdi dir="ltr" className="text-foreground">{graceCutoff}</bdi> · تأخير بعدها يُحتسب من <bdi dir="ltr">{startTime}</bdi></span>
            </label>
          </div>

          {/* Preview */}
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3">
            <div className="flex items-center gap-1">
              <AlertTriangle size={12} className="text-amber-800 dark:text-amber-200"/>
              <span className="text-xs font-bold text-amber-800 dark:text-amber-200" dir="rtl">معاينة</span>
              <span className="text-[11px] text-amber-700 dark:text-amber-300" dir="ltr">— Preview</span>
            </div>
            <p className="text-sm font-bold text-foreground mt-1" dir="rtl">وردية معدلة: <bdi dir="ltr">{startTime} – {endTime}</bdi> · سماح 20د حتى <bdi dir="ltr">{graceCutoff}</bdi></p>
            <p className="text-xs text-muted-foreground" dir="ltr">Late cutoff dynamically = delayed start + {grace} mins · Overtime after <bdi dir="ltr">{endTime}</bdi></p>
            {selectedTeam && <p className="text-xs text-muted-foreground mt-1" dir="ltr">Original: <bdi dir="ltr">{getShiftForTeam(selectedTeam.name, DEFAULT_SHIFTS).start}–{getShiftForTeam(selectedTeam.name, DEFAULT_SHIFTS).end}</bdi> → <span className="text-amber-700 font-bold">New: <bdi dir="ltr">{startTime}–{endTime}</bdi></span></p>}
          </div>

          {/* Reason */}
          <div>
            <label className="block mb-1.5">
              <span className="block text-xs font-bold text-foreground" dir="rtl">سبب التأخير</span>
              <span className="block text-[11px] text-muted-foreground" dir="ltr">Reason / Note (optional)</span>
            </label>
            <input value={reason} onChange={e=> setReason(e.target.value)} placeholder="مثال: اجتماع خارجي، ظروف طقس، تأخير جماعي معتمد…" dir="rtl" className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none" />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border bg-card text-foreground font-bold hover:bg-muted transition-colors flex flex-col items-center justify-center leading-tight py-1">
              <span dir="rtl">إلغاء</span><span className="text-[10px] font-normal" dir="ltr">Cancel</span>
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
              <span className="flex flex-col items-start leading-tight text-left">
                <span dir="rtl">تطبيق التعديل</span><span className="text-[10px] font-normal" dir="ltr">Apply Reschedule</span>
              </span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center" dir="rtl">سيتم إعادة حساب التأخير والإضافي لكل أفراد <bdi dir="ltr">{selectedTeam?.name || 'الفريق'}</bdi> تلقائياً</p>
        </div>
      </div>
    </div>
  );
}

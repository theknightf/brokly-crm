'use client';
import React, { useState } from 'react';
import { X, Loader2, Save, Calendar, ShieldCheck, Clock, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { attendancePermissionsService } from '@/lib/attendancePermissionsService';
import { LEAVE_TYPES } from '@/lib/attendanceLogic';

interface UserOption { id: string; full_name: string; email: string; team_id?: string | null }

interface LeavePermissionModalProps {
  users: UserOption[];
  defaultUserId?: string;
  defaultDate?: string; // YYYY-MM-DD
  onClose: () => void;
  onSaved: () => void;
}

type Tab = 'leave' | 'permission';

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

export default function LeavePermissionModal({ users, defaultUserId, defaultDate, onClose, onSaved }: LeavePermissionModalProps) {
  const [tab, setTab] = useState<Tab>('leave');
  const [userId, setUserId] = useState(defaultUserId || '');
  const [date, setDate] = useState(defaultDate || todayLocal());
  const [endDate, setEndDate] = useState(defaultDate || todayLocal());
  // leave fields
  const [leaveType, setLeaveType] = useState('annual');
  const [leaveReason, setLeaveReason] = useState('');
  // permission fields
  const [permType, setPermType] = useState<'late_arrival' | 'early_departure' | 'mission'>('late_arrival');
  const [excusedMins, setExcusedMins] = useState('45');
  const [permReason, setPermReason] = useState('');
  const [saving, setSaving] = useState(false);

  const activeUsers = users.filter((u) => (u as any).is_active !== false);

  const submitLeave = async () => {
    if (!userId) { toast.error('اختر الموظف'); return; }
    if (!date) { toast.error('اختر التاريخ'); return; }
    if (endDate < date) { toast.error('تاريخ النهاية قبل البداية'); return; }
    setSaving(true);
    try {
      // Use existing leave API via createClient or fetch to /api/leaves?
      // Try direct Supabase via leaveService fallback, otherwise via /api/attendance/leave
      // First try API route /api/leaves/create (if exists), else use Supabase
      let res: Response | null = null;
      // Try custom leave endpoint
      try {
        res = await fetch('/api/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, leaveType, startDate: date, endDate, reason: leaveReason, status: 'approved' }),
        });
      } catch {}
      if (!res || !res.ok) {
        // fallback: use Supabase directly via peopleOpsService
        const { leaveService } = await import('@/lib/services/peopleOpsService');
        const days = Math.max(1, Math.floor((new Date(endDate).getTime() - new Date(date).getTime())/86400000)+1);
        await leaveService.request({ userId, leaveType, startDate: date, endDate, days, reason: leaveReason });
        // auto-approve if possible
        try {
          const all = await leaveService.getAll();
          const mine = all.find((l:any)=> l.userId===userId && l.startDate===date);
          if (mine) await leaveService.review(mine.id, 'approved', userId);
        } catch {}
      }
      toast.success('تم تسجيل الإجازة — ستظهر كشريط إجازة بدلاً من غياب');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ الإجازة');
    } finally { setSaving(false); }
  };

  const submitPermission = async () => {
    if (!userId) { toast.error('اختر الموظف'); return; }
    if (!date) { toast.error('اختر التاريخ'); return; }
    const mins = parseInt(excusedMins,10);
    if (Number.isNaN(mins) || mins <=0 || mins>480) { toast.error('أدخل دقائق معتمدة صحيحة (1–480)'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, date, type: permType, excusedMinutes: mins, reason: permReason, status: 'approved' }),
      });
      const j = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed');
      // also try client service for redundancy
      try { await attendancePermissionsService.create({ userId, date, type: permType, excusedMinutes: mins, reason: permReason, status: 'approved' }); } catch {}
      toast.success('تم منح الإذن — سيُخصم من التأخير/الانصراف تلقائياً');
      onSaved();
    } catch (e:any) {
      // fallback to client service only (local)
      try {
        await attendancePermissionsService.create({ userId, date, type: permType, excusedMinutes: parseInt(excusedMins,10), reason: permReason, status: 'approved' });
        toast.success('تم منح الإذن محلياً — فعّال لهذه الجلسة');
        onSaved();
      } catch (err:any) {
        toast.error(e?.message || 'فشل حفظ الإذن');
      }
    } finally { setSaving(false); }
  };

  const darkInput =
    'w-full bg-[#12141a] text-zinc-100 border border-white/10 rounded-xl px-3 py-2.5 text-sm placeholder:text-zinc-500 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#181b22] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#181b22] rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <p className="text-base font-bold text-zinc-100 flex items-center gap-2" dir="rtl">
              <ShieldCheck size={16} className="text-lime-400" />
              إجازة / إذن معتمد
            </p>
            <p className="text-[11px] text-zinc-500" dir="ltr">Leave / Permission — Quick Action</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100 flex items-center justify-center transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#12141a] border border-white/10 rounded-xl">
            <button
              onClick={() => setTab('leave')}
              className={`min-h-[44px] rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${tab==='leave' ? 'bg-lime-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <Calendar size={14} /> إجازة رسمية
            </button>
            <button
              onClick={() => setTab('permission')}
              className={`min-h-[44px] rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${tab==='permission' ? 'bg-lime-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <Clock size={14} /> إذن / مأمورية
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">الموظف *</label>
            <select value={userId} onChange={(e)=> setUserId(e.target.value)} className={darkInput} dir="rtl">
              <option value="">اختر الموظف…</option>
              {activeUsers.map((u)=> <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select>
          </div>

          {tab==='leave' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">من تاريخ *</label>
                  <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className={darkInput} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">إلى تاريخ *</label>
                  <input type="date" value={endDate} onChange={(e)=> setEndDate(e.target.value)} className={darkInput} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">نوع الإجازة *</label>
                <select value={leaveType} onChange={(e)=> setLeaveType(e.target.value)} className={darkInput} dir="rtl">
                  {LEAVE_TYPES.map((lt)=> <option key={lt.value} value={lt.value}>{lt.ar} ({lt.en})</option>)}
                </select>
                <p className="text-[11px] text-zinc-500 mt-1" dir="rtl">ستظهر كشريط إجازة بدلاً من “غياب” ولا تُحتسب غرامة.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">السبب / ملاحظات</label>
                <input value={leaveReason} onChange={(e)=> setLeaveReason(e.target.value)} placeholder="مثال: عطلة رسمية، تقرير طبي معتمد…" dir="rtl" className={darkInput} />
              </div>
              <button onClick={submitLeave} disabled={saving || !userId} className="w-full min-h-[48px] rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_10px_28px_-10px_rgba(132,204,22,0.6)] transition-colors pb-[env(safe-area-inset-bottom)]">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ الإجازة
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">التاريخ *</label>
                <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className={darkInput} />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">نوع الإذن *</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['late_arrival','تأخير','Late'],
                    ['early_departure','مبكر','Early'],
                    ['mission','مأمورية','Mission'],
                  ] as const).map(([v, ar, en])=> (
                    <button
                      key={v}
                      onClick={()=> setPermType(v as any)}
                      className={`min-h-[64px] p-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${permType===v ? 'bg-lime-500/15 border-lime-400 text-lime-300' : 'bg-[#12141a] border-white/10 text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {v==='late_arrival' ? <Clock size={14} /> : v==='early_departure' ? <Briefcase size={14} /> : <ShieldCheck size={14} />}
                      <span dir="rtl">{ar}</span><span className="text-[10px] opacity-70" dir="ltr">{en}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">الدقائق المعتمدة *</label>
                <div className="flex gap-2">
                  <input type="number" min={1} max={480} value={excusedMins} onChange={(e)=> setExcusedMins(e.target.value)} className={`${darkInput} flex-1`} dir="ltr" />
                  <span className="px-3 py-2.5 rounded-xl bg-[#12141a] border border-white/10 text-xs font-bold text-zinc-400 flex items-center" dir="rtl">دقيقة</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1" dir="rtl">مثال: متأخر 45د ومعه إذن 45د ← الصافي 0. إذن مأمورية يغطي اليوم كاملاً.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5" dir="rtl">السبب معتمد من HR/Admin</label>
                <input value={permReason} onChange={(e)=> setPermReason(e.target.value)} placeholder="مثال: موعد مستشفى، مهمة عميل خارجية…" dir="rtl" className={darkInput} />
              </div>
              <button onClick={submitPermission} disabled={saving || !userId} className="w-full min-h-[48px] rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_10px_28px_-10px_rgba(132,204,22,0.6)] transition-colors pb-[env(safe-area-inset-bottom)]">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} منح الإذن
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

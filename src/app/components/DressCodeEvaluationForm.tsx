'use client';
import React, { useEffect, useState } from 'react';
import { Shirt, Star, Loader2, Check, AlertCircle, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface EmployeeOption { id: string; full_name: string; email: string; role: string }

export default function DressCodeEvaluationForm() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [flags, setFlags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/employees/list-simple', { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && Array.isArray(j.users)) setEmployees(j.users);
        else return fetch('/api/admin/analytics?period=day', { cache: 'no-store' }).then(r => r.json()).then(j2 => {
          if (Array.isArray(j2.users)) setEmployees(j2.users.map((u: any) => ({ id: u.user_id, full_name: u.full_name, email: u.email, role: u.role })));
        });
      }).catch(() => {});
    // Check admin via leaderboard access
    fetch('/api/evaluations/dress-code?from=2024-01-01&to=2024-01-02', { cache: 'no-store' }).then(r => {
      if (r.status === 403) setIsAdmin(false);
      else setIsAdmin(true);
    }).catch(() => setIsAdmin(true));
  }, []);

  const submit = async () => {
    if (!employeeId) { toast.error('Select an employee'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/evaluations/dress-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          date,
          dressCodeRating: rating,
          notes,
          behavioralFlags: flags.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Dress code evaluation saved — Leaderboard updated');
      setNotes(''); setFlags('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  if (isAdmin === false) {
    return <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2 text-sm text-amber-800"><AlertCircle size={16}/> Only Admin/Owner can submit dress code evaluations.</div>;
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-lime-600 dark:text-lime-400 p-2 rounded-xl"><Shirt size={16} /></div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Daily Dress Code Evaluation</h3>
          <p className="text-xs text-muted-foreground">Admin input → feeds Leaderboard (30%) & Owner 360 in real-time</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Employee *</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all">
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.email} · {e.role}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1"><Calendar size={12}/> Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().slice(0,10)} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all" />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-foreground mb-2">Dress Code Rating *</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 1, label: 'Casual', sub: 'Score 1 · Low' },
            { v: 2, label: 'Semi-Formal', sub: 'Score 2 · Medium' },
            { v: 3, label: 'Classic / Formal', sub: 'Score 3 · High' },
          ].map(o => (
            <button key={o.v} type="button" onClick={() => setRating(o.v)} className={`p-3 rounded-xl font-bold text-sm transition-all flex flex-col items-center gap-1 border-2 ${rating===o.v ? 'bg-lime-500/15 border-lime-400 text-lime-600 dark:text-lime-400 shadow-[0_0_12px_rgba(163,230,53,0.2)]' : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100'}`}>
              <span className="text-sm">{o.label}</span>
              <span className="text-[11px] opacity-70">{o.sub}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Feeds lead quality ranking · {rating===1?'Low weight': rating===2?'Medium weight':'High weight'}</p>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-foreground mb-1.5">Behavioral Flags (comma separated)</label>
        <input type="text" value={flags} onChange={e => setFlags(e.target.value)} placeholder="e.g. no tie, sneakers, missing badge" className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all text-sm" />
      </div>
      <div className="mt-3">
        <label className="block text-xs font-medium text-foreground mb-1.5">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional observation…" rows={2} className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all text-sm resize-none" />
      </div>

      <button onClick={submit} disabled={submitting || !employeeId} className="bg-lime-500 hover:bg-lime-400 text-zinc-950 font-bold rounded-xl py-3 w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-sm hover:shadow-[0_0_16px_rgba(163,230,53,0.3)]">
        {submitting ? <Loader2 size={14} className="animate-spin text-zinc-950"/> : <Check size={14} className="text-zinc-950"/>} Submit Evaluation
      </button>
      <p className="text-[11px] text-muted-foreground text-center mt-2">Writes to <code>evaluations</code> → <code>activity_log</code> → Leaderboard & 360 profile update instantly</p>
    </div>
  );
}

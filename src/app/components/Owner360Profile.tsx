'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { User, Phone, Clock, Shirt, TrendingUp, Calendar, Award, Activity, Timer, FileText, ChevronDown, Loader2, Download } from 'lucide-react';

interface Profile360 {
  employee: { id: string; full_name: string; email: string; role: string; phone: string; is_active: boolean };
  from: string; to: string;
  scores: { callScore: number; attendanceScore: number; dressScore: number; totalScore: number; grade: string; formula: string };
  category_scores: Record<string, number>;
  summary: any;
  attendance: any[]; calls: any[]; evaluations: any[]; timeline: any[]; scoreHistory: any[];
}

export default function Owner360Profile({ employeeId, initialFrom, initialTo }: { employeeId: string; initialFrom?: string; initialTo?: string }) {
  const [period, setPeriod] = useState<'month'|'week'|'custom'>(initialFrom ? 'custom' : 'month');
  const [from, setFrom] = useState(initialFrom || '');
  const [to, setTo] = useState(initialTo || '');
  const [data, setData] = useState<Profile360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const computeRange = useCallback(() => {
    const now = new Date();
    if (period === 'week') {
      const dow = (now.getDay() + 6) % 7;
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      return { from: s.toISOString().slice(0,10), to: e.toISOString().slice(0,10) };
    }
    if (period === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth()+1, 0);
      return { from: s.toISOString().slice(0,10), to: e.toISOString().slice(0,10) };
    }
    return { from: from || new Date().toISOString().slice(0,10), to: to || new Date().toISOString().slice(0,10) };
  }, [period, from, to]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const r = computeRange();
    try {
      const res = await fetch(`/api/employees/${employeeId}/profile-360?from=${r.from}&to=${r.to}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [employeeId, computeRange]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-violet-600"/></div>;
  if (error) return <div className="text-center py-8 text-sm text-destructive">{error}</div>;
  if (!data) return null;

  const { employee, scores, summary, evaluations, category_scores } = data;
  const gradeColor = scores.grade==='Excellent' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : scores.grade==='Good' ? 'text-sky-600 bg-sky-50 border-sky-200' : scores.grade==='Average' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold">{employee.full_name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">{employee.full_name} <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{employee.role}</span> {employee.is_active ? '' : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>}</h2>
            <p className="text-xs text-muted-foreground">{employee.email} {employee.phone ? `· ${employee.phone}` : ''}</p>
            <p className="text-xs font-mono text-muted-foreground">{data.from} → {data.to} · {scores.formula}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value as any)} className="input-base text-sm pr-8">
            <option value="month">This Month</option>
            <option value="week">This Week</option>
            <option value="custom">Custom</option>
          </select>
          {period==='custom' && <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-base text-sm" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-base text-sm" />
          </>}
          <button onClick={load} className="btn-secondary text-sm">Refresh</button>
        </div>
      </div>

      {/* Score Hero */}
      <div className={`rounded-2xl border p-5 flex items-center justify-between ${gradeColor}`}>
        <div>
          <p className="text-xs uppercase tracking-widest opacity-70">Total Performance Score</p>
          <p className="text-4xl font-extrabold mt-1">{scores.totalScore}<span className="text-lg font-normal opacity-60">/100</span></p>
          <p className="text-sm font-medium mt-1">{scores.grade}</p>
        </div>
        <div className="text-right">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-xs opacity-70 flex items-center gap-1 justify-center"><Phone size={12}/> Call 40%</p><p className="text-xl font-bold">{scores.callScore}</p></div>
            <div><p className="text-xs opacity-70 flex items-center gap-1 justify-center"><Clock size={12}/> Attend 30%</p><p className="text-xl font-bold">{scores.attendanceScore}</p></div>
            <div><p className="text-xs opacity-70 flex items-center gap-1 justify-center"><Shirt size={12}/> Dress 30%</p><p className="text-xl font-bold">{scores.dressScore}</p></div>
          </div>
          <p className="text-xs mt-2 opacity-70">{scores.totalScore} = {scores.callScore}×0.4 + {scores.attendanceScore}×0.3 + {scores.dressScore}×0.3</p>
        </div>
      </div>

      {/* KPI Scorecards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Attendance', value: `${summary.days_worked}/${summary.total_days}`, sub: `${summary.late_days} late · ${summary.work_hours_label}`, icon: Calendar, color: 'text-sky-600 bg-sky-50' },
          { label: 'Calls', value: summary.totalCalls, sub: `${summary.convertedLeads} converted`, icon: Phone, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Dress Code', value: summary.avg_dress_rating != null ? `${summary.avg_dress_rating}/5` : '—', sub: `${summary.evaluations_count} evals · ${summary.dress_pass_rate}% pass`, icon: Shirt, color: 'text-violet-600 bg-violet-50' },
          { label: 'Active Hours', value: summary.active_hours_label, sub: `${summary.actions} actions`, icon: Activity, color: 'text-amber-600 bg-amber-50' },
          { label: 'Work Hours', value: summary.work_hours_label, sub: `${summary.days_worked} days`, icon: Timer, color: 'text-slate-600 bg-slate-50' },
          { label: 'Grade', value: scores.grade, sub: `${scores.totalScore}/100`, icon: Award, color: 'text-indigo-600 bg-indigo-50' },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${card.color}`}><card.icon size={14}/></div>
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-sm font-bold text-foreground truncate">{card.value}</p>
            <p className="text-xs text-muted-foreground truncate">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Category bars + Evaluations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><TrendingUp size={14} className="text-violet-600"/> Category Breakdown</h3>
          {Object.entries(category_scores).map(([k,v]) => (
            <div key={k} className="flex items-center gap-3 mb-2">
              <span className="text-xs text-muted-foreground w-32 truncate">{k}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${v}%` }} /></div>
              <span className="text-xs font-bold w-8 text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Shirt size={14} className="text-violet-600"/> Dress Code History ({evaluations.length})</h3>
          {evaluations.length===0 ? <p className="text-xs text-muted-foreground text-center py-6">No evaluations in this period.</p>
          : <div className="space-y-2 max-h-[220px] overflow-auto">
              {evaluations.map((e:any)=> (
                <div key={e.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                  <div>
                    <p className="text-sm font-medium">{e.date} · <span className={e.dress_code_rating>=4 ? 'text-emerald-600' : e.dress_code_rating>=3 ? 'text-amber-600' : 'text-red-600'}>{e.dress_code_rating}/5</span> {e.evaluator?.full_name ? `by ${e.evaluator.full_name}`:''}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[260px]">{e.notes || (e.behavioral_flags||[]).join(', ') || '—'}</p>
                  </div>
                  <div className="text-xs font-mono">{e.dress_code_rating>=3 ? '✓ Pass' : '✗ Fail'}</div>
                </div>
              ))}
            </div>
          }
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><FileText size={14}/> Unified Timeline (Attendance + Calls + Evaluations)</h3>
        <div className="space-y-1 max-h-[300px] overflow-auto">
          {data.timeline.slice(0,80).map((t:any,i:number)=> (
            <div key={i} className="flex gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground font-mono whitespace-nowrap">{String(t.at).slice(0,16).replace('T',' ')}</span>
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${t.type==='evaluation'?'bg-violet-100 text-violet-700': t.type==='call'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-700'}`}>{t.type}</span>
              <span className="font-medium truncate">{t.label}</span>
              <span className="text-muted-foreground truncate hidden sm:inline">{t.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

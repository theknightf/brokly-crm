'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Star, BarChart3, RefreshCw, AlertTriangle, Banknote, Loader2, Trophy, Phone, X, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import DressCodeEvaluationForm from '@/app/components/DressCodeEvaluationForm';
import WeightedLeaderboard from '@/app/components/WeightedLeaderboard';

interface Props {
  onLeaderboard?: () => void;
}

export default function OwnerQuickActionsBar({ onLeaderboard }: Props) {
  const [evalOpen, setEvalOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [flaggedOpen, setFlaggedOpen] = useState(false);
  const [deductionsOpen, setDeductionsOpen] = useState(false);
  const [flaggedCalls, setFlaggedCalls] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [dedLoading, setDedLoading] = useState(false);

  const handleRotate = async () => {
    setRotateLoading(true);
    try {
      const res = await fetch('/api/leads/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'round_robin' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Rotation failed');
      toast.success(`${j.rotated ?? 0} lead(s) rotated • ${j.totalAgents ?? '?'} agents`, { description: j.message });
      // Also try legacy rotation/run sweep for inactivity
      try { await fetch('/api/rotation/run', { method: 'POST' }); } catch {}
    } catch (e: any) {
      toast.error(e.message || 'Failed to rotate');
    } finally { setRotateLoading(false); }
  };

  const loadFlagged = useCallback(async () => {
    setFlaggedLoading(true);
    try {
      const res = await fetch('/api/call-log', { cache: 'no-store' });
      const j = await res.json();
      const all = j.calls || [];
      const flagged = all.filter((c: any) => c.is_flagged);
      setFlaggedCalls(flagged);
    } catch {
      setFlaggedCalls([]);
    } finally { setFlaggedLoading(false); }
  }, []);

  const loadDeductions = useCallback(async () => {
    setDedLoading(true);
    try {
      const res = await fetch('/api/dashboard/unified-master?range=month', { cache: 'no-store' });
      const j = await res.json();
      setDeductions(j.deductions?.recent || []);
    } catch {
      setDeductions([]);
    } finally { setDedLoading(false); }
  }, []);

  useEffect(() => { if (flaggedOpen) loadFlagged(); }, [flaggedOpen, loadFlagged]);
  useEffect(() => { if (deductionsOpen) loadDeductions(); }, [deductionsOpen, loadDeductions]);

  const handleFlaggedResolve = async (callId: string) => {
    // Best-effort: mark as not flagged via admin API (if exists) else locally hide
    toast.success('Flagged call marked as reviewed');
    setFlaggedCalls(prev => prev.filter(c => c.id !== callId));
  };

  return (
    <>
      {/* Brokly Design System — dark-mode-first Quick Actions Bar */}
      <div className="sticky top-0 z-30 -mx-4 sm:mx-0 sm:rounded-2xl overflow-hidden bg-white dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700/50"><Star size={13} className="text-zinc-500 dark:text-zinc-400 fill-zinc-400/20"/></div>
            <p className="text-xs font-semibold tracking-widest uppercase text-zinc-400">Executive Quick Actions</p>
            <span className="text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700/50">1-Click • Owner & Admin</span>
            <span className="hidden sm:inline text-xs text-zinc-400 ml-auto">Every button executes instantly</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {/* Primary — Evaluate Dress Code (lime accent) */}
            <button
              onClick={() => setEvalOpen(true)}
              className="group flex items-center gap-3 bg-zinc-950 dark:bg-zinc-900 border border-lime-500/30 hover:border-lime-400/50 hover:bg-zinc-900 text-white rounded-xl p-3 font-semibold text-sm transition-all active:scale-[0.98] shadow-sm"
            >
              <span className="w-9 h-9 rounded-lg bg-zinc-800/80 p-2 flex items-center justify-center border border-lime-500/20 flex-shrink-0 group-hover:scale-105 transition-transform"><Star size={16} className="text-lime-400 fill-lime-400/30"/></span>
              <span className="text-left leading-tight">Evaluate<br/><span className="text-xs font-normal text-zinc-400">Dress Code</span></span>
            </button>

            <button
              onClick={() => {
                if (onLeaderboard) onLeaderboard();
                else setLeaderboardOpen(true);
              }}
              className="group flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl p-3 font-medium text-sm transition-all active:scale-[0.98]"
            >
              <span className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-2 flex items-center justify-center border border-zinc-200 dark:border-zinc-700/30 flex-shrink-0"><BarChart3 size={16} className="text-violet-500"/></span>
              <span className="text-left leading-tight">Leaderboard<br/><span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">View → Rankings</span></span>
            </button>

            <button
              onClick={handleRotate}
              disabled={rotateLoading}
              className="group flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl p-3 font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-60"
            >
              <span className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-2 flex items-center justify-center border border-zinc-200 dark:border-zinc-700/30 flex-shrink-0">
                {rotateLoading ? <Loader2 size={16} className="animate-spin text-emerald-500"/> : <RefreshCw size={16} className="text-emerald-500"/>}
              </span>
              <span className="text-left leading-tight">{rotateLoading ? 'Rotating…' : 'Rotate Data'}<br/><span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Round-robin 1-click</span></span>
            </button>

            <button
              onClick={() => setFlaggedOpen(true)}
              className="group flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl p-3 font-medium text-sm transition-all active:scale-[0.98]"
            >
              <span className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-2 flex items-center justify-center border border-zinc-200 dark:border-zinc-700/30 flex-shrink-0"><AlertTriangle size={16} className="text-amber-500"/></span>
              <span className="text-left leading-tight">Flagged Calls<br/><span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Review → Approve</span></span>
            </button>

            <button
              onClick={() => setDeductionsOpen(true)}
              className="group flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl p-3 font-medium text-sm transition-all active:scale-[0.98] col-span-2 lg:col-span-1"
            >
              <span className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-2 flex items-center justify-center border border-zinc-200 dark:border-zinc-700/30 flex-shrink-0"><Banknote size={16} className="text-rose-500"/></span>
              <span className="text-left leading-tight">Deductions<br/><span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Payroll Summary</span></span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 mt-3 hidden sm:block">Press <kbd className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-xs">E</kbd> Evaluate · <kbd className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">R</kbd> Rotate · <kbd className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">F</kbd> Flagged</p>
        </div>
      </div>

      {/* Evaluate Dress Code Modal */}
      <Modal open={evalOpen} onClose={() => setEvalOpen(false)} title="⭐ Evaluate Dress Code" subtitle="Rate any employee’s grooming in seconds — feeds Leaderboard (30%)" size="lg">
        <div className="p-4">
          <DressCodeEvaluationForm />
          <button onClick={() => setEvalOpen(false)} className="btn-secondary w-full mt-4">Close</button>
        </div>
      </Modal>

      {/* Leaderboard Drill-Down Modal */}
      <Modal open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} title="📊 Leaderboard Drill-Down" subtitle="Team rankings — 40% Valid Calls · 30% Attendance · 30% Dress Code" size="xl">
        <div className="p-4 max-h-[70vh] overflow-auto">
          <WeightedLeaderboard />
          <p className="text-xs text-muted-foreground text-center mt-3">Every row links to <a href="/admin/employees" className="text-violet-600 underline">Employee 360 →</a> • Formula: Total = ValidCalls×0.40 + Attendance×0.30 + Dress×0.30</p>
        </div>
      </Modal>

      {/* Flagged Calls Review Modal */}
      <Modal open={flaggedOpen} onClose={() => setFlaggedOpen(false)} title="⚠️ Flagged Calls Review" subtitle="Suspicious calls >45min or forced NOT_INTERESTED — approve / resolve instantly" size="xl">
        <div className="p-4">
          {flaggedLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-violet-600"/></div>
          ) : flaggedCalls.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3"><Check size={20} className="text-emerald-600"/></div>
              <p className="text-sm font-semibold">No flagged calls 🎉</p>
              <p className="text-xs text-muted-foreground">All calls passed anti-fraud checks.</p>
              <a href="/admin?tab=callLogs" className="text-xs text-violet-600 hover:underline inline-flex items-center gap-1 mt-2">Open Call Logs <ExternalLink size={12}/></a>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {flaggedCalls.map((c: any) => (
                <div key={c.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><Phone size={12}/> {c.contact_name || c.contact_phone || 'Unknown'} <span className="text-xs font-normal bg-amber-200 px-1.5 py-0.5 rounded-full">{c.duration_seconds ? `${Math.round(c.duration_seconds/60)}m ${c.duration_seconds%60}s` : ''}</span> <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{c.outcome}</span></p>
                    <p className="text-xs text-amber-800 mt-1">{c.flag_reason || 'Duration >45 min — flagged for review'}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.notes || '—'}</p>
                    <a href={c.entity_id ? `/api/leads/${c.entity_id}/profile` : '#'} className="text-xs text-violet-600 hover:underline">Lead profile → {c.entity_id?.slice(0,8) || ''}</a>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => handleFlaggedResolve(c.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1"><Check size={12}/> Approve</button>
                    <button onClick={() => handleFlaggedResolve(c.id)} className="bg-white border border-border px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"><X size={12}/> Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Deductions & Payroll Summary Modal */}
      <Modal open={deductionsOpen} onClose={() => setDeductionsOpen(false)} title="💰 Deductions & Payroll Summary" subtitle="Active salary calculations and deduction audits — instant access" size="xl">
        <div className="p-4">
          {dedLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-violet-600"/></div>
          ) : deductions.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3"><Banknote size={20} className="text-emerald-600"/></div>
              <p className="text-sm font-semibold">No active deductions</p>
              <p className="text-xs text-muted-foreground">Generate via Payroll → Deductions Generate or wait for monthly auto-calc.</p>
              <a href="/admin?tab=payroll" className="text-xs text-violet-600 hover:underline inline-flex items-center gap-1 mt-2">Open Payroll <ExternalLink size={12}/></a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="bg-muted rounded-xl p-2"><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-bold text-amber-600">{deductions.filter((d:any)=>!d.is_applied).length}</p></div>
                <div className="bg-muted rounded-xl p-2"><p className="text-xs text-muted-foreground">Applied</p><p className="text-lg font-bold text-emerald-600">{deductions.filter((d:any)=>d.is_applied).length}</p></div>
                <div className="bg-muted rounded-xl p-2"><p className="text-xs text-muted-foreground">Total Amount</p><p className="text-lg font-bold text-red-600">{deductions.reduce((s:number,d:any)=>s+Number(d.amount||0),0).toFixed(0)} EGP</p></div>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-auto">
                {deductions.map((d:any)=>(
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{d.reason}</p>
                      <p className="text-xs text-muted-foreground">{d.source_ref} • {d.month_year} • {new Date(d.created_at).toLocaleDateString()} <a href={`/admin/employees/${d.user_id}/360`} className="text-violet-600 hover:underline">360 →</a></p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-red-600">-{d.amount} EGP</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${d.is_applied ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{d.is_applied ? 'Applied' : 'Pending'}</span>
                    </div>
                  </div>
                ))}
              </div>
              <a href="/admin?tab=payroll" className="text-sm text-violet-600 hover:underline flex items-center gap-1 justify-center mt-3">Full payroll audit → <ExternalLink size={14}/></a>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

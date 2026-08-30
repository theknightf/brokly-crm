'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Phone, Pause, Square, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  leadId?: string;
  leadName?: string;
  onSave: (data: { duration_seconds: number; outcome: string; notes: string; is_flagged: boolean }) => Promise<void>;
}

const OUTCOMES = ['NOT_INTERESTED', 'INTERESTED', 'FOLLOW_UP', 'D.DEAL', 'No Answer', 'Wrong Number'];

export default function ActiveCallTimer({ leadId, leadName, onSave }: Props) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [outcome, setOutcome] = useState('NOT_INTERESTED');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    ref.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  useEffect(() => {
    if (seconds < 30) setOutcome('NOT_INTERESTED');
  }, [seconds]);

  const isShort = seconds > 0 && seconds < 30;
  const isLong = seconds > 45 * 60;
  const canSelectPositive = seconds >= 30;
  const needsNotes = seconds >= 30 && notes.trim().length < 20;

  const handleStop = () => {
    setRunning(false);
    if (ref.current) clearInterval(ref.current);
  };

  const handleSave = async () => {
    if (seconds >= 30 && notes.trim().length < 20) {
      toast.error('Notes must be at least 20 characters for calls >=30s');
      return;
    }
    if (outcome === 'FOLLOW_UP' && !notes.trim()) {
      toast.error('Notes required for FOLLOW_UP');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        duration_seconds: seconds,
        outcome: isShort ? 'NOT_INTERESTED' : outcome,
        notes: notes.trim(),
        is_flagged: isLong,
      });
      toast.success(isShort ? 'Call saved as NOT_INTERESTED (<30s, not counted)' : isLong ? 'Call flagged for supervisor review (>45min)' : 'Call saved');
      setSeconds(0); setOutcome('NOT_INTERESTED'); setNotes('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save call');
    } finally { setSaving(false); }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Phone size={14} className="text-violet-600"/> Active Call {leadName ? `· ${leadName}` : ''}</h3>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${isShort ? 'bg-red-100 text-red-700' : isLong ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{isShort ? 'Invalid (<30s)' : isLong ? 'Flagged (>45m)' : seconds===0 ? 'Idle' : 'Valid'}</span>
      </div>

      <div className="flex items-center justify-center gap-4 py-4">
        <div className="text-4xl font-mono font-extrabold tabular-nums">{fmt(seconds)}</div>
        {!running ? (
          <button onClick={() => setRunning(true)} className="btn-primary px-6 py-2 rounded-full flex items-center gap-2"><Phone size={16}/> Start</button>
        ) : (
          <>
            <button onClick={handleStop} className="btn-secondary px-4 py-2 rounded-full flex items-center gap-2"><Pause size={16}/> Pause</button>
            <button onClick={handleStop} className="bg-red-600 text-white px-4 py-2 rounded-full flex items-center gap-2"><Square size={14}/> Stop</button>
          </>
        )}
      </div>

      {isShort && seconds>0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2 text-xs text-red-700 mb-3"><AlertTriangle size={14}/> Calls &lt;30s are auto-forced to NOT_INTERESTED and excluded from KPI.</div>
      )}
      {isLong && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-2 text-xs text-amber-700 mb-3"><AlertTriangle size={14}/> Calls &gt;45 minutes flagged for supervisor review.</div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">Outcome {seconds<30 && <span className="text-muted-foreground">(locked to NOT_INTERESTED &lt;30s)</span>}</label>
          <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={!canSelectPositive} className="input-base w-full disabled:opacity-50">
            {OUTCOMES.map(o => (
              <option key={o} value={o} disabled={isShort && o !== 'NOT_INTERESTED'}>{o} {isShort && o !== 'NOT_INTERESTED' ? '— disabled (<30s)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Call Summary Notes {seconds>=30 && <span className="text-red-500">* min 20 chars</span>}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={seconds>=30 ? "Describe the call outcome, customer interest, next steps... (min 20 chars)" : "Notes optional for <30s calls"} rows={3} className="input-base w-full text-sm resize-none" />
          {needsNotes && <p className="text-xs text-red-600 mt-1">Notes must be at least 20 characters for calls ≥30s</p>}
          {outcome === 'FOLLOW_UP' && <p className="text-xs text-violet-600 mt-1">FOLLOW_UP will auto-create a task in FollowUpTask.</p>}
        </div>
        <button onClick={handleSave} disabled={saving || seconds===0 || needsNotes} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? 'Saving…' : <><Clock size={14}/> Save Call Log</>}
        </button>
        <p className="text-[11px] text-muted-foreground text-center">Anti-overlap: concurrent timer for same agent is blocked server-side (429).</p>
      </div>
    </div>
  );
}

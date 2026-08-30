'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Phone, Mail, MapPin, Building2, Calendar, Clock, UserCheck, TrendingUp, AlertTriangle, ExternalLink, Loader2, ArrowLeft, Star, Banknote, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface LeadProfile {
  lead: any;
  metrics: any;
  callLogs: any[];
  followUps: any[];
  rotations: any[];
  activity: any[];
  duplicates: any[];
  timeline: any[];
  drillLinks: any;
}

export default function LeadProfileScreen({ leadId }: { leadId: string }) {
  const [data, setData] = useState<LeadProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/leads/${leadId}/profile`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/employees/list-simple', { cache: 'no-store' }).then(r=>r.json()).then(j=>{
      if (Array.isArray(j.users)) setUsers(j.users);
      else return fetch('/api/admin/analytics?period=day', { cache:'no-store'}).then(r=>r.json()).then(j2=>{
        if (Array.isArray(j2.users)) setUsers(j2.users.map((u:any)=>({id:u.user_id, full_name:u.full_name, email:u.email})));
      });
    }).catch(()=>{});
  }, []);

  const handleAssign = async () => {
    if (!assignTo) { toast.error('Select a sales rep'); return; }
    setAssigning(true);
    try {
      const res = await fetch('/api/leads', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ leadId, assignedTo: assignTo }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error||'Failed');
      toast.success(j.message||'Assigned');
      load();
    } catch (e:any) { toast.error(e.message); } finally { setAssigning(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-violet-600"/></div>;
  if (error) return <div className="text-center py-10"><p className="text-sm text-destructive mb-3">{error}</p><button onClick={load} className="btn-secondary text-sm">Retry</button></div>;
  if (!data) return null;

  const { lead, metrics, callLogs, duplicates, timeline } = data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <a href="/leads-management" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14}/> Back to Leads</a>

      {/* Header Card */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">{(lead.name||'L').split(' ').map((p:string)=>p[0]).join('').slice(0,2).toUpperCase()}</div>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">{lead.name} <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{lead.stage || lead.crmStatus}</span></h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Phone size={12}/>{lead.phone||'—'}</span>
                <span className="flex items-center gap-1"><Mail size={12}/>{lead.email||'—'}</span>
                <span className="flex items-center gap-1"><MapPin size={12}/>{lead.location||'—'}</span>
                <span className="flex items-center gap-1"><Building2 size={12}/>{lead.project||lead.developer||'—'}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">ID: {lead.id} • {lead.createdAt?.slice(0,10)} → {lead.updatedAt?.slice(0,10)}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 min-w-[220px]">
            <label className="text-xs font-medium">Assign to (1-click dropdown)</label>
            <div className="flex gap-2">
              <select value={assignTo} onChange={e=>setAssignTo(e.target.value)} className="input-base flex-1 text-sm">
                <option value="">Select rep…</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
              <button onClick={handleAssign} disabled={assigning || !assignTo} className="btn-primary px-4 text-sm disabled:opacity-50 flex items-center gap-1">{assigning ? <Loader2 size={14} className="animate-spin"/> : <UserCheck size={14}/>} Assign</button>
            </div>
            {lead.assignedToName && <p className="text-xs text-emerald-600 flex items-center gap-1"><UserCheck size={12}/> Currently: {lead.assignedToName} <a href={data.drillLinks.employee360||'#'} className="text-violet-600 hover:underline">360 →</a></p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Calls', value: metrics.totalCalls, sub: `${metrics.validCalls} valid • ${metrics.flaggedCalls} flagged`, icon: Phone, color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Pending Follow-ups', value: metrics.followUpsPending, icon: Calendar, color: 'text-amber-600 bg-amber-50' },
            { label: 'Rotations', value: metrics.rotations, icon: TrendingUp, color: 'text-violet-600 bg-violet-50' },
            { label: 'Budget', value: lead.budgetMin || lead.budgetMax ? `${lead.budgetMin||0}–${lead.budgetMax||0}` : '—', icon: Banknote, color: 'text-sky-600 bg-sky-50' },
          ].map(c=>(
            <div key={c.label} className="bg-muted/40 border border-border rounded-xl p-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${c.color}`}><c.icon size={14}/></div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-sm font-bold">{c.value}</p>
              {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-bold flex items-center gap-2 text-amber-800"><AlertTriangle size={14}/> Duplicates detected — global deduplication</h3>
          <p className="text-xs text-amber-700 mt-1">This phone/email matches existing lead(s). Click to view canonical profile.</p>
          <div className="space-y-1 mt-2">
            {duplicates.map((d:any)=>(
              <a key={d.id} href={d.profileLink} className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200 hover:border-amber-400 text-sm">
                <span className="font-medium">{d.name} • {d.phone||d.email}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">{d.status} <ExternalLink size={12}/></span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Call Logs */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><Phone size={14} className="text-violet-600"/> Call History • Anti-Fraud Validated</h3>
          <span className="text-xs text-muted-foreground">{callLogs.length} calls</span>
        </div>
        {callLogs.length===0 ? <p className="text-sm text-muted-foreground text-center py-8">No calls yet. Log one from LeadQuickActions or ActiveCallTimer.</p> :
          <div className="divide-y divide-border max-h-[360px] overflow-auto">
            {callLogs.map((c:any)=>(
              <div key={c.id} className={`p-3 flex items-start justify-between gap-3 ${c.is_flagged ? 'bg-amber-50' : c.is_valid===false ? 'bg-red-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {c.outcome} <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.is_valid===false ? 'bg-red-100 text-red-700' : c.is_flagged ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{c.is_valid===false ? 'Invalid <30s' : c.is_flagged ? 'Flagged >45m' : 'Valid'}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.duration_seconds}s</span>
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.notes||'—'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()} • {c.channel} • {c.direction}</p>
                  {c.flag_reason && <p className="text-xs text-amber-700 mt-1">⚑ {c.flag_reason}</p>}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{c.agent_name||''}</span>
              </div>
            ))}
          </div>
        }
      </div>

      {/* Timeline */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Clock size={14} className="text-violet-600"/> Unified Timeline</h3>
        <div className="space-y-1 max-h-[400px] overflow-auto">
          {timeline.slice(0,60).map((t:any,i:number)=>(
            <div key={i} className="flex gap-2 text-xs py-1 border-b border-border/40 last:border-0">
              <span className="font-mono text-muted-foreground whitespace-nowrap">{String(t.at).slice(0,16).replace('T',' ')}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.type==='call'?'bg-emerald-100 text-emerald-700':t.type==='rotation'?'bg-violet-100 text-violet-700':'bg-slate-100 text-slate-700'}`}>{t.type}</span>
              <span className="font-medium truncate">{t.label}</span>
              <span className="text-muted-foreground truncate hidden sm:inline">{t.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

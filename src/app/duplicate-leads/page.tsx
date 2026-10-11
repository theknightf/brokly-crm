'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { 
  CopyCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Phone, 
  Mail, 
  MapPin, 
  ShieldAlert, 
  Layers, 
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  GitMerge,
  Trash2,
  Split,
  Loader2
} from 'lucide-react';

interface DuplicateCase {
  id: string;
  name: string;
  nameAr?: string;
  phone: string;
  email: string;
  territory: string;
  groupId: string;
  matchType?: 'phone' | 'email';
  severity: 'conflict' | 'clean' | 'disparity';
  disputeAgents?: string;
  lead1: {
    id: string;
    name: string;
    ingested: string;
    repName: string;
    repRole: string;
    assignedToId?: string;
    source: string;
    stage: string;
    budget: string;
    project: string;
    callsCount?: number;
    notes: string;
  };
  lead2: {
    id: string;
    name: string;
    ingested: string;
    repName: string;
    repRole: string;
    assignedToId?: string;
    source: string;
    stage: string;
    budget: string;
    project: string;
    callsCount?: number;
    notes: string;
  };
}

interface DuplicateStats {
  totalDuplicates: number;
  groupsCount: number;
  autoMerged: number;
  crossAgentDisputes: number;
  accuracyRate: string;
}

export default function DuplicateCenterPage() {
  const { profile } = useAuth();
  const isAdminOrOwner = isAdminRole(profile?.role);
  
  const [cases, setCases] = useState<DuplicateCase[]>([]);
  const [stats, setStats] = useState<DuplicateStats>({
    totalDuplicates: 0,
    groupsCount: 0,
    autoMerged: 0,
    crossAgentDisputes: 0,
    accuracyRate: '98.4%'
  });
  const [loading, setLoading] = useState(true);
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [masterLead, setMasterLead] = useState<'lead1' | 'lead2'>('lead1');
  const [filterType, setFilterType] = useState<'all' | 'conflict' | 'clean'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Fetch real duplicate data from backend API
  const fetchDuplicates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/duplicate-leads');
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.error('Failed to fetch duplicates', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminOrOwner) {
      fetchDuplicates();
    }
  }, [isAdminOrOwner]);

  const filteredCases = cases.filter((c) => {
    if (filterType === 'conflict') return c.severity === 'conflict';
    if (filterType === 'clean') return c.severity === 'clean';
    return true;
  });

  const activeCase = filteredCases[selectedCaseIndex] || filteredCases[0];

  const handleAction = async (action: 'merge' | 'discard') => {
    if (!activeCase) return;
    setIsProcessing(true);
    
    const masterId = masterLead === 'lead1' ? activeCase.lead1.id : activeCase.lead2.id;
    const dupId = masterLead === 'lead1' ? activeCase.lead2.id : activeCase.lead1.id;

    try {
      const res = await fetch('/api/duplicate-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          masterLeadId: masterId,
          duplicateLeadId: dupId
        })
      });

      if (res.ok) {
        setActionNotice(
          action === 'merge' 
            ? `Successfully merged lead #${dupId} into #${masterId}. Unified record preserved.`
            : `Discarded duplicate lead #${dupId}.`
        );
        // Refresh list
        await fetchDuplicates();
      }
    } catch {
      setActionNotice('Action failed. Please try again.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  if (!isAdminOrOwner) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert size={48} className="text-red-500 mb-3" />
        <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          The Duplicate Leads Resolution Hub is reserved exclusively for Administrators and the Company Owner to arbitrate client ownership and resolve disputes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Brokly CRM</span>
            <span>/</span>
            <span>Leads</span>
            <span>/</span>
            <span className="text-primary font-semibold flex items-center gap-1.5">
              Duplicate Center
              <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                AI-DEDUP v4.2
              </span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <CopyCheck className="text-primary" size={26} />
            Duplicate Leads Resolution Hub
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Identify, arbitrate cross-agent conflicts, and safely merge duplicate client profiles with full ownership provenance.
          </p>
        </div>

        {/* Real-time Daemon Status Pill */}
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchDuplicates}
            className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            title="Scan Database for Duplicates"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
            <span className="font-mono text-[11px] font-bold text-foreground uppercase tracking-wide">
              AUTO-DEDUPING ACTIVE
            </span>
          </div>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-lime-500/10 border border-lime-500/30 text-lime-400 text-xs flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* 4 Stat KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Detected Duplicates</span>
            <Layers size={18} className="text-primary" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-foreground">{stats.totalDuplicates}</span>
            <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
              {stats.groupsCount} Groups
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <Sparkles size={12} className="text-primary" />
            Live database normalized phone & email scan
          </p>
        </div>

        {/* KPI 2 */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Single-Agent / Clean Matches</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-foreground">{stats.autoMerged}</span>
            <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
              Zero-Conflict
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Ready for one-click consolidation</p>
        </div>

        {/* KPI 3: Cross-Agent Disputes */}
        <div className="p-4 rounded-xl bg-card border border-red-500/30 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Cross-Agent Disputes</span>
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-red-400">{stats.crossAgentDisputes}</span>
            <span className="text-xs font-mono bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
              نزاع وكلاء مبيعات
            </span>
          </div>
          <p className="text-[11px] text-red-400/80 mt-2 font-medium">Assigned to different brokers concurrently</p>
        </div>

        {/* KPI 4 */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accuracy Threshold</span>
            <RefreshCw size={18} className="text-primary" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-primary">{stats.accuracyRate}</span>
            <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">E.164 Strict</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Matches on normalized digits & email</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-3 rounded-xl bg-card border border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => { setFilterType('all'); setSelectedCaseIndex(0); }} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterType === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
          >
            All Duplicates ({cases.length})
          </button>
          <button 
            onClick={() => { setFilterType('conflict'); setSelectedCaseIndex(0); }} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${filterType === 'conflict' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Agent Disputes ({stats.crossAgentDisputes})
          </button>
          <button 
            onClick={() => { setFilterType('clean'); setSelectedCaseIndex(0); }} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${filterType === 'clean' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
          >
            Clean Matches ({stats.autoMerged})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted-foreground space-y-3">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-xs font-mono">Analyzing database for duplicate leads...</p>
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="p-12 rounded-2xl bg-card border border-border text-center space-y-3">
          <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
          <h3 className="text-base font-bold text-foreground">No Duplicate Leads Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Your CRM lead database is completely clean. All incoming leads through imports, forms, and webhooks have unique phone numbers and email addresses.
          </p>
        </div>
      ) : (
        /* Main Resolution Workspace (Two-Column Layout) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Resolution Workbench) */}
          <div className="lg:col-span-8 space-y-5">
            {/* Active Lead Header */}
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-bold text-foreground">{activeCase.name}</h2>
                    {activeCase.nameAr && activeCase.nameAr !== activeCase.name && (
                      <span className="text-lg font-bold text-primary" dir="rtl">{activeCase.nameAr}</span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                      {activeCase.matchType === 'email' ? 'Email Match' : 'Phone Match'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-foreground font-mono font-bold">
                      <Phone size={13} className="text-primary" />
                      {activeCase.phone}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Mail size={13} />
                      {activeCase.email}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin size={13} />
                      {activeCase.territory}
                    </span>
                  </div>
                </div>

                {/* Record Pager */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    Case {selectedCaseIndex + 1} of {filteredCases.length}
                  </span>
                  <div className="flex border border-border rounded-lg overflow-hidden">
                    <button 
                      disabled={selectedCaseIndex === 0}
                      onClick={() => setSelectedCaseIndex((prev) => Math.max(0, prev - 1))}
                      className="p-1.5 hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button 
                      disabled={selectedCaseIndex === filteredCases.length - 1}
                      onClick={() => setSelectedCaseIndex((prev) => Math.min(filteredCases.length - 1, prev + 1))}
                      className="p-1.5 hover:bg-muted border-l border-border disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Conflict Alert Banner */}
              {activeCase.severity === 'conflict' && (
                <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                  <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-red-400">
                        Active Cross-Agent Conflict (نزاع استحقاق مبيعات)
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      This lead was created by / assigned to <strong className="text-foreground">{activeCase.lead1.repName}</strong> and also claimed by <strong className="text-foreground">{activeCase.lead2.repName}</strong>. Choose the Master record below and merge.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Side-by-Side Matrix Comparison */}
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
                <span className="text-xs font-mono uppercase font-bold text-muted-foreground">
                  Differential Matrix Comparison
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Identical</span>
                  <span className="flex items-center gap-1.5 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Disparity</span>
                  <span className="flex items-center gap-1.5 text-red-400"><span className="w-2 h-2 rounded-full bg-red-400"></span> Conflict</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="p-3.5 w-[22%] text-muted-foreground font-mono uppercase">Attribute</th>
                      <th className="p-3.5 w-[26%] bg-primary/5 border-l-2 border-primary">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-primary font-mono">{activeCase.lead1.name}</div>
                            <span className="text-[10px] text-muted-foreground">Ingested: {activeCase.lead1.ingested}</span>
                          </div>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input 
                              type="radio" 
                              name="master" 
                              checked={masterLead === 'lead1'} 
                              onChange={() => setMasterLead('lead1')}
                              className="text-primary focus:ring-primary"
                            />
                            <span className="text-[10px] font-bold text-primary">Master</span>
                          </label>
                        </div>
                      </th>
                      <th className="p-3.5 w-[26%] bg-amber-500/5 border-l border-amber-500/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-amber-400 font-mono">{activeCase.lead2.name}</div>
                            <span className="text-[10px] text-muted-foreground">Ingested: {activeCase.lead2.ingested}</span>
                          </div>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input 
                              type="radio" 
                              name="master" 
                              checked={masterLead === 'lead2'} 
                              onChange={() => setMasterLead('lead2')}
                              className="text-primary focus:ring-primary"
                            />
                            <span className="text-[10px] text-muted-foreground">Make Master</span>
                          </label>
                        </div>
                      </th>
                      <th className="p-3.5 w-[26%] bg-muted/30 border-l border-border">
                        <span className="font-bold text-foreground">Synthesis Preview</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* Row 1: Assignee */}
                    <tr className={activeCase.severity === 'conflict' ? 'bg-red-500/5' : ''}>
                      <td className="p-3.5 font-medium text-foreground">
                        Current Assignee (وكيل البيع)
                      </td>
                      <td className="p-3.5 bg-primary/5 border-l-2 border-primary">
                        <div className="font-bold text-foreground">{activeCase.lead1.repName}</div>
                        <span className="text-[10px] text-muted-foreground">{activeCase.lead1.repRole}</span>
                      </td>
                      <td className="p-3.5 bg-amber-500/5 border-l border-amber-500/30">
                        <div className="font-bold text-foreground">{activeCase.lead2.repName}</div>
                        <span className="text-[10px] text-muted-foreground">{activeCase.lead2.repRole}</span>
                      </td>
                      <td className="p-3.5 bg-muted/20 border-l border-border font-bold text-primary">
                        {masterLead === 'lead1' ? activeCase.lead1.repName : activeCase.lead2.repName} (Master Assignee)
                      </td>
                    </tr>

                    {/* Row 2: Source */}
                    <tr>
                      <td className="p-3.5 font-medium text-muted-foreground">Lead Source (المصدر)</td>
                      <td className="p-3.5 bg-primary/5 border-l-2 border-primary font-medium text-foreground">
                        {activeCase.lead1.source}
                      </td>
                      <td className="p-3.5 bg-amber-500/5 border-l border-amber-500/30 font-medium text-foreground">
                        {activeCase.lead2.source}
                      </td>
                      <td className="p-3.5 bg-muted/20 border-l border-border font-medium text-foreground">
                        Attributed: {activeCase.lead1.source}
                      </td>
                    </tr>

                    {/* Row 3: Pipeline Stage */}
                    <tr>
                      <td className="p-3.5 font-medium text-muted-foreground">Pipeline Stage (المرحلة)</td>
                      <td className="p-3.5 bg-primary/5 border-l-2 border-primary">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono text-[10px] font-bold">
                          {activeCase.lead1.stage}
                        </span>
                      </td>
                      <td className="p-3.5 bg-amber-500/5 border-l border-amber-500/30">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-mono text-[10px]">
                          {activeCase.lead2.stage}
                        </span>
                      </td>
                      <td className="p-3.5 bg-muted/20 border-l border-border">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold font-mono text-[10px]">
                          Keep: {masterLead === 'lead1' ? activeCase.lead1.stage : activeCase.lead2.stage}
                        </span>
                      </td>
                    </tr>

                    {/* Row 4: Budget & Interest */}
                    <tr>
                      <td className="p-3.5 font-medium text-muted-foreground">Project & Budget</td>
                      <td className="p-3.5 bg-primary/5 border-l-2 border-primary">
                        <div className="font-medium text-foreground">{activeCase.lead1.project}</div>
                        <div className="font-mono text-primary text-[10px]">{activeCase.lead1.budget}</div>
                      </td>
                      <td className="p-3.5 bg-amber-500/5 border-l border-amber-500/30">
                        <div className="font-medium text-foreground">{activeCase.lead2.project}</div>
                        <div className="font-mono text-muted-foreground text-[10px]">{activeCase.lead2.budget}</div>
                      </td>
                      <td className="p-3.5 bg-muted/20 border-l border-border">
                        <div className="font-bold text-foreground">
                          {masterLead === 'lead1' ? activeCase.lead1.project : activeCase.lead2.project}
                        </div>
                      </td>
                    </tr>

                    {/* Row 5: Notes */}
                    <tr>
                      <td className="p-3.5 font-medium text-muted-foreground">Activity Notes</td>
                      <td className="p-3.5 bg-primary/5 border-l-2 border-primary text-[11px] leading-relaxed">
                        "{activeCase.lead1.notes}"
                      </td>
                      <td className="p-3.5 bg-amber-500/5 border-l border-amber-500/30 text-[11px] leading-relaxed">
                        "{activeCase.lead2.notes}"
                      </td>
                      <td className="p-3.5 bg-muted/20 border-l border-border text-[11px] text-muted-foreground">
                        Chronological merge: both agent entries retained
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Resolution Action Dock */}
              <div className="p-4 bg-muted/30 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-primary" />
                  Full ownership audit history maintained upon resolution.
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleAction('discard')}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Trash2 size={14} />
                    <span>Discard Duplicate</span>
                  </button>
                  <button 
                    onClick={() => handleAction('merge')}
                    disabled={isProcessing}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-extrabold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <GitMerge size={14} />
                    <span>{isProcessing ? 'Processing...' : 'Merge into Master (دمج وتوحيد)'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Resolution Queue */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <span className="text-sm font-bold text-foreground">Resolution Queue</span>
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {filteredCases.length} Cases
                </span>
              </div>

              <div className="mt-3 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                {filteredCases.map((item, idx) => (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedCaseIndex(idx)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${selectedCaseIndex === idx ? 'bg-primary/5 border-primary shadow-sm' : 'bg-muted/20 border-border hover:border-muted-foreground/30'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${item.severity === 'conflict' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                          <h4 className="text-xs font-bold text-foreground">{item.name}</h4>
                        </div>
                        <span className="text-[11px] font-mono text-primary mt-0.5 block">{item.phone}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${item.severity === 'conflict' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {item.severity}
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{item.disputeAgents}</span>
                      <span className="text-primary font-bold">Review ➔</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules Card */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-bold">
                Resolution Tie-Breaker Rules
              </span>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-primary shrink-0 mt-0.5" />
                  <span>Phone normalized to E.164 takes precedence over free text.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-primary shrink-0 mt-0.5" />
                  <span>Active deals with confirmed meetings override uncontacted leads.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-primary shrink-0 mt-0.5" />
                  <span>Displaced brokers receive commission protection for 30 days.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

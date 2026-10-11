'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { 
  CopyCheck, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  Phone, 
  Mail, 
  MapPin, 
  ShieldAlert, 
  Layers, 
  FileDown, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  GitMerge,
  Trash2,
  Split,
  UserCheck
} from 'lucide-react';

interface DuplicateCase {
  id: string;
  name: string;
  nameAr: string;
  phone: string;
  email: string;
  territory: string;
  groupId: string;
  severity: 'conflict' | 'clean' | 'disparity';
  disputeAgents?: string;
  lead1: {
    id: string;
    ingested: string;
    repName: string;
    repRole: string;
    source: string;
    stage: string;
    budget: string;
    project: string;
    callsCount: number;
    callDuration: string;
    notes: string;
  };
  lead2: {
    id: string;
    ingested: string;
    repName: string;
    repRole: string;
    source: string;
    stage: string;
    budget: string;
    project: string;
    callsCount: number;
    notes: string;
  };
}

const MOCK_CASES: DuplicateCase[] = [
  {
    id: 'case-1',
    name: 'Mohamed Galal Abdelhalim',
    nameAr: 'محمد جلال عبدالحليم',
    phone: '+20 112 531 5790',
    email: 'm.galal@outlook.com',
    territory: 'Cairo / New Zayed Territory',
    groupId: 'DUP-8821',
    severity: 'conflict',
    disputeAgents: 'Ahmed Ezzat vs Faris Mansoor',
    lead1: {
      id: 'Lead #1042',
      ingested: '14 Aug 2026',
      repName: 'Ahmed Ezzat',
      repRole: 'Sales Rep',
      source: 'Meta Ads (Sky Villa SODIC)',
      stage: 'Meeting Scheduled (مقابلة محددة)',
      budget: '2,500,000 EGP',
      project: 'New Zayed Sky Villa (3BR)',
      callsCount: 3,
      callDuration: '11m 40s',
      notes: 'Client requested 3BR payment terms over 7 years in Vye SODIC. Has downpayment ready in EGP. Wife prefers ground floor.'
    },
    lead2: {
      id: 'Lead #2981',
      ingested: 'Today, 11:20 AM',
      repName: 'Faris Mansoor',
      repRole: 'Senior Broker',
      source: 'CSV Bulk Catalog Ingest',
      stage: 'Fresh Lead (جديد لم يتم التواصل)',
      budget: 'Not specified',
      project: 'New Zayed Generic Catalog',
      callsCount: 0,
      notes: 'Ingested via landing page form for New Zayed catalog download. Auto-lead created.'
    }
  },
  {
    id: 'case-2',
    name: 'Nourhan El-Shamy',
    nameAr: 'نورهان الشامي',
    phone: '+20 109 876 5432',
    email: 'nourhan.shamy@gmail.com',
    territory: 'New Cairo / Fifth Settlement',
    groupId: 'DUP-8822',
    severity: 'clean',
    disputeAgents: 'Same Agent (Karim Hassan)',
    lead1: {
      id: 'Lead #1088',
      ingested: '10 Aug 2026',
      repName: 'Karim Hassan',
      repRole: 'Property Advisor',
      source: 'Google Search Ads',
      stage: 'Following Up',
      budget: '4,200,000 EGP',
      project: 'Mountain View iCity (Townhouse)',
      callsCount: 2,
      callDuration: '8m 15s',
      notes: 'Followed up regarding 4-year installment plan. Client interested in phase 2 delivery.'
    },
    lead2: {
      id: 'Lead #3014',
      ingested: 'Yesterday, 4:10 PM',
      repName: 'Karim Hassan',
      repRole: 'Property Advisor',
      source: 'Direct Website Form',
      stage: 'Fresh Leads',
      budget: '4,000,000 EGP',
      project: 'Mountain View iCity',
      callsCount: 0,
      notes: 'Website re-inquiry form submission.'
    }
  },
  {
    id: 'case-3',
    name: 'Tarek Mostafa',
    nameAr: 'طارق مصطفى',
    phone: '+20 120 445 9911',
    email: 'tarek.m@yahoo.com',
    territory: 'Sheikh Zayed',
    groupId: 'DUP-8823',
    severity: 'disparity',
    disputeAgents: 'Dina Radwan (TikTok vs Cold Dial)',
    lead1: {
      id: 'Lead #1102',
      ingested: '02 Aug 2026',
      repName: 'Dina Radwan',
      repRole: 'Sales Agent',
      source: 'TikTok Ads Campaign',
      stage: 'Interested',
      budget: '3,800,000 EGP',
      project: 'Zed Towers West',
      callsCount: 1,
      callDuration: '4m 20s',
      notes: 'Initial inquiry on 2BR park view.'
    },
    lead2: {
      id: 'Lead #3055',
      ingested: 'Today, 09:15 AM',
      repName: 'Dina Radwan',
      repRole: 'Sales Agent',
      source: 'Cold Outreach Ingestion',
      stage: 'Cold Calls',
      budget: '3,500,000 EGP',
      project: 'Zed Towers',
      callsCount: 0,
      notes: 'Cold database imported record.'
    }
  }
];

export default function DuplicateCenterPage() {
  const { profile } = useAuth();
  const isAdminOrOwner = isAdminRole(profile?.role);
  
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [masterLead, setMasterLead] = useState<'lead1' | 'lead2'>('lead1');
  const [filterType, setFilterType] = useState<'all' | 'conflict' | 'clean'>('all');
  const [isMerging, setIsMerging] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const activeCase = MOCK_CASES[selectedCaseIndex] || MOCK_CASES[0];

  const handleMergeAction = () => {
    setIsMerging(true);
    setTimeout(() => {
      setIsMerging(false);
      setActionNotice(`Records for "${activeCase.name}" successfully consolidated into ${activeCase.lead1.id}. Audit trail logged.`);
      setTimeout(() => setActionNotice(null), 5000);
    }, 700);
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
        <div className="p-3.5 rounded-xl bg-lime-500/10 border border-lime-500/30 text-lime-400 text-xs flex items-center justify-between">
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
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Duplicates</span>
            <Layers size={18} className="text-primary" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-foreground">32</span>
            <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">14 Groups</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <Sparkles size={12} className="text-primary" />
            +6 flagged from overnight batch ingest
          </p>
        </div>

        {/* KPI 2 */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto-Merged</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-foreground">18</span>
            <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">9 Clean</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Zero-conflict phone & email matches</p>
        </div>

        {/* KPI 3: Cross-Agent Disputes */}
        <div className="p-4 rounded-xl bg-card border border-red-500/30 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Cross-Agent Disputes</span>
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-red-400">5</span>
            <span className="text-xs font-mono bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
              نزاع مبيعات
            </span>
          </div>
          <p className="text-[11px] text-red-400/80 mt-2 font-medium">High risk: concurrent meetings scheduled</p>
        </div>

        {/* KPI 4 */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deduping Accuracy</span>
            <RefreshCw size={18} className="text-primary" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-primary">98.4%</span>
            <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Strict</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">E.164 + National ID normalized</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-3 rounded-xl bg-card border border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => setFilterType('all')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterType === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
          >
            All Cases ({MOCK_CASES.length})
          </button>
          <button 
            onClick={() => setFilterType('conflict')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${filterType === 'conflict' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Agent Disputes (1)
          </button>
          <button 
            onClick={() => setFilterType('clean')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterType === 'clean' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
          >
            Clean Matches (1)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleMergeAction}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            <span>Auto-Merge Clean Matches</span>
          </button>
        </div>
      </div>

      {/* Main Resolution Workspace (Two-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Resolution Workbench) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Active Lead Header */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">{activeCase.name}</h2>
                  <span className="text-lg font-bold text-primary" dir="rtl">{activeCase.nameAr}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                    Exact Match
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
                  Case {selectedCaseIndex + 1} of {MOCK_CASES.length}
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
                    disabled={selectedCaseIndex === MOCK_CASES.length - 1}
                    onClick={() => setSelectedCaseIndex((prev) => Math.min(MOCK_CASES.length - 1, prev + 1))}
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
                      Active Cross-Agent Conflict (نزاع استحقاق مبيعات مرتفع الخطورة)
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Client is currently assigned to both <strong className="text-foreground">{activeCase.lead1.repName}</strong> and <strong className="text-foreground">{activeCase.lead2.repName}</strong>. Meetings and touchpoints are concurrent. Please designate the sole owner or choose commission split below.
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
                          <div className="font-bold text-primary font-mono">{activeCase.lead1.id}</div>
                          <span className="text-[10px] text-muted-foreground">{activeCase.lead1.ingested}</span>
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
                          <div className="font-bold text-amber-400 font-mono">{activeCase.lead2.id}</div>
                          <span className="text-[10px] text-muted-foreground">{activeCase.lead2.ingested}</span>
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
                      <span className="font-bold text-foreground">Merged Result Preview</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Row 1: Assignee */}
                  <tr className="bg-red-500/5">
                    <td className="p-3.5 font-medium text-red-400">
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
                    <td className="p-3.5 bg-muted/20 border-l border-border">
                      <select className="w-full text-xs p-1.5 rounded bg-card border border-primary text-primary font-bold">
                        <option>Sole: {activeCase.lead1.repName} (Primary)</option>
                        <option>Sole: {activeCase.lead2.repName} (Challenger)</option>
                        <option>Split Commission (50/50)</option>
                      </select>
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
                      Multi-Touch: {activeCase.lead1.source}
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
                        Keep Advanced: {activeCase.lead1.stage}
                      </span>
                    </td>
                  </tr>

                  {/* Row 4: Telephony Logs */}
                  <tr>
                    <td className="p-3.5 font-medium text-muted-foreground">Call Logs (المكالمات)</td>
                    <td className="p-3.5 bg-primary/5 border-l-2 border-primary font-mono">
                      <strong>{activeCase.lead1.callsCount} Calls</strong> ({activeCase.lead1.callDuration})
                    </td>
                    <td className="p-3.5 bg-amber-500/5 border-l border-amber-500/30 font-mono text-muted-foreground">
                      {activeCase.lead2.callsCount} Calls
                    </td>
                    <td className="p-3.5 bg-muted/20 border-l border-border font-mono text-primary font-bold">
                      Unified: {activeCase.lead1.callsCount + activeCase.lead2.callsCount} Calls Logged
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
                Actions logged with complete ownership audit history.
              </span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center gap-1.5">
                  <Trash2 size={14} />
                  <span>Discard Duplicate</span>
                </button>
                <button className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold flex items-center gap-1.5">
                  <Split size={14} />
                  <span>Keep Separate</span>
                </button>
                <button 
                  onClick={handleMergeAction}
                  disabled={isMerging}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-extrabold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <GitMerge size={14} />
                  <span>{isMerging ? 'Merging...' : 'Merge into Master (دمج وتوحيد)'}</span>
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
                {MOCK_CASES.length} Cases
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {MOCK_CASES.map((item, idx) => (
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
    </div>
  );
}

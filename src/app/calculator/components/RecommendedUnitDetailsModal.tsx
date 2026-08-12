'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  Handshake,
  Loader2,
  MapPin,
  MessageCircle,
  PhoneCall,
  Ruler,
  Search,
  Share2,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { unitsService, recommendedUnitsService, type UnitFile } from '@/lib/services/crmService';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const FREQ_LABELS: Record<number, string> = {
  12: 'Monthly',
  4: 'Quarterly',
  2: 'Semi-annual',
  1: 'Annual',
};

interface RecommendedUnitDetailsModalProps {
  unit: any;
  project: any | null;
  matchPct: number;
  reasons: string[];
  lead: any | null;
  leads: any[];
  imageUrl?: string;
  onClose: () => void;
}

/**
 * One-click Quick Details for a recommended unit — the core sales flow:
 * image + specs, match %, payment plan, why this unit/project, developer,
 * quick pitch, and Reserve / Add to Lead / Log Call / Share actions.
 */
export default function RecommendedUnitDetailsModal({
  unit,
  project,
  matchPct,
  reasons,
  lead,
  leads,
  imageUrl,
  onClose,
}: RecommendedUnitDetailsModalProps) {
  const [img, setImg] = useState(imageUrl || '');
  const [projectImg, setProjectImg] = useState('');
  const [reserving, setReserving] = useState(false);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState('');
  const [pickedLead, setPickedLead] = useState<any>(lead || null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  // Call-log form
  const [callOutcome, setCallOutcome] = useState('Connected');
  const [callNote, setCallNote] = useState('');
  const [callSaving, setCallSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!img && unit?.imagePath) {
          const url = await unitsService.getFileUrl({ filePath: unit.imagePath } as UnitFile);
          if (mounted && url) setImg(url);
        }
        if (project?.imagePath) {
          const url = await unitsService.getFileUrl({ filePath: project.imagePath } as UnitFile);
          if (mounted && url) setProjectImg(url);
        }
      } catch {
        /* private bucket errors are handled by fallbacks */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [unit, project, img]);

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l: any) =>
        String(l?.name || '')
          .toLowerCase()
          .includes(q) ||
        String(l?.phone || '')
          .toLowerCase()
          .includes(q)
    );
  }, [leads, leadQuery]);

  const plan = useMemo(() => {
    const price = Number(unit?.price || 0);
    const downPct = Number(unit?.downPaymentPct || 0);
    const years = Number(unit?.installmentYears || 0);
    const freq = Number(unit?.installmentFrequency || 12) || 12;
    const down = price * (downPct / 100);
    const remaining = Math.max(0, price - down);
    const count = years > 0 ? years * freq : 0;
    return {
      price,
      downPct,
      down,
      remaining,
      count,
      each: count > 0 ? remaining / count : 0,
      freq,
      years,
      hasPlan: downPct > 0 || years > 0,
    };
  }, [unit]);

  const handleReserve = async () => {
    if (reserving || unit.status !== 'Available') return;
    setReserving(true);
    try {
      await unitsService.update(unit.id, { ...unit, status: 'Reserved' });
      toast.success(`"${unit.name}" reserved`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reserve unit');
    } finally {
      setReserving(false);
    }
  };

  const handleAddToLead = async (l: any) => {
    if (savingLeadId) return;
    setSavingLeadId(l.id);
    try {
      await recommendedUnitsService.add(l.id, unit.id);
      setAddedKeys((prev) => new Set(prev).add(`${l.id}:${unit.id}`));
      setLeadPickerOpen(false);
      setLeadQuery('');
      setPickedLead(l);
      toast.success(`Unit added to ${l.name || 'lead'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not add the unit to the lead');
    } finally {
      setSavingLeadId(null);
    }
  };

  const handleLogCall = async () => {
    if (!pickedLead || callSaving) return;
    setCallSaving(true);
    try {
      const res = await fetch('/api/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'lead',
          entity_id: pickedLead.id,
          contact_name: pickedLead.name || '',
          contact_phone: pickedLead.phone || '',
          channel: 'Call',
          direction: 'outgoing',
          outcome: callOutcome,
          notes: `Unit: ${unit.name}${callNote ? ` · ${callNote}` : ''}`,
        }),
      });
      if (!res.ok) throw new Error('Failed to log the call');
      toast.success('Call logged on the lead');
      setLogCallOpen(false);
      setCallNote('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log the call');
    } finally {
      setCallSaving(false);
    }
  };

  const handleShare = () => {
    const lines = [
      `${unit.name} — ${unit.projectName || 'Unit'}`,
      `Price: EGP ${fmt(plan.price)}`,
      plan.hasPlan
        ? `Plan: ${plan.downPct}% down, ${plan.years} yrs (${FREQ_LABELS[plan.freq]})`
        : '',
      project?.location ? `Location: ${project.location}` : '',
      project?.pitchSummary ? project.pitchSummary : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    if (pickedLead?.phone) {
      window.open(
        `https://wa.me/${pickedLead.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`,
        '_blank'
      );
    } else {
      navigator.clipboard?.writeText(text).catch(() => {});
      toast.success('Unit summary copied — share it anywhere');
    }
  };

  const sellingPoints = project?.sellingPoints || [];
  const pitch =
    plan.hasPlan || plan.price > 0
      ? `${unit.name} is available at EGP ${fmt(plan.price)}${
          plan.downPct > 0 ? ` with ${plan.downPct}% down payment` : ''
        }${
          plan.years > 0 ? ` over ${plan.years} years (${FREQ_LABELS[plan.freq]})` : ''
        }.${project?.location ? ` Located in ${project.location}.` : ''}${
          reasons.length > 0 ? ` It ${reasons[0].toLowerCase()}.` : ''
        }`
      : `${unit.name} in ${unit.projectName || 'the project'} is a strong option for this client.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-3xl fade-in max-h-[92vh] flex flex-col">
        {/* Header / image */}
        <div className="relative h-52 sm:h-64 flex-shrink-0 overflow-hidden rounded-t-2xl bg-muted">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={unit.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
              <Building2 size={40} className="text-primary/40" />
            </div>
          )}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-600 text-white">
              <Target size={12} /> {matchPct}% match
            </span>
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white text-lg font-bold drop-shadow truncate">{unit.name}</p>
              <p className="text-white/90 text-xs font-semibold truncate drop-shadow">
                {unit.projectName || '—'}
                {project?.developerName ? ` · ${project.developerName}` : ''}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                unit.status === 'Available'
                  ? 'bg-emerald-500 text-white'
                  : unit.status === 'Reserved'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-500 text-white'
              }`}
            >
              <BadgeCheck size={12} /> {unit.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-5">
          {/* Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Unit type', value: unit.unitType || '—' },
              { label: 'Area', value: unit.area > 0 ? `${unit.area} m²` : '—' },
              { label: 'Floor', value: unit.floor > 0 ? `Floor ${unit.floor}` : '—' },
              { label: 'Price', value: `EGP ${fmt(plan.price)}` },
            ].map((s) => (
              <div key={s.label} className="bg-muted/40 rounded-xl px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Payment plan */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Handshake size={13} className="text-primary" /> Payment plan
            </h4>
            {plan.hasPlan ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    label: 'Down payment',
                    value: `${plan.downPct}% · EGP ${fmt(Math.round(plan.down))}`,
                  },
                  { label: 'Period', value: `${plan.years} years` },
                  { label: 'Frequency', value: FREQ_LABELS[plan.freq] || '—' },
                  {
                    label: 'Installment',
                    value: plan.each > 0 ? `EGP ${fmt(Math.round(plan.each))}` : '—',
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-emerald-50/70 rounded-xl px-3 py-2">
                    <p className="text-[11px] text-emerald-700/70">{s.label}</p>
                    <p className="text-sm font-bold text-emerald-800 tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5">
                No saved payment plan for this unit yet — ask the developer or check the project
                summary below.
              </p>
            )}
            {project?.paymentPlanSummary && (
              <p className="text-[11px] text-muted-foreground mt-2 bg-muted/40 rounded-xl px-3 py-2.5 whitespace-pre-line">
                <span className="font-semibold text-foreground">Project plans:</span>{' '}
                {project.paymentPlanSummary}
              </p>
            )}
          </div>

          {/* Why this unit */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Target size={13} className="text-violet-600" /> Why this unit?
            </h4>
            {reasons.length > 0 ? (
              <ul className="space-y-1.5">
                {reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Availability and pricing are the key factors for this unit.
              </p>
            )}
            {unit.notes && (
              <p className="text-xs text-muted-foreground mt-2 italic">Note: {unit.notes}</p>
            )}
          </div>

          {/* Why this project */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <MapPin size={13} className="text-primary" /> Why this project?
            </h4>
            <div className="space-y-2">
              {project?.location && (
                <p className="text-sm text-foreground flex items-center gap-1.5">
                  <MapPin size={13} className="text-primary" /> {project.location}
                </p>
              )}
              {project?.pitchSummary && (
                <p className="text-sm text-foreground leading-relaxed">{project.pitchSummary}</p>
              )}
              {sellingPoints.length > 0 && (
                <ul className="space-y-1">
                  {sellingPoints.slice(0, 6).map((sp: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                      {sp}
                    </li>
                  ))}
                </ul>
              )}
              {project?.whyBuy && (
                <p className="text-xs text-muted-foreground leading-relaxed">{project.whyBuy}</p>
              )}
            </div>
          </div>

          {/* About the developer */}
          {project?.developerName && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <UserRound size={13} className="text-primary" /> About the developer
              </h4>
              <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground">{project.developerName}</p>
                {project.developerDescription && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {project.developerDescription}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Quick pitch */}
          <div className="bg-blue-50/70 rounded-xl px-3 py-2.5">
            <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1.5">
              <Sparkles size={12} /> Quick pitch
            </p>
            <p className="text-sm text-blue-900 leading-relaxed">{pitch}</p>
          </div>

          {/* Log call inline */}
          {logCallOpen && (
            <div className="border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <PhoneCall size={12} className="text-primary" /> Log call
              </p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="input-base !h-9 !text-xs"
                >
                  {['Connected', 'No Answer', 'Busy', 'Interested', 'Not Interested'].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Short note…"
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                  className="input-base !h-9 !text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setLogCallOpen(false)} className="btn-ghost !h-8 !text-xs">
                  Cancel
                </button>
                <button
                  onClick={handleLogCall}
                  disabled={callSaving || !pickedLead}
                  className="btn-primary !h-8 !text-xs"
                >
                  {callSaving && <Loader2 size={12} className="animate-spin" />}
                  Save call
                </button>
              </div>
              {!pickedLead && (
                <p className="text-[11px] text-amber-600">
                  Pick a lead first (Add to Lead) to log the call.
                </p>
              )}
            </div>
          )}

          {/* Lead picker inline */}
          {leadPickerOpen && (
            <div className="border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Search size={12} className="text-primary" /> Add unit to a lead
              </p>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Search leads by name or phone…"
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  className="input-base !h-9 !pl-8 !text-xs"
                  autoFocus
                />
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {filteredLeads.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No leads found
                  </p>
                ) : (
                  filteredLeads.map((l: any) => {
                    const added = addedKeys.has(`${l.id}:${unit.id}`);
                    const saving = savingLeadId === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={added || !!savingLeadId}
                        onClick={() => handleAddToLead(l)}
                        className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-card transition-colors disabled:opacity-60 disabled:cursor-default"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-foreground truncate">
                            {l.name || '—'}
                          </span>
                          {l.phone && (
                            <span className="block text-[11px] text-muted-foreground truncate">
                              {l.phone}
                            </span>
                          )}
                        </span>
                        {added ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 shrink-0">
                            <Check size={12} /> Added
                          </span>
                        ) : saving ? (
                          <Loader2
                            size={13}
                            className="animate-spin text-muted-foreground shrink-0"
                          />
                        ) : (
                          <span className="text-[11px] font-semibold text-primary shrink-0">
                            Add
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border flex items-center gap-2 flex-wrap">
          {pickedLead && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-1 max-w-[40%]">
              <UserRound size={11} />
              <span className="truncate">{pickedLead.name}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setLogCallOpen((v) => !v)}
              className="btn-secondary !h-9 !px-3 !text-xs"
            >
              <PhoneCall size={13} /> Log Call
            </button>
            <button
              onClick={() => setLeadPickerOpen((v) => !v)}
              className="btn-secondary !h-9 !px-3 !text-xs"
            >
              <UserRound size={13} /> Add to Lead
            </button>
            <button
              onClick={handleShare}
              className="btn-secondary !h-9 !px-3 !text-xs"
              title={pickedLead?.phone ? 'Share on WhatsApp' : 'Copy unit summary'}
            >
              <Share2 size={13} /> Share
            </button>
            <button
              onClick={handleReserve}
              disabled={reserving || unit.status !== 'Available'}
              className="btn-primary !h-9 !px-4 !text-xs disabled:opacity-40"
            >
              {reserving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <BadgeCheck size={13} />
              )}
              {unit.status === 'Available' ? 'Reserve' : unit.status}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

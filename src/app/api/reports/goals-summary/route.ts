import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/goals-summary
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns per-agent standardized Lead Lifecycle Stages breakdown:
 *  New Fresh, New Cold, Leads Pending, Calls Answer, No Answer, Cancel, D.Deal
 * + totalCalls (verified) + targetDeals + goalProgress
 */
function mapStageToBucket(status: string): 'newFresh' | 'newCold' | 'pending' | 'callsAnswer' | 'noAnswer' | 'cancel' | 'doneDeal' | null {
  const t = (status || '').toLowerCase().trim();
  if (!t) return null;
  if (t === 'fresh leads' || t === 'new fresh' || t.includes('fresh')) return 'newFresh';
  if (t === 'cold calls' || t === 'new cold' || t.includes('cold')) return 'newCold';
  if (t.includes('pending') || t.includes('following')) return 'pending';
  if (t === 'done deal' || t === 'd.deal' || t === 'won' || t.includes('done deal') || t.includes('d.deal')) return 'doneDeal';
  if (t.includes('cancel') || t.includes('cancellation')) return 'cancel';
  if (t.includes('no answer')) return 'noAnswer';
  if (t === 'calls answer' || t === 'calls answered' || t === 'meeting' || t === 'interested') return 'callsAnswer';
  // fallbacks
  if (t === 'not interested' || t === 'low budget' || t === 'duplicate leads' || t === 'closed number' || t === 'wrong number' || t === 'data rotation') return 'cancel';
  if (t === 'reservation') return 'doneDeal';
  return 'pending';
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const hasRange = !!from && !!to;
  const rangeStart = hasRange ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const rangeEnd = hasRange ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return !hasRange;
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return !hasRange;
    return ts >= rangeStart && ts <= rangeEnd;
  };

  // Fetch needed data
  const [profilesRes, leadsRes, callsRes, kpiRes] = await Promise.all([
    supabase.from('user_profiles').select('id, full_name, email, role, avatar_url, team_id, is_active').eq('is_active', true).order('full_name'),
    supabase.from('leads').select('id, crm_status, lead_status, assigned_to, created_by, created_at'),
    supabase.from('call_logs').select('id, user_id, outcome, duration_seconds, is_valid, is_flagged, created_at, channel, direction'),
    supabase.from('kpi_targets').select('metric, target_value, target_role').eq('is_active', true),
  ]);

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  // leads/calls/kpi are best-effort - empty array if missing
  const profiles = (profilesRes.data || []).filter((p: any) => p.role !== 'owner' ? true : true); // include all for report
  const leads = (leadsRes.data || []).filter((l: any) => inRange(l.created_at));
  const calls = (callsRes.data || []).filter((c: any) => inRange(c.created_at));

  // Determine targetDeals: first kpi where metric = deals / targetDeals / Won / Done Deal
  let targetDeals = 15;
  const kpis = (kpiRes.data || []) as any[];
  const dealKpi = kpis.find((k) => /deals|won|done/i.test(k.metric || '')) || kpis.find((k) => k.metric === 'deals');
  if (dealKpi && Number(dealKpi.target_value) > 0) targetDeals = Number(dealKpi.target_value);
  // fallback: if no kpi, try company_settings?
  if (!dealKpi) {
    try {
      const { data: cs } = await supabase.from('company_settings').select('value').eq('key', 'kpiTargets').maybeSingle();
      const v = (cs as any)?.value;
      if (v && Array.isArray(v)) {
        const fk = v.find((x:any)=> /deals/i.test(x.metric));
        if (fk && Number(fk.target_value)>0) targetDeals = Number(fk.target_value);
      }
    } catch {}
  }

  // Build per-agent aggregation
  const byAgent = new Map<string, {
    agentId: string; agentName: string; avatarUrl: string | null; role: string;
    stages: { newFresh: number; newCold: number; pending: number; callsAnswer: number; noAnswer: number; cancel: number; doneDeal: number };
    totalCalls: number;
  }>();

  for (const p of profiles) {
    byAgent.set(p.id, {
      agentId: p.id,
      agentName: p.full_name || p.email || 'Unknown',
      avatarUrl: p.avatar_url || null,
      role: p.role || 'agent',
      stages: { newFresh: 0, newCold: 0, pending: 0, callsAnswer: 0, noAnswer: 0, cancel: 0, doneDeal: 0 },
      totalCalls: 0,
    });
  }

  // Leads -> stages (5 lead-based buckets)
  for (const lead of leads) {
    const assignee = (lead.assigned_to || lead.created_by) as string | null;
    if (!assignee || !byAgent.has(assignee)) continue;
    const bucket = mapStageToBucket(String(lead.crm_status || lead.lead_status || ''));
    if (!bucket) continue;
    // callsAnswer/noAnswer buckets will be overridden by call_logs counts below, so only count lead-based ones here
    if (bucket === 'callsAnswer' || bucket === 'noAnswer') {
      // still count if lead stage is explicitly Calls Answer/No Answer (rare) - keep as pending fallback
      // To avoid double counting with calls, we will count these only if no call stats override? Simpler: count them as lead stage
      // For hybrid, we treat callsAnswer/noAnswer from leads as well, but will add call_logs on top? Instead, we separate:
      // We'll count lead-based buckets only: newFresh, newCold, pending, cancel, doneDeal
      // So skip callsAnswer/noAnswer from leads here
      continue;
    }
    const rec = byAgent.get(assignee)!;
    // map to agent's stages
    if (bucket === 'newFresh') rec.stages.newFresh++;
    else if (bucket === 'newCold') rec.stages.newCold++;
    else if (bucket === 'pending') rec.stages.pending++;
    else if (bucket === 'cancel') rec.stages.cancel++;
    else if (bucket === 'doneDeal') rec.stages.doneDeal++;
  }

  // Calls -> callsAnswer, noAnswer, totalCalls (verified)
  // is_valid false => <30s excluded from KPI => count as noAnswer? Spec says <30s forced NOT_INTERESTED and excluded from KPI, but for Calls Answer vs No Answer we treat:
  // callsAnswer = valid calls >=30s (is_valid !== false and not No Answer outcome)
  // noAnswer = invalid (<30s) OR outcome No Answer
  // totalCalls = valid calls (is_valid !== false)
  const SUCCESS_OUTCOMES = ['Reached','Interested','Site Visit','Won Deal','Customer Replied','Interested','D.Deal','FOLLOW_UP'];
  for (const call of calls) {
    const uid = call.user_id as string;
    if (!uid || !byAgent.has(uid)) continue;
    const rec = byAgent.get(uid)!;
    const isValid = call.is_valid !== false;
    const dur = Number(call.duration_seconds) || 0;
    const outcome = String(call.outcome || '');
    const isNoAnswerOutcome = /no answer/i.test(outcome);
    // totalCalls = verified valid calls
    if (isValid) rec.totalCalls++;

    // Bucket into callsAnswer/noAnswer
    if (!isValid || isNoAnswerOutcome || dur > 0 && dur < 30) {
      rec.stages.noAnswer++;
    } else if (isValid) {
      // consider connected/answered
      // If duration >=60 or success outcome, definitely answered; otherwise still count as answered if valid
      rec.stages.callsAnswer++;
    }
  }

  // Also need to handle leads that were explicitly in Calls Answer / No Answer stage but skipped above - we can add them back as well:
  // For lead-based Calls Answer/No Answer, we already skipped, but we should add them from leads too for completeness
  // Count those now (separately) - to avoid double counting, we already counted calls, but lead stage Calls Answer should also contribute? For hybrid report we sum both? Instead, we will add lead stage callsAnswer/noAnswer on top of call counts
  for (const lead of leads) {
    const assignee = (lead.assigned_to || lead.created_by) as string | null;
    if (!assignee || !byAgent.has(assignee)) continue;
    const bucket = mapStageToBucket(String(lead.crm_status || lead.lead_status || ''));
    if (bucket === 'callsAnswer') byAgent.get(assignee)!.stages.callsAnswer++;
    if (bucket === 'noAnswer') byAgent.get(assignee)!.stages.noAnswer++;
  }

  const agentGoals = Array.from(byAgent.values())
    .filter((a) => a.stages.newFresh + a.stages.newCold + a.stages.pending + a.stages.callsAnswer + a.stages.noAnswer + a.stages.cancel + a.stages.doneDeal + a.totalCalls > 0)
    .map((a) => {
      const done = a.stages.doneDeal;
      const progress = targetDeals > 0 ? Math.round((done / targetDeals) * 1000) / 10 : 0;
      return {
        agentId: a.agentId,
        agentName: a.agentName,
        avatarUrl: a.avatarUrl,
        role: a.role,
        targetDeals,
        stages: { ...a.stages },
        totalCalls: a.totalCalls,
        goalProgress: progress,
      };
    })
    .sort((a, b) => b.goalProgress - a.goalProgress || b.stages.doneDeal - a.stages.doneDeal || b.totalCalls - a.totalCalls);

  // Also include agents with zero activity? No, filtered out

  return NextResponse.json({
    from: from || null,
    to: to || null,
    generated_at: new Date().toISOString(),
    targetDeals,
    agentGoals,
  });
}

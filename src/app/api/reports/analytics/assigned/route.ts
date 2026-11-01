import { NextResponse } from 'next/server';
import { analyticsContext, parseFilters, rpcFailure } from '@/lib/analyticsApi';

export const dynamic = 'force-dynamic';

/** GET /api/reports/analytics/assigned?<filters> — getAssignedReport(filters): teams + per-agent counts and pipeline stages. */
export async function GET(request: Request) {
  const ctx = await analyticsContext();
  if (!ctx.ok) return ctx.response;
  const f = parseFilters(new URL(request.url).searchParams);
  if (!f.ok) return f.response;

  const { data, error } = await ctx.db.rpc('report_assigned', { p: f.params });
  if (error) return rpcFailure(error);
  return NextResponse.json(data);
}

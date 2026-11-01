import { NextResponse } from 'next/server';
import { analyticsContext, parseFilters, rpcFailure } from '@/lib/analyticsApi';

export const dynamic = 'force-dynamic';

const FRAMES = ['day', 'weekly', 'monthly', 'year'] as const;

/** GET /api/reports/analytics/overview?frame=weekly&<filters> — getCallAnalytics(filters) */
export async function GET(request: Request) {
  const ctx = await analyticsContext();
  if (!ctx.ok) return ctx.response;
  const sp = new URL(request.url).searchParams;
  const f = parseFilters(sp);
  if (!f.ok) return f.response;
  const frame = FRAMES.find((x) => x === sp.get('frame')) || 'weekly';

  const { data, error } = await ctx.db.rpc('report_call_analytics', { p: f.params, p_frame: frame });
  if (error) return rpcFailure(error);
  return NextResponse.json({ stats: data });
}

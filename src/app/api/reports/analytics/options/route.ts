import { NextResponse } from 'next/server';
import { analyticsContext, rpcFailure } from '@/lib/analyticsApi';

export const dynamic = 'force-dynamic';

/** GET /api/reports/analytics/options — real sources, channels and agents for the filter drawer. */
export async function GET() {
  const ctx = await analyticsContext();
  if (!ctx.ok) return ctx.response;
  const { data, error } = await ctx.db.rpc('report_filter_options');
  if (error) return rpcFailure(error);
  return NextResponse.json(data);
}

import { NextResponse } from 'next/server';
import { analyticsContext, intParam, parseFilters, rpcFailure } from '@/lib/analyticsApi';

export const dynamic = 'force-dynamic';

const SORTS = ['lead', 'phone', 'agent', 'direction', 'outcome', 'duration', 'at'] as const;

/**
 * GET /api/reports/analytics/calls?page=1&pageSize=25&sort=at&dir=desc&search=&<filters>
 * getCallsLog(filters, pagination, sort): call_logs joined with the lead and the agent profile,
 * searched / sorted / paginated in SQL (pageSize up to 5000 for exports).
 */
export async function GET(request: Request) {
  const ctx = await analyticsContext();
  if (!ctx.ok) return ctx.response;
  const sp = new URL(request.url).searchParams;
  const f = parseFilters(sp);
  if (!f.ok) return f.response;

  const page = intParam(sp, 'page', 1, 1, 100000);
  const pageSize = intParam(sp, 'pageSize', 25, 1, 5000);
  const sort = SORTS.find((s) => s === sp.get('sort')) || 'at';
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  const search = (sp.get('search') || '').slice(0, 100);

  const { data, error } = await ctx.db.rpc('report_calls_log', {
    p: f.params,
    p_search: search,
    p_sort: sort,
    p_dir: dir,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) return rpcFailure(error);
  return NextResponse.json({ ...(data as object), page, pageSize });
}

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/owner-master
 * Spec alias for GET /api/dashboard/unified-master
 * Unified Owner-Grade Executive Dashboard — identical for Owner & Admin (ADMIN_OWNER)
 * Preserves query params: ?range=week|month
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || 'week';
  const target = new URL(`/api/dashboard/unified-master?range=${encodeURIComponent(range)}`, request.url);
  // Preserve cookies for auth
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  const res = await fetch(target.toString(), { headers, cache: 'no-store' });
  const body = await res.text();
  // Forward status & body exactly (including 401/403 handling inside unified-master)
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
  });
}

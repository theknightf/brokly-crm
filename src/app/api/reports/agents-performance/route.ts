import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const target = new URL('/api/reports/goals-summary', request.url);
  if (from) target.searchParams.set('from', from);
  if (to) target.searchParams.set('to', to);
  const headers: Record<string,string> = {};
  const c = request.headers.get('cookie');
  if (c) headers['cookie'] = c;
  const res = await fetch(target.toString(), { headers, cache: 'no-store' });
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
}

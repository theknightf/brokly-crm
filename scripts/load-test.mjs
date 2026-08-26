/**
 * 30-user concurrent load test for Brokly CRM.
 *
 * Simulates ~30 concurrent users performing realistic CRM/HR sessions
 * against the production build running on BASE_URL.
 *
 * Run:
 *   node --env-file=.env scripts/load-test.mjs
 */
import { performance } from 'node:perf_hooks';

const BASE = process.env.BASE_URL || 'http://localhost:4099';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CONCURRENCY = Number(process.env.USERS || 30);
const ROUNDS = Number(process.env.ROUNDS || 3);
const THINK_MS = [80, 300]; // random pause between requests (realistic user think time)
const REQ_TIMEOUT_MS = 30000;
const PASSWORD = 'LoadTest#2026!';
const PROJECT_REF = (SUPABASE_URL || '').match(/https:\/\/([^.]+)\./)?.[1] || '';
const AUTH_COOKIE = `sb-${PROJECT_REF}-auth-token`;

// A realistic CRM/HR session: app shell + the heaviest DB-bound report APIs.
const SESSION = [
  { name: 'page:login', method: 'GET', path: '/sign-up-login', auth: false },
  { name: 'page:reports', method: 'GET', path: '/reports', auth: true },
  { name: 'api:reports.summary', method: 'GET', path: '/api/reports/summary?from=2026-07-01&to=2026-08-15', auth: true },
  { name: 'api:reports.activity', method: 'GET', path: '/api/reports/activity?from=2026-07-01&to=2026-08-15', auth: true },
  { name: 'api:attendance.report', method: 'GET', path: '/api/attendance/report?from=2026-07-01&to=2026-08-15', auth: true },
  { name: 'api:notifications', method: 'GET', path: '/api/notifications', auth: true },
  { name: 'api:workspace.followups', method: 'GET', path: '/api/workspace/follow-ups', auth: true },
];

const results = [];
let seq = 0;

function requestWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function supabase(path, body, role) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      ...(role ? { Authorization: `Bearer ${SERVICE_ROLE}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

async function createUser(email) {
  const { status, json } = await supabase(
    '/auth/v1/signup',
    { email, password: PASSWORD },
    false
  );
  // 200 = created (token included). Anything else (422 registered, 429 rate
  // limit, ...) → the user already exists from a previous run → sign in.
  if (status === 200 && json.access_token) return json.access_token;
  return signIn(email);
}

async function signIn(email) {
  const { ok, json } = await supabase('/auth/v1/token?grant_type=password', {
    email,
    password: PASSWORD,
  });
  if (!ok) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function runRequest(name, method, path, token) {
  const started = performance.now();
  const startMark = Date.now();
  const headers = token ? { Cookie: `${AUTH_COOKIE}=${token}` } : {};
  let status = 0;
  let ok = false;
  let bytes = 0;
  try {
    const res = await requestWithTimeout(`${BASE}${path}`, { method, headers, redirect: 'manual' });
    status = res.status;
    ok = res.ok || res.status === 307 || res.status === 302;
    bytes = Number(res.headers.get('content-length') || 0);
  } catch (err) {
    status = err.name === 'AbortError' ? 408 : 0;
  }
  const ms = Date.now() - startMark;
  results.push({ name, method, path, status, ok, ms, bytes });
  seq++;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function virtualUser(token, userId) {
  for (let round = 0; round < ROUNDS; round++) {
    for (const step of SESSION) {
      await runRequest(step.name, step.method, step.path, token);
      const pause = THINK_MS[0] + Math.random() * (THINK_MS[1] - THINK_MS[0]);
      await wait(pause);
    }
  }
}

const p50 = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.5)] : 0;
const p95 = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)] : 0;

async function main() {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
    console.error('Missing SUPABASE env vars — run with: node --env-file=.env scripts/load-test.mjs');
    process.exit(1);
  }

  console.log(`Preparing ${CONCURRENCY} test users…`);
  const tokens = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const email = `loadtest+${i}@brokly.local`;
    tokens.push(await createUser(email));
  }
  console.log(`Sign-in OK for ${tokens.length} users. Starting load test against ${BASE}…`);

  // Warm-up
  await runRequest('warmup', 'GET', '/sign-up-login', null);

  const started = performance.now();
  await Promise.all(tokens.map((t, i) => virtualUser(t, i)));
  const totalSec = (performance.now() - started) / 1000;

  // Summary
  const total = results.length;
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const bytes = results.reduce((s, r) => s + r.bytes, 0);

  console.log('\n══════════ LOAD TEST SUMMARY ══════════');
  console.log(`Concurrent users   : ${CONCURRENCY}`);
  console.log(`Rounds per user    : ${ROUNDS}`);
  console.log(`Total requests     : ${total}`);
  console.log(`Total run time     : ${totalSec.toFixed(1)}s`);
  console.log(`Throughput         : ${(total / totalSec).toFixed(1)} req/s`);
  console.log(`Success rate       : ${((okCount / total) * 100).toFixed(1)}% (${okCount}/${total})`);
  console.log(`Bytes served       : ${(bytes / 1024).toFixed(0)} KB`);

  const byName = new Map();
  for (const r of results) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  console.log('\nPer-endpoint latency (ms)');
  console.log(`${'endpoint'.padEnd(26)} ${'count'.padStart(6)} ${'avg'.padStart(7)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'max'.padStart(7)} ${'errs'.padStart(5)}`);
  for (const [name, list] of byName) {
    const ms = list.map((r) => r.ms);
    const avg = ms.reduce((s, v) => s + v, 0) / ms.length;
    const errs = list.filter((r) => !r.ok).length;
    console.log(
      `${name.padEnd(26)} ${String(list.length).padStart(6)} ${avg.toFixed(0).padStart(7)} ${p50(ms).toFixed(0).padStart(7)} ${p95(ms).toFixed(0).padStart(7)} ${Math.max(...ms).toFixed(0).padStart(7)} ${String(errs).padStart(5)}`
    );
  }

  if (failed.length) {
    const statusCounts = {};
    for (const f of failed) statusCounts[f.status] = (statusCounts[f.status] || 0) + 1;
    console.log('\nFailed requests by HTTP status:', JSON.stringify(statusCounts));
    for (const f of failed.slice(0, 5)) {
      console.log(`  ${f.method} ${f.path} → status ${f.status} (${f.ms}ms)`);
    }
  }

  console.log('\nVERDICT: ' + (okCount / total >= 0.99 ? 'PASS' : 'REVIEW') +
    ' (≥99% success target)');
  process.exit(okCount / total >= 0.99 ? 0 : 1);
}

main().catch((err) => {
  console.error('Load test crashed:', err);
  process.exit(2);
});
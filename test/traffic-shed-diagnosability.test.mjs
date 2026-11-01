// On 2026-10-31 production shed the platform's own verification lane with 429 at
// the Admin entry, and afterwards nothing could say why. The tier could have come
// from request rate (1000/10s on a site-wide key) or from latency and error
// pressure (p95 2200ms, 5% errors); the governor keeps that state in isolate
// memory, holds the tier for ten minutes, and the shed recorded neither. The
// answer was gone.
//
// These tests pin that a shed now carries its coarse reason — and that the
// measured numbers do not travel with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trafficRequestGuard } from '../traffic-governor.js';

const GUARD_SOURCE = fs.readFileSync(new URL('../traffic-governor.js', import.meta.url), 'utf8');
const MENU_WORKER = fs.readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

function crawlerRequest(path = '/admin/') {
  return new Request(`https://ekodi.kr${path}`, {
    method: 'GET',
    headers: { 'user-agent': 'Mozilla/5.0 HeadlessChrome/140.0.0.0' },
  });
}

function capturingConsole(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(' '));
  try { return { result: run(), lines }; } finally { console.error = original; }
}

test('a crawler shed names which kind of pressure caused it', async () => {
  const assessment = {
    tier: 'L3',
    reasons: ['rps'],
    limiterTier: 'L3',
    observed: { tier: 'L1', p95Ms: 180, errorPercent: 0, count: 42 },
  };
  const { result } = capturingConsole(() => trafficRequestGuard(crawlerRequest(), assessment));
  assert.ok(result, 'a headless client at L3 is still shed');
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('x-ekodi-traffic-tier'), 'L3');
  assert.equal(result.headers.get('x-ekodi-traffic-reasons'), 'rps', 'the reason must travel on the response');
  const body = await result.json();
  assert.equal(body.error, 'TRAFFIC_CRAWLER_SHED');
  assert.equal(body.reasons, 'rps');
});

test('latency pressure and rate pressure are told apart', async () => {
  const byLatency = {
    tier: 'L3',
    reasons: ['latency_or_error'],
    limiterTier: 'L1',
    observed: { tier: 'L3', p95Ms: 2_400, errorPercent: 6.1, count: 31 },
  };
  const { result } = capturingConsole(() => trafficRequestGuard(crawlerRequest(), byLatency));
  const body = await result.json();
  assert.equal(body.reasons, 'latency_or_error');
  // The distinction is the whole point: these lead to different investigations.
  assert.notEqual(body.reasons, 'rps');
});

test('several reasons are reported together, and bounded', async () => {
  const assessment = {
    tier: 'PROTECT',
    reasons: ['rps', 'latency_or_error', 'recovery_hysteresis', 'limiter_degraded', 'extra_one', 'extra_two'],
    observed: {},
  };
  const { result } = capturingConsole(() => trafficRequestGuard(crawlerRequest(), assessment));
  const reasons = result.headers.get('x-ekodi-traffic-reasons');
  assert.equal(reasons, 'rps,latency_or_error,recovery_hysteresis,limiter_degraded');
  assert.ok(!reasons.includes('extra_one'), 'the header must stay bounded');
});

test('the measured numbers stay server-side', async () => {
  const assessment = {
    tier: 'L3',
    reasons: ['latency_or_error'],
    limiterTier: 'L1',
    observed: { tier: 'L3', p95Ms: 2_400, errorPercent: 6.1, count: 31 },
  };
  const { result, lines } = capturingConsole(() => trafficRequestGuard(crawlerRequest(), assessment));
  const body = await result.text();
  const headers = [...result.headers].map(pair => pair.join(':')).join(' ');
  for (const secret of ['2400', '6.1', '31']) {
    assert.ok(!body.includes(secret), `the response body must not carry the measurement ${secret}`);
    assert.ok(!headers.includes(secret), `the response headers must not carry the measurement ${secret}`);
  }
  // They are logged instead, where a live tail can read them.
  assert.equal(lines.length, 1);
  assert.match(lines[0], /EKODI traffic shed/);
  const logged = JSON.parse(lines[0].replace('EKODI traffic shed ', ''));
  assert.equal(logged.p95Ms, 2_400);
  assert.equal(logged.errorPercent, 6.1);
  assert.equal(logged.samples, 31);
  assert.equal(logged.reasons, 'latency_or_error');
});

test('a shed with no assessment detail still answers, rather than throwing', async () => {
  // The guard runs on every request; a missing field must never become a 500.
  for (const assessment of [{ tier: 'L3' }, { tier: 'L3', reasons: 'not-an-array' }, { tier: 'PROTECT', reasons: [] }]) {
    const { result } = capturingConsole(() => trafficRequestGuard(crawlerRequest(), assessment));
    assert.equal(result.status, 429);
    assert.equal(result.headers.get('x-ekodi-traffic-reasons'), '');
  }
});

test('nothing is shed when there is no pressure, and probes are never shed', () => {
  const { result: calm } = capturingConsole(() => trafficRequestGuard(crawlerRequest(), { tier: 'L1', reasons: [], observed: {} }));
  assert.equal(calm, null, 'L1 sheds nobody');
  const { result: probe } = capturingConsole(() => trafficRequestGuard(crawlerRequest('/health'), { tier: 'PROTECT', reasons: ['rps'], observed: {} }));
  assert.equal(probe, null, 'core probes stay reachable under pressure');
});

test('the verification probe records the governor labels so a 429 is diagnosable from the run', () => {
  assert.match(MENU_WORKER, /x-ekodi-traffic-tier/);
  assert.match(MENU_WORKER, /x-ekodi-traffic-reasons/);
  assert.match(MENU_WORKER, /tier=\$\{adminEntryTransport\.trafficTier\}/);
  assert.match(MENU_WORKER, /reasons=\$\{adminEntryTransport\.trafficReasons\}/);
  // Still bounded metadata only: the worker's standing rule.
  assert.match(MENU_WORKER, /never the URL, query, token or body/);
  for (const field of ['entryHeaders.cookie', "entryHeaders['set-cookie']", 'entryResponse.text()']) {
    assert.ok(!MENU_WORKER.includes(field), `must not start capturing ${field}`);
  }
});

test('the shed logs its reason for every shedding path, not only the crawler one', () => {
  const body = GUARD_SOURCE.slice(GUARD_SOURCE.indexOf('export function trafficRequestGuard'));
  const sheds = [...body.matchAll(/retryResponse\(/g)];
  assert.ok(sheds.length >= 2, 'both the noncritical 503 and the crawler 429 shed');
  // Every shed hands the assessment through; one that forgot would be undiagnosable.
  assert.equal([...body.matchAll(/retryResponse\([^)]*assessment\)/g)].length, sheds.length);
});

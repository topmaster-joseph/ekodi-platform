// Read-only live O2O release acceptance; run on protected main after Shared Site Core deploy.
// No login, token issuance, database writes, points, check-in or cookies.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const origin = 'https://ekodi.kr';
const syntheticNeverIssuedCode = 'f'.repeat(48);
const results = [];

async function request(path, method = 'GET') {
  const started = performance.now();
  const response = await fetch(origin + path, {
    method,
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  });
  results.push({
    path: path.startsWith('/o2o/go/') ? '/o2o/go/[synthetic]' : path,
    method,
    status: response.status,
    durationMs: Math.round(performance.now() - started)
  });
  return response;
}

function containsHeader(response, key, text) {
  assert.match(response.headers.get(key) || '', text, key);
}

const document = await request('/o2o');
assert.equal(document.status, 200, 'public O2O entry must load');
assert.equal(document.headers.get('x-ekodi-route'), 'o2o-public-qr-hub');
containsHeader(document, 'cache-control', /no-store/);
containsHeader(document, 'x-robots-tag', /noindex/);
const html = await document.text();
assert.match(html, /rel="preload" href="\/o2o-qr-vendor\.js"/);
assert.match(html, /rel="modulepreload" href="\/o2o-hub-client\.js"/);
assert.match(html, /id="o2o-qr"/);
assert.match(html, /QR 만들기/);

const assets = [
  '/o2o-hub-client.js',
  '/o2o-link-core.js',
  '/o2o-hub.css',
  '/o2o-qr-vendor.js'
];
for (const path of assets) {
  const response = await request(path);
  assert.equal(response.status, 200, 'missing O2O public static asset: ' + path);
  assert.equal(response.headers.get('x-ekodi-route'), 'public-asset');
  containsHeader(response, 'cache-control', /max-age=120/);
  containsHeader(response, 'cache-control', /stale-while-revalidate=30/);
  if (path === '/o2o-hub-client.js') {
    const client = await response.text();
    assert.match(client, /lastRenderedUrl/);
    assert.match(client, /width: 256, height: 256/);
  } else {
    await response.arrayBuffer();
  }
}

const invalidLink = '/o2o/go/' + syntheticNeverIssuedCode;
for (const method of ['GET', 'HEAD']) {
  const response = await request(invalidLink, method);
  assert.ok([404, 503].includes(response.status),
    'a never-issued QR must fail closed: status ' + response.status);
  assert.equal(response.headers.get('x-ekodi-route'), 'o2o-issued-link');
  containsHeader(response, 'cache-control', /no-store/);
  containsHeader(response, 'x-robots-tag', /noindex/);
  assert.equal(response.headers.get('location'), null);
  if (method === 'HEAD') assert.equal(await response.text(), '');
  else await response.text();
}

// This is a network smoke measurement, NOT a browser LCP claim or an SLA.
// Do not use a sensitive or live user token as a synthetic test value.
const times = results.map((x) => x.durationMs);
console.log('EKODI_O2O_LIVE_SMOKE_SUCCESS ' + JSON.stringify({
  checks: results.length,
  httpDurationMs: {
    min: Math.min(...times),
    max: Math.max(...times),
    median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
  },
  routes: results
}));

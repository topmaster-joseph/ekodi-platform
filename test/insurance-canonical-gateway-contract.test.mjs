import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyInsuranceGatewayRequest as check } from '../sites/ekodi-insurance/api/canonical-gateway-contract.mjs';

const BASE = 'https://ekodi.kr/api/insurance';
const make = (path, { method = 'GET', headers = {}, origin = BASE } = {}) =>
  new Request(origin + path, { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) });

const post = (path, extra = {}) =>
  make(path, { method: 'POST', headers: {
    origin: 'https://ekodi.kr', 'content-type': 'application/json',
    'sec-fetch-site': 'same-origin', ...extra
  } });

test('only exact public read routes are mapped; internal/advisor routes remain closed', () => {
  assert.deepEqual(
    { ...check(make('/health')) }.upstreamPath, '/health'
  );
  assert.equal(check(make('/network/catalog')).upstreamPath, '/api/network/catalog');
  for (const path of [
    '/', '/internal/consultations', '/advisor/profile', '/api/internal/network/catalog',
    '/consultations', '/network/catalog/items', '/chat', '/health/', '//health',
    '/%68ealth', '/HEALTH', '/consultations/con_bad/revoke', '/../health',
    '/consultations/con_123/revoke', '/internal/network/partners'
  ]) {
    assert.equal(check(make(path)).allowed, false, path);
  }
});

test('same-origin JSON consumer writes require exact route, method and origin', () => {
  const chat = check(post('/chat'));
  assert.equal(chat.allowed, true);
  assert.equal(chat.upstreamPath, '/api/chat');
  assert.equal(chat.maxBodyBytes, 65536);
  assert.equal(chat.requiresActualStreamSizeCheck, true);
  const created = check(post('/consultations'));
  assert.equal(created.allowed, true);
  assert.equal(created.upstreamPath, '/api/consultations');
  assert.equal(check(post('/consultations/con_01ab-7c/revoke')).upstreamPath,
    '/api/consultations/con_01ab-7c/revoke');
  assert.equal(check(post('/consultations/con_01ab-7c/revoke')).maxBodyBytes, 2048);
  for (const headers of [
    { origin: 'https://fake.example' },
    { origin: '' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { 'content-type': 'text/plain' },
    { 'content-type': 'application/x-www-form-urlencoded' },
    { 'content-length': '131073' },
    { 'content-length': '-1' },
    { 'content-length': '99999999999' }
  ]) {
    assert.equal(check(post('/consultations', headers)).allowed, false, JSON.stringify(headers));
  }
  assert.equal(check(make('/chat', { method: 'GET' })).allowed, false);
  assert.equal(check(make('/health', { method: 'POST', headers: {
    origin: 'https://ekodi.kr','content-type':'application/json'
  }})).allowed, false);
  assert.equal(check(make('/chat', { method: 'PUT' })).allowed, false);
  assert.equal(check(make('/chat', { method: 'PATCH' })).allowed, false);
  assert.equal(check(make('/chat', { method: 'OPTIONS' })).allowed, false);
});

test('no query string, token, alternative host, auth, cookie or secret forwarding', () => {
  assert.equal(check(make('/health?token=secret')).allowed, false);
  assert.equal(check(make('/health#frag')).allowed, false);
  assert.equal(check(make('/health', { origin: 'http://ekodi.kr/api/insurance' })).allowed, false);
  assert.equal(check(make('/health', { origin: 'https://example.org/api/insurance' })).allowed, false);
  assert.equal(check(make('/health', { origin: 'https://ekodi.kr:8080/api/insurance' })).allowed, false);
  const headers = {
    'origin': 'https://ekodi.kr', 'content-type': 'application/json',
    'cookie': 'ekodi_session=PRIVATE',
    'authorization': 'Bearer SECRET',
    'x-ekodi-insurance-internal-token': 'PRIVATE_SECRET'
  };
  const result = check(post('/chat', headers));
  assert.equal(result.allowed, true);
  assert.deepEqual(result.forwardedHeaders, ['accept', 'content-type']);
  assert.equal(result.forwardedHeaders.includes('cookie'), false);
  assert.equal(result.forwardedHeaders.includes('authorization'), false);
  assert.equal(result.forwardedHeaders.includes('x-ekodi-insurance-internal-token'), false);
  assert.equal(result.noStore, true);
  assert.equal(result.usePrivateServiceBindingOnly, true);
});

test('contract is inert, not imported by public router, build or running API workers', async () => {
  const root = new URL('../', import.meta.url);
  const file = await readFile(new URL('sites/ekodi-insurance/api/canonical-gateway-contract.mjs', root), 'utf8');
  const routes = await Promise.all([
    'site-worker.js', 'insurance-public-route.js', 'sites/ekodi-insurance/api/worker.js',
    'scripts/build.mjs'
  ].map(async path => readFile(new URL(path, root), 'utf8')));
  assert.doesNotMatch(file, /\bfetch\s*\(|\bconsole\.(log|error)\s*\(|\bprocess\.env\b|\blocalStorage\b/);
  assert.equal(routes.every(text => !text.includes('canonical-gateway-contract')), true);
  assert.equal(routes.every(text => !text.includes('/api/insurance/health')), true);
});

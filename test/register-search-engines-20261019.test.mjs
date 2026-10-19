import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  validateDomain, validateSitemapPath, scDomainUrl, buildServiceAccountAssertion,
  backoff, createClients, ensureTxtRecord, registerDomain,
} from '../scripts/register-search-engines.mjs';

const ALLOWED = ['seonammedi.kr', 'xn--3e0b8b58jw4co4mnpll3k.kr'];

test('domain and sitemap inputs are validated and allow-listed', () => {
  assert.equal(validateDomain('SeonamMedi.kr ', ALLOWED), 'seonammedi.kr');
  assert.equal(validateDomain('xn--3e0b8b58jw4co4mnpll3k.kr', ALLOWED), 'xn--3e0b8b58jw4co4mnpll3k.kr');
  assert.equal(validateDomain('서남권국립의대.kr', ALLOWED), 'xn--3e0b8b58jw4co4mnpll3k.kr');
  assert.equal(validateDomain('seonammedi.kr.', ALLOWED), 'seonammedi.kr');
  assert.throws(() => validateDomain('ekodi.kr', ALLOWED), /allow-list/);
  for (const bad of ['', 'http://seonammedi.kr', 'seonammedi.kr/x', 'a..kr', '-x.kr']) assert.throws(() => validateDomain(bad, [...ALLOWED, bad]));
  assert.equal(validateSitemapPath(undefined), '/sitemap.xml');
  assert.equal(validateSitemapPath('/sitemaps/main.xml'), '/sitemaps/main.xml');
  for (const bad of ['sitemap.xml', '/../etc.xml', '/x.txt', '/a b.xml']) assert.throws(() => validateSitemapPath(bad));
  assert.equal(scDomainUrl('seonammedi.kr'), 'sc-domain:seonammedi.kr');
});

test('service account assertion is a verifiable RS256 JWT with only the two scopes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = buildServiceAccountAssertion(key, 1000);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.iss, key.client_email);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.deepEqual(claims.scope.split(' ').sort(), ['https://www.googleapis.com/auth/siteverification', 'https://www.googleapis.com/auth/webmasters']);
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
  assert.throws(() => buildServiceAccountAssertion({}), /missing/);
});

test('backoff retries then succeeds, and gives up after attempts', async () => {
  let n = 0; const waits = [];
  const ok = await backoff(async () => { n += 1; if (n < 3) throw new Error('not yet'); return 'done'; }, { sleep: async ms => waits.push(ms) });
  assert.equal(ok, 'done'); assert.deepEqual(waits, [5000, 10000]);
  await assert.rejects(backoff(async () => { throw new Error('never'); }, { attempts: 2, sleep: async () => {} }), /never/);
});

function fakeApis({ existingTxt = [], verifyFailures = 1, owners = ['sa@p.iam.gserviceaccount.com'], liveOwners = null, putError = null } = {}) {
  const calls = []; let verifyCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET';
    calls.push(`${method} ${u.hostname}${u.pathname}`);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/siteVerification/v1/token') return json(200, { method: 'DNS_TXT', token: 'google-site-verification=AbCdEfGh12345678' });
    if (u.pathname.endsWith('/dns_records') && method === 'GET') return json(200, { success: true, result: existingTxt });
    if (u.pathname.endsWith('/dns_records') && method === 'POST') return json(200, { success: true, result: { id: 'rec1' } });
    if (u.pathname === '/siteVerification/v1/webResource' && method === 'POST') {
      verifyCalls += 1;
      if (verifyCalls <= verifyFailures) return json(400, { error: { message: 'token not found yet' } });
      return json(200, { id: 'dns%3A%2F%2Fseonammedi.kr', owners });
    }
    if (u.pathname.startsWith('/siteVerification/v1/webResource/') && method === 'GET') return json(200, { owners: liveOwners || owners });
    if (u.pathname.startsWith('/siteVerification/v1/webResource/') && method === 'PUT') return putError ? json(400, { error: { message: putError } }) : json(200, { owners: JSON.parse(init.body).owners });
    if (u.pathname.startsWith('/webmasters/v3/sites/')) return method === 'GET' ? json(200, { isPending: true }) : new Response(null, { status: 204 });
    return json(404, { error: { message: 'unexpected ' + url } });
  };
  return { fetchImpl, calls };
}

test('end-to-end flow: token, TXT add, verify with retry, owner, Search Console, sitemap readback', async () => {
  const { fetchImpl, calls } = fakeApis();
  const { g, cf } = createClients({ fetchImpl, googleToken: 'g', cfToken: 'c' });
  const ev = await registerDomain({ g, cf, domain: 'seonammedi.kr', zoneId: 'z'.repeat(32), sitemapPath: '/sitemap.xml', ownerEmail: 'owner@example.com', sleep: async () => {} });
  assert.deepEqual(ev.steps.map(s => s.name), ['getToken', 'dnsTxt', 'verify', 'addOwner', 'searchConsoleAdd', 'sitemapSubmit', 'sitemapReadback']);
  assert.equal(ev.steps[1].action, 'created');
  assert.ok(calls.includes('PUT www.googleapis.com/webmasters/v3/sites/sc-domain%3Aseonammedi.kr'));
  assert.ok(calls.some(c => c.includes('/sitemaps/https%3A%2F%2Fseonammedi.kr%2Fsitemap.xml')));
  assert.doesNotMatch(JSON.stringify(ev), /AbCdEfGh12345678|Bearer/);
});

test('TXT upsert is idempotent and never deletes or edits records', async () => {
  const { fetchImpl, calls } = fakeApis({ existingTxt: [{ id: 'old', content: '"google-site-verification=AbCdEfGh12345678"' }] });
  const { cf } = createClients({ fetchImpl, googleToken: 'g', cfToken: 'c' });
  const r = await ensureTxtRecord(cf, { zoneId: 'z', name: 'seonammedi.kr', content: 'google-site-verification=AbCdEfGh12345678' });
  assert.deepEqual(r, { action: 'exists', id: 'old' });
  assert.ok(!calls.some(c => /^(POST|PUT|PATCH|DELETE) api\.cloudflare/.test(c)));
});

test('owner already present is not re-added; API errors surface without secrets', async () => {
  const { fetchImpl, calls } = fakeApis({ owners: ['owner@example.com'], verifyFailures: 0 });
  const { g, cf } = createClients({ fetchImpl, googleToken: 'secret-google-token', cfToken: 'secret-cf' });
  const ev = await registerDomain({ g, cf, domain: 'seonammedi.kr', zoneId: 'z'.repeat(32), sitemapPath: '/sitemap.xml', ownerEmail: 'owner@example.com', sleep: async () => {} });
  assert.ok(!ev.steps.some(s => s.name === 'addOwner'));
  assert.ok(!calls.some(c => c.startsWith('PUT www.googleapis.com/siteVerification')));
  const failing = createClients({ fetchImpl: async () => new Response('{"error":{"message":"denied"}}', { status: 403 }), googleToken: 'secret-google-token', cfToken: 'x' });
  await assert.rejects(failing.g('https://www.googleapis.com/siteVerification/v1/token', 'POST', {}), err => !/secret-google-token/.test(err.message) && /denied/.test(err.message));
});

test('owner add merges live owners and a rejected owner update does not block registration', async () => {
  const { fetchImpl, calls } = fakeApis({ verifyFailures: 0, liveOwners: ['sa@p.iam.gserviceaccount.com', 'other@example.com'], putError: 'You cannot unverify this site owner' });
  const { g, cf } = createClients({ fetchImpl, googleToken: 'g', cfToken: 'c' });
  const ev = await registerDomain({ g, cf, domain: 'ekodi.kr', zoneId: 'z'.repeat(32), sitemapPath: '/sitemap.xml', ownerEmail: 'owner@example.com', sleep: async () => {} });
  const owner = ev.steps.find(s => s.name === 'addOwner');
  assert.equal(owner.action, 'deferred');
  assert.ok(ev.steps.some(s => s.name === 'sitemapSubmit'));
  assert.ok(calls.some(c => c.startsWith('GET www.googleapis.com/siteVerification/v1/webResource/')));
});

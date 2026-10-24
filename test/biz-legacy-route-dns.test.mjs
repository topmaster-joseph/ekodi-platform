import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLegacyRoutes } from '../scripts/reconcile-ekodibiz-legacy-route.mjs';
import { readFile } from 'node:fs/promises';

const ok = result => new Response(JSON.stringify({ success: true, result }), {
  status: 200, headers: { 'content-type': 'application/json' }
});

function fakeCloudflare({ missingWww = false } = {}) {
  const patches = [];
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    if (url.includes('/zones?name=')) return ok([{ id: 'zone-1', name: 'ekodibiz.kr', status: 'active' }]);
    if (url.includes('/dns_records?name=ekodibiz.kr')) return ok([
      { id: 'apex-a', name: 'ekodibiz.kr', type: 'A', proxied: false },
      { id: 'mail-mx', name: 'ekodibiz.kr', type: 'MX', proxied: false }
    ]);
    if (url.includes('/dns_records?name=www.ekodibiz.kr')) return ok(missingWww ? [] : [
      { id: 'www-cname', name: 'www.ekodibiz.kr', type: 'CNAME', proxied: true }
    ]);
    if (url.includes('/dns_records/apex-a') && options.method === 'PATCH') {
      const v = JSON.parse(options.body).proxied;
      patches.push(v);
      return ok({ id: 'apex-a', proxied: v });
    }
    throw new Error('unexpected Cloudflare request: ' + url);
  };
  return { fetchImpl, patches, requests };
}

test('existing web record proxy can be enabled without changing mail records', async () => {
  const db = fakeCloudflare();
  let probed = 0;
  const result = await reconcileLegacyRoutes({
    token: 'not-a-real-token', fetchImpl: db.fetchImpl,
    probe: async hosts => { probed++; assert.deepEqual(hosts, ['ekodibiz.kr','www.ekodibiz.kr']); }
  });
  assert.equal(result.hostsVerified, 2);
  assert.equal(result.proxyFlagsChanged, 1);
  assert.equal(probed, 1);
  assert.deepEqual(db.patches, [true]);
  assert.ok(db.requests.every(r => r.method !== 'DELETE'));
  assert.ok(db.requests.every(r => !r.url.includes('mail-mx')));
});

test('failed HTTP acceptance check reverts only changed proxy flags', async () => {
  const db = fakeCloudflare();
  await assert.rejects(reconcileLegacyRoutes({
    token: 'not-a-real-token', fetchImpl: db.fetchImpl,
    probe: async () => { throw new Error('HTTP acceptance failed'); }
  }), /HTTP acceptance failed/);
  assert.deepEqual(db.patches, [true, false]);
});

test('missing host record stops before any DNS mutation', async () => {
  const db = fakeCloudflare({ missingWww: true });
  await assert.rejects(reconcileLegacyRoutes({
    token: 'not-a-real-token', fetchImpl: db.fetchImpl,
    probe: async () => {}
  }), /No existing web DNS record/);
  assert.deepEqual(db.patches, []);
});

test('legacy Wrangler uses ordinary routes rather than conflicting custom domains', async () => {
  const toml = await readFile(new URL('../wrangler.biz-legacy.toml', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/deploy-biz-legacy.yml', import.meta.url), 'utf8');
  assert.match(toml, /pattern = "ekodibiz\.kr\/\*"/);
  assert.match(toml, /pattern = "www\.ekodibiz\.kr\/\*"/);
  assert.doesNotMatch(toml, /custom_domain\s*=\s*true/);
  assert.match(workflow, /reconcile-ekodibiz-legacy-route\.mjs/);
  assert.doesNotMatch(workflow, /curl\s+[^\n]*-X DELETE/);
});

test('unproxyable web record fails closed before any DNS write', async () => {
  const db = fakeCloudflare();
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/dns_records?name=ekodibiz.kr')) {
      return ok([{ id: 'apex-locked', name: 'ekodibiz.kr', type: 'A',
        proxied: false, proxiable: false }]);
    }
    return db.fetchImpl(url, options);
  };
  await assert.rejects(reconcileLegacyRoutes({
    token: 'not-a-real-token', fetchImpl, probe: async () => {}
  }), /not safely proxyable/);
  assert.deepEqual(db.patches, []);
});

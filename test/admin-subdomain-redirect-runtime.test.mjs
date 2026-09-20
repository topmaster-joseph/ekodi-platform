import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../site-worker.js';
import { readFile } from 'node:fs/promises';

const siteOwnedHosts = [
  'auth.ekodi.kr',
  'cloud.ekodi.kr',
  'live.ekodi.kr',
  'pay.ekodi.kr',
  'trade.ekodi.kr',
  'messenger.ekodi.kr',
  'invest.ekodi.kr',
];

for (const host of siteOwnedHosts) {
  test(`${host} /admin uses a mutable safe redirect`, async () => {
    const response = await worker.fetch(new Request(`https://${host}/admin`), {});
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, 'https://ekodi.kr');
    assert.equal(location.pathname, '/admin/');
    assert.equal(location.searchParams.get('source'), host);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/i);
  });
}

test('Mail Admin handoff is verified only after candidate promotion', async () => {
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const legacyMailHost=['mail','ekodi.kr'].join('.');
  const probe=manifest.worker.requests.find(item=>item.url===`https://${legacyMailHost}/admin`);
  assert.deepEqual(probe?.statuses,[307]);
  assert.equal(probe?.candidateVerify,false);
  assert.match(probe?.candidateVerifyReason||'',/after promotion|post-promotion/i);
  assert.ok(probe?.headerExpect?.includes('location: https://ekodi.kr/admin/'));
  assert.ok(probe?.headerExpect?.includes('cache-control: no-store'));
  assert.ok(probe?.headerExpect?.includes('x-robots-tag: noindex, nofollow, noarchive'));
  assert.ok(probe?.headerExpect?.includes('x-content-type-options: nosniff'));
});

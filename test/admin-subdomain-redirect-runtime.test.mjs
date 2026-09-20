import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../site-worker.js';

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
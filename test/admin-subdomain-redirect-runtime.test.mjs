import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../site-worker.js';

const retiredPublicSubdomains = [
  'auth.ekodi.kr',
  'cloud.ekodi.kr',
  'live.ekodi.kr',
  'pay.ekodi.kr',
  'trade.ekodi.kr',
  'messenger.ekodi.kr',
  'invest.ekodi.kr',
];

for (const host of retiredPublicSubdomains) {
  test(`${host} /admin fails closed without a compatibility redirect`, async () => {
    const response = await worker.fetch(new Request(`https://${host}/admin`), {});
    assert.equal(response.status, 404);
    assert.equal(response.headers.has('location'), false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/i);
  });
}

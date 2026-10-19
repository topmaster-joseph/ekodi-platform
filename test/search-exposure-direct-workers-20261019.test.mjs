import test from 'node:test';
import assert from 'node:assert/strict';
import ekodipay from '../ekodipay-worker.js';
test('direct-route EKODI Pay entry carries the shared search head', async () => {
  const response = await ekodipay.fetch(new Request('https://ekodi.kr/ekodipay/'), {}, {});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<link rel="canonical"/);
  assert.doesNotMatch(html, /noindex/);
});
test('non-HTML and non-200 EKODI Pay responses are untouched', async () => {
  const response = await ekodipay.fetch(new Request('https://ekodi.kr/ekodipay/nope'), {}, {});
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-ekodi-search-exposure'), null);
});

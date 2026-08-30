import test from 'node:test';
import assert from 'node:assert/strict';
import { appendUtm, POST_STATES } from '../social-channel-gateway.js';

test('appendUtm preserves destination parameters and adds provider tracking', () => {
  const result = new URL(appendUtm(
    'https://mall.ekodi.kr/product/42?ref=home',
    'facebook',
    'mall_discovery_20260830',
    'post_001',
  ));
  assert.equal(result.origin, 'https://mall.ekodi.kr');
  assert.equal(result.pathname, '/product/42');
  assert.equal(result.searchParams.get('ref'), 'home');
  assert.equal(result.searchParams.get('utm_source'), 'facebook');
  assert.equal(result.searchParams.get('utm_medium'), 'social');
  assert.equal(result.searchParams.get('utm_campaign'), 'mall_discovery_20260830');
  assert.equal(result.searchParams.get('utm_content'), 'post_001');
});

test('publishing states distinguish provider-confirmed publication from queue states', () => {
  assert.deepEqual([...POST_STATES], ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled']);
  assert.ok(POST_STATES.has('published'));
  assert.ok(POST_STATES.has('failed'));
});

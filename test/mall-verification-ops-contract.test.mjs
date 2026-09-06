import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, entry, html, js, redirects, headers, deploy] = await Promise.all([
  readFile(new URL('../sites/ekodi-mall/api/verification.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/assets/verification-ops.html', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/assets/verification-ops.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/_redirects', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/_headers', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-ekodi-mall.yml', import.meta.url), 'utf8')
]);

test('verification operations use server-validated Google allowlist auth without browser ops secrets', () => {
  assert.ok(api.includes('MALL_OPERATIONS_EMAILS'));
  assert.ok(api.includes('authorizeVerificationOperations'));
  assert.ok(api.includes('mall-ops:' + '$' + '{email}'));
  assert.ok(js.includes('authorization'));
  assert.ok(!js.includes('x-ekodi-mall-ops-token'));
  assert.ok(!html.toLowerCase().includes('ops-token'));
});

test('verification operations keep review, checkout gate and high-impact payment gates separate', () => {
  assert.ok(api.includes('/api/internal/verification/queue'));
  assert.ok(api.includes('checkout-gate'));
  assert.ok(js.includes('/review'));
  assert.ok(js.includes('/checkout-gate'));
  assert.ok(entry.includes('operationsReviewConfigured:Boolean(env.MALL_OPERATIONS_TOKEN || env.MALL_OPERATIONS_EMAILS)'));
  assert.ok(html.includes('Human approval'));
  assert.ok(html.includes('PAYOUT / REFUND'));
});

test('verification operations are built and routed as a Mall operations surface', () => {
  assert.ok(redirects.includes('/verification-ops /assets/verification-ops.html 200'));
  assert.ok(headers.includes('/verification-ops*'));
  assert.ok(headers.includes('Cache-Control: no-store'));
  assert.ok(deploy.includes('dist/assets/verification-ops.html'));
  assert.ok(deploy.includes('/api/internal/verification/queue'));
});

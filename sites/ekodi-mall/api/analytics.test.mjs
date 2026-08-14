import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAnalyticsDays, sourceLabel } from './analytics.js';

test('analytics period defaults to 30 days and is capped at 90', () => {
  assert.equal(normalizeAnalyticsDays(undefined), 30);
  assert.equal(normalizeAnalyticsDays('0'), 30);
  assert.equal(normalizeAnalyticsDays('7'), 7);
  assert.equal(normalizeAnalyticsDays('30'), 30);
  assert.equal(normalizeAnalyticsDays('999'), 90);
});

test('analytics source labels preserve the 7/8/9 fee vocabulary', () => {
  assert.equal(sourceLabel('direct'), 'Direct 7%');
  assert.equal(sourceLabel('marketplace'), 'Mall 8%');
  assert.equal(sourceLabel('ai'), 'AI 9%');
  assert.equal(sourceLabel('unknown'), 'Mall 8%');
});

test('analytics implementation remains seller-scoped and privacy-minimized', async () => {
  const source = await readFile(new URL('./analytics.js', import.meta.url), 'utf8');
  assert.match(source, /WHERE seller_id=\?/);
  assert.match(source, /p\.seller_id=\?/);
  assert.match(source, /COUNT\(DISTINCT av\.visitor_id\)/);
  assert.match(source, /status='paid'/);
  assert.match(source, /payment_pending/);
  assert.match(source, /원본 visitor ID는 반환하지 않습니다/);
  assert.doesNotMatch(source, /visitorId:\s*row\./);
  assert.doesNotMatch(source, /attributionToken:\s*row\./);
});

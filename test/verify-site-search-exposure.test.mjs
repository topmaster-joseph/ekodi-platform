import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHtml } from '../scripts/verify-site-search-exposure.mjs';
const h = (o = {}) => new Headers({ 'content-type': 'text/html', ...o });
test('passes indexable page with canonical', () => {
  const r = auditHtml({ status: 200, headers: h(), text: '<html><head><meta name="robots" content="index, follow"><link rel="canonical" href="https://ekodi.kr/a"></head></html>' });
  assert.equal(r.ok, true);
});
test('flags noindex, missing canonical and non-200', () => {
  assert.deepEqual(auditHtml({ status: 200, headers: h({ 'x-robots-tag': 'noindex' }), text: '<head><link rel="canonical" href="x"></head>' }).problems, ['x_robots_noindex']);
  assert.deepEqual(auditHtml({ status: 200, headers: h(), text: '<head><meta name="robots" content="noindex"></head>' }).problems, ['meta_noindex', 'canonical_missing']);
  assert.deepEqual(auditHtml({ status: 404, headers: h(), text: '' }).problems, ['http_404']);
});

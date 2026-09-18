import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PARTNER_NEWS_CONTRACT,
  normalizePartnerNewsScope,
  sanitizePartnerNewsInput,
} from '../partner-news-engine.js';
import { createPartnerNewsAdminAdapter, handlePartnerNewsRequest } from '../partner-news-control.js';

test('partner news contract is tenant/service scoped and private first', async () => {
  assert.equal(PARTNER_NEWS_CONTRACT.scope, 'tenant-service');
  assert.equal(PARTNER_NEWS_CONTRACT.defaultState, 'DRAFT');
  assert.equal(PARTNER_NEWS_CONTRACT.publicState, 'PUBLISHED');
  assert.equal(PARTNER_NEWS_CONTRACT.privateFirst, true);
  assert.equal(PARTNER_NEWS_CONTRACT.destructiveDelete, false);
  assert.equal(typeof createPartnerNewsAdminAdapter, 'function');
  assert.equal(typeof handlePartnerNewsRequest, 'function');
  const source = await readFile(new URL('../partner-news-engine.js', import.meta.url), 'utf8');
  assert.ok(source.includes("current.status !== 'REVIEW'"));
  assert.ok(source.includes('PARTNER_NEWS_REVIEW_REQUIRED'));
});

test('partner news validates reusable scope and HTTPS provenance', () => {
  assert.deepEqual(normalizePartnerNewsScope({ tenant:'ekodi-church', service:'church' }), {
    tenantSlug:'ekodi-church',
    serviceKey:'church',
  });
  assert.throws(() => normalizePartnerNewsScope({ tenant:'../bad', service:'church' }));
  const item = sanitizePartnerNewsInput({
    partnerName:'목포대학교',
    title:'협력 소식',
    sourceUrl:'https://example.org/news',
    imageUrl:'https://example.org/a.jpg',
    publishedOn:'2026-09-19',
    featured:true,
  });
  assert.equal(item.partnerName, '목포대학교');
  assert.equal(item.featured, true);
  assert.throws(() => sanitizePartnerNewsInput({ sourceUrl:'http://example.org' }));
});

test('partner news migration and API entrypoint preserve publication gate', async () => {
  const [migration, entry] = await Promise.all([
    readFile(new URL('../migrations/0086_partner_news_engine.sql', import.meta.url), 'utf8'),
    readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  ]);
  for (const marker of ['partner_news_items', "'DRAFT'", "'PUBLISHED'", 'partner_news_audit_logs']) {
    assert.ok(migration.includes(marker), `missing migration marker: ${marker}`);
  }
  assert.ok(!/DROP\s+TABLE/i.test(migration));
  assert.ok(entry.includes('handlePartnerNewsRequest'));
  assert.ok(entry.includes('/api/partner-news/public'));
  assert.ok(entry.includes('/api/church/admin/partner-news'));
});

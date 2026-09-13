import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_OPERATING_STATUSES,
  alternateStatusResponse,
  siteIdFromPublicPath
} from '../site-operating-status.js';
import { siteAdminSiteIdFromPath, siteOperatingStatusWidgetSource } from '../site-operating-status-widget.js';

test('site operating statuses expose the four administrator choices', () => {
  assert.deepEqual([...SITE_OPERATING_STATUSES], ['public', 'private', 'maintenance', 'development']);
});

test('private, maintenance and development render safe alternate screens', async () => {
  const expectations = [
    ['private', 403, '현재 비공개 사이트입니다'],
    ['maintenance', 503, '현재 점검 중입니다'],
    ['development', 503, '현재 개발 중입니다']
  ];
  for (const [status, code, title] of expectations) {
    const response = alternateStatusResponse(status);
    assert.equal(response.status, code);
    assert.equal(response.headers.get('x-ekodi-site-status'), status);
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
    assert.match(await response.text(), new RegExp(title));
  }
});

test('alternate screens escape customized administrator copy', async () => {
  const response = alternateStatusResponse('maintenance', { title: '<script>alert(1)</script>', message: '<b>safe</b>' });
  const html = await response.text();
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;safe&lt;\/b&gt;/);
});

test('public path site lookup covers dynamic and specially routed tenant roots but excludes admin', () => {
  assert.equal(siteIdFromPublicPath('/jadam'), 'jadam');
  assert.equal(siteIdFromPublicPath('/jadam/marketing'), 'jadam');
  assert.equal(siteIdFromPublicPath('/ekodibiz'), 'ekodibiz');
  assert.equal(siteIdFromPublicPath('/ekodibiz/invest'), 'ekodibiz');
  assert.equal(siteIdFromPublicPath('/jadam/admin'), '');
  assert.equal(siteIdFromPublicPath('/admin'), '');
  assert.equal(siteIdFromPublicPath('/api/control/site-status'), '');
});

test('site admin path resolves the actual tenant, including integrated store administration', () => {
  assert.equal(siteAdminSiteIdFromPath('/jadam/admin'), 'jadam');
  assert.equal(siteAdminSiteIdFromPath('/ekodibiz/invest/admin'), 'ekodibiz');
  assert.equal(siteAdminSiteIdFromPath('/cmpmyi/admin/jadam'), 'jadam');
  assert.equal(siteAdminSiteIdFromPath('/cmpmyi/admin/pizzamaru'), 'pizzamaru');
  assert.equal(siteAdminSiteIdFromPath('/cmpmyi/admin/yogurt'), 'yogurt');
  assert.equal(siteAdminSiteIdFromPath('/admin'), '');
});

test('admin widget source contains all four choices without embedding credentials', () => {
  const source = siteOperatingStatusWidgetSource();
  for (const label of ['공개', '비공개', '점검중', '개발중']) assert.match(source, new RegExp(label));
  assert.match(source, /cmpmyi/);
  assert.doesNotMatch(source, /sb_publishable_|service_role|SUPABASE_PUBLISHABLE_KEY/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { channelAdminServices, canonicalServiceChannelAdminPath } from '../admin-service-catalog.js';

const [worker, admin, broker, registry, loader] = await Promise.all([
  readFile(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../social-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../google-drive-storage-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
]);

test('YouTube OAuth supports repeated account selection and does not hard-lock EKODIBIZ to one named channel', () => {
  assert.match(broker, /prompt:'consent select_account'/);
  assert.ok(worker.includes("const requestedHint = clean(body.accountHint||registry?.login_hint||registry?.provider_account_id,180)"));
  assert.match(worker,/registryConnectionId/);
  assert.match(worker, /const selectedChannels = discoveredChannels/);
  assert.match(worker, /YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.doesNotMatch(worker, /EKODIMALL_YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.doesNotMatch(worker, /selectedChannels = discoveredChannels\.filter/);
});

test('OAuth connection ledger remains multi-resource and supports scoped soft disconnect with credential disposal', () => {
  assert.match(worker, /ON CONFLICT\(subject_type,subject_key,provider,resource_type,external_id\)/);
  assert.match(worker, /async function disconnectConnection/);
  assert.match(worker, /status='revoked',token_ciphertext='',token_expires_at=NULL/);
  assert.match(worker, /marketing_publish_channels SET status='credentials_required'/);
  assert.match(worker, /\/v1\\\/connections\\\/\(\\d\+\)\\\/disconnect/);
  assert.match(worker, /reconnectable:true/);
});

test('central admin exposes site-by-site channel handoffs plus the platform connection ledger', () => {
  assert.match(registry, /id: 'social'/);
  assert.match(registry, /채널·자동게시/);
  assert.match(loader, /social: \{ label:'채널·자동게시'/);
  assert.match(admin, /MULTI-CHANNEL CONTROL CENTER/);
  assert.match(admin, /사용자 사이트별 채널관리/);
  assert.match(admin, /loadChannelAdminDirectory/);
  assert.match(admin, /canonicalServiceChannelAdminUrl/);
  assert.match(admin, /data\.siteChannelAdmin=site\.id/);
  assert.match(admin, /채널·자동게시 관리 ↗/);
  assert.match(admin, /플랫폼 연결 원장 점검/);
  assert.match(admin, /YouTube 계정·채널 추가/);
  assert.match(admin, /Facebook · Instagram 계정 추가/);
  assert.match(admin, /Threads 계정 추가/);
  assert.match(admin, /disconnect\.dataset\.disconnectConnection/);
  assert.doesNotMatch(admin, /data-tenant-preset/);
});

test('site channel directory resolves to each canonical local administrator instead of central child-admin aliases', () => {
  const expected = new Map([
    ['biz','/ekodibiz/admin/publishing'],
    ['mall','/ekodimall/admin/channel-settings'],
    ['trade','/ekodibiz/trade/admin/publishing'],
    ['cgma','/cgma/admin/publishing'],
    ['jadam','/jadam/admin/publishing'],
    ['pizzamaru','/pizzamaru/admin/publishing'],
    ['yogurt','/yogurt/admin/publishing'],
  ]);
  const sites=channelAdminServices();
  assert.equal(sites.length,expected.size);
  for(const site of sites){
    assert.equal(canonicalServiceChannelAdminPath(site),expected.get(site.id),site.id);
    assert.ok(!canonicalServiceChannelAdminPath(site).startsWith('/admin/'),site.id);
  }
  assert.deepEqual(new Set(sites.map(site=>site.id)),new Set(expected.keys()));
});

test('central channel manager can scope connections to person, tenant or store without bypassing backend membership checks', () => {
  assert.match(admin, /\['person','내 계정'\],\['tenant','운영공간'\],\['store','매장'\]/);
  assert.match(admin, /params\.get\('social_scope'\)/);
  assert.match(admin, /params\.get\('social_subject'\)/);
  assert.match(admin, /params\.get\('social_connect'\)/);
  assert.match(admin, /\['youtube','meta','threads'\]\.includes\(requestedProvider\)/);
  assert.match(admin, /url\.searchParams\.delete\('social_connect'\)/);
  assert.match(admin, /queueMicrotask\(async\(\)=>/);
  assert.match(admin, /url\.searchParams\.set\('subject_type',connectionScope\.type\)/);
  assert.match(admin, /url\.searchParams\.set\('subject_key',connectionScope\.key\)/);
  assert.match(admin, /플랫폼 연결 원장 점검/);
  assert.doesNotMatch(admin, /tenantPresets/);
  assert.ok(admin.includes("const CONNECT_API = '/marketing-connect-api'"));
  assert.ok(admin.includes("new URL(`${CONNECT_API}${path}`, location.origin)"));
  assert.doesNotMatch(admin, /marketing-connect-api\.ekodi\.kr/);
  assert.match(worker, /customer_access_grants WHERE tenant_id=\? AND email=\?/);
  assert.match(worker, /if \(write && !subject\.writable\) return \{ error:'SUBJECT_READ_ONLY'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration,worker,admin] = await Promise.all([
  readFile(new URL('../migrations/0111_channel_site_bindings.sql', import.meta.url),'utf8'),
  readFile(new URL('../marketing-publishing-worker.js', import.meta.url),'utf8'),
  readFile(new URL('../social-admin.js', import.meta.url),'utf8'),
]);

test('channel-site binding migration is additive and enforces one default per site',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS channel_site_bindings/);
  assert.match(migration,/FOREIGN KEY\(channel_id\) REFERENCES marketing_publish_channels\(id\) ON DELETE CASCADE/);
  assert.match(migration,/UNIQUE\(subject_type, subject_key, channel_id, service_id\)/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_site_bindings_default/);
  assert.match(migration,/WHERE is_default = 1 AND enabled = 1/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM marketing_publish_channels/i);
});

test('publishing API exposes reusable channel-site bindings and site-driven channel resolution',()=>{
  assert.match(worker,/EKODI_SERVICE_MANIFEST, serviceForId/);
  assert.match(worker,/function channelSiteCatalog\(\)/);
  assert.match(worker,/async function replaceChannelSites/);
  assert.match(worker,/async function listSitePublishingChannels/);
  assert.match(worker,/async function resolveSiteChannelIds/);
  assert.match(worker,/\/v1\/channel-sites\/catalog/);
  assert.match(worker,/\/v1\/channels\\\/\(\\d\+\)\\\/sites/);
  assert.match(worker,/\/v1\/sites\\\/\(\[\^\/\]\+\)\\\/channels/);
  assert.match(worker,/requestedSiteIds/);
  assert.match(worker,/siteChannelIds=await resolveSiteChannelIds/);
  assert.match(worker,/channelSiteBindings:siteBindingReady/);
});

test('central social admin can register publishing channels and bind them to sites',()=>{
  assert.match(admin,/async function publishingApi/);
  assert.match(admin,/YouTube 게시 채널 등록/);
  assert.match(admin,/게시 채널 · 사이트 연결/);
  assert.match(admin,/지난행사 자동등록/);
  assert.match(admin,/\/v1\/oauth\/youtube\/start/);
  assert.match(admin,/\/v1\/channels\/\$\{encodeURIComponent\(channel\.id\)\}\/sites/);
  assert.match(admin,/loadPublishingChannels/);
});

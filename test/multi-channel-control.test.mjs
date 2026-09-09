import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [worker, admin, broker, registry, loader] = await Promise.all([
  readFile(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../social-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../google-drive-storage-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
]);

test('YouTube OAuth supports repeated account selection and does not hard-lock EKODIBIZ to one named channel', () => {
  assert.match(broker, /prompt:'consent select_account'/);
  assert.match(worker, /const requestedHint = clean\(body\.accountHint,180\)/);
  assert.match(worker, /const selectedChannels = discoveredChannels/);
  assert.match(worker, /YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.doesNotMatch(worker, /EKODIMALL_YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.doesNotMatch(worker, /selectedChannels = discoveredChannels\.filter/);
});

test('OAuth connection ledger remains multi-resource and supports scoped soft disconnect with credential disposal', () => {
  assert.match(worker, /ON CONFLICT\(subject_type,subject_key,provider,resource_type,external_id\)/);
  assert.match(worker, /async function disconnectConnection/);
  assert.match(worker, /status='revoked',token_ciphertext='',token_expires_at=NULL/);
  assert.match(worker, /marketing_publish_channels SET status='disconnected'/);
  assert.match(worker, /\/v1\\\/connections\\\/\(\\d\+\)\\\/disconnect/);
  assert.match(worker, /reconnectable:true/);
});

test('central admin exposes one multi-channel account control center instead of a duplicate menu', () => {
  assert.match(registry, /id: 'social'/);
  assert.match(registry, /채널·계정 연결/);
  assert.match(loader, /social: \{ label:'채널·계정 연결'/);
  assert.match(admin, /MULTI-CHANNEL CONTROL CENTER/);
  assert.match(admin, /YouTube 계정·채널 추가/);
  assert.match(admin, /Facebook · Instagram 계정 추가/);
  assert.match(admin, /Threads 계정 추가/);
  assert.match(admin, /disconnect\.dataset\.disconnectConnection/);
});

test('central channel manager can scope connections to person, tenant or store without bypassing backend membership checks', () => {
  assert.match(admin, /\['person','내 계정'\],\['tenant','운영공간'\],\['store','매장'\]/);
  assert.match(admin, /url\.searchParams\.set\('subject_type',connectionScope\.type\)/);
  assert.match(admin, /url\.searchParams\.set\('subject_key',connectionScope\.key\)/);
  assert.match(worker, /customer_access_grants WHERE tenant_id=\? AND email=\?/);
  assert.match(worker, /if \(write && !subject\.writable\) return \{ error:'SUBJECT_READ_ONLY'/);
});

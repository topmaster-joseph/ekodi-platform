import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workspace=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const store=await readFile(new URL('../store-admin-engine.js',import.meta.url),'utf8');
const growth=await readFile(new URL('../marketing-growth-worker.js',import.meta.url),'utf8');
const external=await readFile(new URL('../external-account-control.js',import.meta.url),'utf8');

test('workspace and store admins consume the shared channel catalog',()=>{
  assert.match(workspace,/channelTargetOptions/);
  assert.match(workspace,/지원 채널 · 게시형식/);
  assert.match(workspace,/targetOptions/);
  assert.doesNotMatch(workspace,/<option value='meta'>Facebook · Instagram<\/option>/);
  assert.match(store,/channelTargetOptions/);
  assert.match(store,/지원 채널 · 게시형식/);
  assert.doesNotMatch(store,/<option value=\"meta\">Facebook · Instagram<\/option>/);
});

test('growth health exposes expanded platform readiness without faking adapters',()=>{
  assert.match(growth,/naverConfigured/);
  assert.match(growth,/tiktokConfigured/);
  assert.match(growth,/kakaoConfigured/);
  assert.match(growth,/channelCatalogSnapshot\(platform\)/);
});

test('external account registry accepts TikTok alongside existing Naver and Kakao',()=>{
  assert.match(external,/id:'naver'.*services:\['business','blog','search-ad'\]/s);
  assert.match(external,/id:'kakao'.*services:\['channel','business','message'\]/s);
  assert.match(external,/id:'tiktok'.*services:\['content','creator'\]/s);
});

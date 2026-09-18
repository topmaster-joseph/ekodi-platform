import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { realtimeTenantAdminFromPath, realtimeTenantList } from '../realtime-tenant-registry.js';
import { tenantLiveAdminPage } from '../tenant-live-admin-page.js';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('every realtime tenant has the same canonical live admin path',()=>{
  for(const tenant of realtimeTenantList()){
    const path=tenant.path.replace(/\/$/,'')+'/admin';
    assert.equal(realtimeTenantAdminFromPath(path)?.id,tenant.id,tenant.id);
  }
});

test('tenant live admin exposes recording management actions',async()=>{
  const tenant=realtimeTenantList()[0];
  const response=tenantLiveAdminPage(tenant);
  const html=await response.text();
  assert.match(html,/방송 · 녹화 관리/);
  assert.match(html,/라이브 스튜디오/);
  const source=await read('tenant-live-admin-page.js');
  for(const label of ['재생','다운로드','YouTube 게시','삭제','보존기간']) assert.match(source,new RegExp(label));
  assert.match(source,/visibility/);
  assert.match(source,/\/recordings\?tenant=/);
});

test('shared tenant admin shell injects the canonical live manager link',async()=>{
  const shell=await read('tenant-admin-command-home.js');
  assert.match(shell,/function liveAdminPath\(\)/);
  assert.match(shell,/base\+'\/live\/admin'/);
  assert.match(shell,/방송 · 녹화/);
  assert.match(shell,/ekodiLiveAdminLink/);
});

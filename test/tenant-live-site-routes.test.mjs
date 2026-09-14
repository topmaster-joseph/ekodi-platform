import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import siteWorker from '../site-worker.js';
import { realtimeTenantList } from '../realtime-tenant-registry.js';

test('shared tenant Live paths render on ekodi.kr with isolated tenant identity',async()=>{
  for(const tenant of realtimeTenantList().filter(item=>!item.dedicated)){
    const response=await siteWorker.fetch(new Request(`https://ekodi.kr${tenant.path}`),{});
    assert.equal(response.status,200,tenant.id);
    const html=await response.text();
    assert.match(html,new RegExp(`data-tenant="${tenant.apiTenant}"`),tenant.id);
    assert.match(html,/\/tenant-live\.js/,tenant.id);
    assert.match(html,/공개 방송은 로그인 없이 시청/,tenant.id);
  }
});

test('shared Live auth handoff exchanges EKODI proof without third-party script CDN',async()=>{
  const source=await readFile(new URL('../tenant-live.js',import.meta.url),'utf8');
  assert.match(source,/ekodi_token/);
  assert.match(source,/\/auth\/v1\/verify/);
  assert.match(source,/sessionStorage\.setItem\('ekodi-auth-token'/);
  assert.doesNotMatch(source,/cdn\.jsdelivr\.net|esm\.sh/);
});
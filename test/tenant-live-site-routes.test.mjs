import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import siteWorker from '../site-worker.js';
import platformRouter from '../platform-router-entry-worker.js';
import { realtimeTenantList } from '../realtime-tenant-registry.js';

test('shared tenant Live paths render on ekodi.kr with isolated tenant identity',async()=>{
  for(const tenant of realtimeTenantList().filter(item=>!item.dedicated)){
    const response=await siteWorker.fetch(new Request(`https://ekodi.kr${tenant.path}`),{});
    assert.equal(response.status,200,tenant.id);
    const html=await response.text();
    assert.match(html,new RegExp(`data-tenant="${tenant.apiTenant}"`),tenant.id);
    assert.match(html,/\/tenant-live\.js/,tenant.id);
    assert.match(html,/공개 방송은 로그인 없이 시청/,tenant.id);
    assert.match(html,/id="openViewerButton"/,tenant.id);
    assert.match(html,/시청 화면 새 탭으로 열기/,tenant.id);
    const apex=await platformRouter.fetch(new Request(`https://ekodi.kr${tenant.path}`),{});
    assert.equal(apex.status,200,`apex ${tenant.id}`);
    const apexHtml=await apex.text();
    assert.match(apexHtml,new RegExp(`data-tenant=\"${tenant.apiTenant}\"`),`apex ${tenant.id}`);
    assert.match(apexHtml,/\/tenant-live\.js/,`apex ${tenant.id}`);
    if(tenant.robots)assert.equal(apex.headers.get('x-robots-tag'),tenant.robots,`robots ${tenant.id}`);
    if(tenant.route)assert.equal(apex.headers.get('x-ekodi-route'),tenant.route,`route ${tenant.id}`);
    if(tenant.independentSite)assert.equal(apex.headers.get('x-ekodi-independent-site'),'true',`independent ${tenant.id}`);
    if(tenant.workspace)assert.equal(apex.headers.get('x-ekodi-workspace'),tenant.workspace,`workspace ${tenant.id}`);
  }
});

test('shared Live auth handoff exchanges EKODI proof without third-party script CDN',async()=>{
  const source=await readFile(new URL('../tenant-live.js',import.meta.url),'utf8');
  assert.match(source,/ekodi_token/);
  assert.match(source,/\/auth\/v1\/verify/);
  assert.match(source,/sessionStorage\.setItem\('ekodi-auth-token'/);
  assert.match(source,/openViewerWindow/);
  assert.match(source,/link\.target='_blank'/);
  assert.match(source,/link\.rel='noopener noreferrer'/);
  assert.match(source,/addEventListener\('pagehide',hostExitCleanup\)/);
  assert.match(source,/beforeunload/);
  assert.match(source,/waitForRemoteTracks/);
  assert.match(source,/publisher_media_unavailable/);
  assert.match(source,/실시간 방송 수신 중입니다/);
  assert.doesNotMatch(source,/cdn\.jsdelivr\.net|esm\.sh/);
});
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
    assert.match(html,/공개 방송은 바로 시청/,tenant.id);
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
    if(tenant.workspace==='ekodimission'){
      assert.match(html,/class="mission-site-header"/,tenant.id);
      assert.match(html,/data-mission-nav/,tenant.id);
      assert.match(html,/\/ekodimission\/assets\/shell\.css/,tenant.id);
      assert.match(html,/\/ekodimission\/assets\/shell\.js/,tenant.id);
      assert.doesNotMatch(html,/class="live-header"/,tenant.id);
    }else{
      assert.match(html,/class="live-header"/,tenant.id);
      assert.doesNotMatch(html,/data-mission-nav/,tenant.id);
    }
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
  assert.match(source,/media_tracks_not_ready/);
  assert.match(source,/attempt<5/);
  assert.match(source,/재연결 중/);
  assert.match(source,/시청 중/);
  assert.match(source,/viewerTracksForLanguage/);
  assert.doesNotMatch(source,/cdn\.jsdelivr\.net|esm\.sh/);
});

test('canonical short QR camera route stays separate from viewer and participant surfaces',async()=>{
  const response=await platformRouter.fetch(new Request('https://ekodi.kr/live/c/AB12CD34'),{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'live-aux-camera');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  const html=await response.text();
  assert.match(html,/data-camera-code="AB12CD34"/);
  assert.match(html,/id="auxCameraPreview"/);
  assert.match(html,/id="auxCameraConnectButton"/);
  assert.match(html,/관리자 승인 후 연결됩니다/);
  assert.doesNotMatch(html,/id="requestSpeakButton"/);
});

test('platform entry router reserves /live/admin before generic workspace admin routing',async()=>{
  for(const tenant of realtimeTenantList()){
    const path=tenant.path.replace(/\/$/,'')+'/admin';
    const response=await platformRouter.fetch(new Request(`https://ekodi.kr${path}`),{});
    assert.equal(response.status,200,tenant.id);
    const html=await response.text();
    assert.match(html,/방송 · 녹화 관리/,tenant.id);
    assert.match(html,new RegExp(`data-tenant="${tenant.apiTenant}"`),tenant.id);
    assert.doesNotMatch(html,/<h1[^>]*>대시보드<\/h1>/,tenant.id);
  }
  const css=await platformRouter.fetch(new Request('https://ekodi.kr/tenant-live-admin.css'),{});
  assert.equal(css.status,200);
  assert.match(css.headers.get('content-type')||'',/text\/css/);
  const script=await platformRouter.fetch(new Request('https://ekodi.kr/tenant-live-admin.js'),{});
  assert.equal(script.status,200);
  assert.match(script.headers.get('content-type')||'',/javascript/);
});


test('canonical /live and /live/admin are owned by the apex Live service',async()=>{
  const hub=await platformRouter.fetch(new Request('https://ekodi.kr/live/'),{});
  assert.equal(hub.status,200);
  assert.equal(hub.headers.get('location'),null);
  assert.equal(hub.headers.get('x-ekodi-route'),'live-service-hub');
  const hubHtml=await hub.text();
  assert.match(hubHtml,/라이브 방송 전문서비스|LIVE BROADCAST PROFESSIONAL SERVICE/);
  assert.doesNotMatch(hubHtml,/EKODI Auth/);

  const admin=await platformRouter.fetch(new Request('https://ekodi.kr/live/admin'),{});
  assert.equal(admin.status,200);
  assert.equal(admin.headers.get('location'),null);
  assert.equal(admin.headers.get('x-ekodi-route'),'live-service-admin');
  assert.equal(admin.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  const adminHtml=await admin.text();
  assert.match(adminHtml,/라이브 전문서비스 관리/);
  assert.match(adminHtml,/return_to=https%3A%2F%2Fekodi.kr%2Flive%2Fadmin/);
  assert.doesNotMatch(adminHtml,/source=live\.ekodi\.kr/);
});

test('Live public visibility control can hide a tenant route without blocking its admin route',async()=>{
  const DB={prepare(){return{bind(){return{first:async()=>({public_status:'maintenance'})}}}}};
  const hidden=await platformRouter.fetch(new Request('https://ekodi.kr/ekodibiz/live/'),{DB});
  assert.equal(hidden.status,200);
  assert.match(await hidden.text(),/관리자 검수 또는 준비 상태/);

  const admin=await platformRouter.fetch(new Request('https://ekodi.kr/ekodibiz/live/admin'),{DB});
  assert.equal(admin.status,200);
  assert.match(await admin.text(),/방송 · 녹화 관리/);
});

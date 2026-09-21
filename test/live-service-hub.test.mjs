import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { liveServiceAdminPage, liveServicePage } from '../live-service-page.js';
import { realtimeTenantList } from '../realtime-tenant-registry.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const escapeRe=value=>String(value).replace(/[|\\{}()[\]^$+*?.-]/g,'\\$&');

test('Live hub lists the registered tenant Live surfaces on the canonical apex path',async()=>{
  const response=liveServicePage();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'live-service-hub');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const html=await response.text();
  assert.match(html,/EKODI Live/);
  assert.match(html,/라이브 서비스 사이트/);
  assert.match(html,/href="\/live\/admin"/);
  assert.match(html,/id="live-sites"/);
  assert.match(html,/class="hero-actions"/);
  assert.match(html,/@media\(max-width:720px\)/);
  assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  for(const tenant of realtimeTenantList()){
    assert.match(html,new RegExp(escapeRe(tenant.path)),tenant.id);
    assert.match(html,new RegExp(escapeRe(tenant.name)),tenant.id);
  }
  assert.doesNotMatch(html,/https:\/\/live\.ekodi\.kr/);
});

test('Live admin preserves its own central-auth return target and exposes per-site admin menus',async()=>{
  const response=liveServiceAdminPage();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'live-service-admin');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  const html=await response.text();
  assert.match(html,/EKODI Live 관리자/);
  assert.match(html,/return_to=https%3A%2F%2Fekodi.kr%2Flive%2Fadmin/);
  assert.match(html,/공개 여부 · 방송관리 · 하위관리자 메뉴/);
  assert.match(html,/@media\(max-width:640px\)/);
  assert.match(html,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(html,/\.site-menu\{display:grid;grid-template-columns:1fr 1fr/);
  for(const tenant of realtimeTenantList()){
    const liveAdmin=tenant.path.replace(/\/$/,'')+'/admin';
    const siteAdmin=tenant.home.replace(/\/$/,'')+'/admin';
    assert.match(html,new RegExp(escapeRe(liveAdmin)),tenant.id);
    assert.match(html,new RegExp(escapeRe(siteAdmin)),tenant.id);
  }
  assert.doesNotMatch(html,/source=live\.ekodi\.kr/);
});

test('central admin auth explicitly accepts /live/admin as a safe apex return',async()=>{
  const source=await read('auth-site/admin-auth.js');
  assert.match(source,/u\.pathname==='\/live\/admin'/);
  assert.match(source,/u\.pathname\.startsWith\('\/live\/admin\/'\)/);
});

test('Control API derives Live visibility records from the shared realtime tenant registry',async()=>{
  const source=await read('api-worker.js');
  assert.match(source,/realtimeTenantList/);
  assert.match(source,/LIVE_PUBLIC_SITE_CATALOG/);
  assert.match(source,/defaultPublicStatus: 'public'/);
  assert.match(source,/defaultMaintenanceTitle: '라이브 서비스 준비 중입니다'/);
});

test('service manifest advertises canonical apex Live as an active public surface',async()=>{
  const manifest=await read('ekodi-service-manifest.js');
  assert.match(manifest,/id:'live'.*url:'https:\/\/ekodi\.kr\/live'.*defaultSurface:'public'.*state:'live'/);
  assert.doesNotMatch(manifest,/id:'live'.*url:'https:\/\/live\.ekodi\.kr\//);
});


test('Shared Site release watches and packages Live hub and QR camera UI',async()=>{
  const [workflow,build,site]=await Promise.all([
    read('.github/workflows/deploy-site-core.yml'),
    read('scripts/build.mjs'),
    read('site-worker.js'),
  ]);
  for(const file of ['live-service-page.js','tenant-live-page.js','tenant-live.js','tenant-live.css','qr-code-v2.js']) assert.match(workflow,new RegExp(file.replaceAll('.','\\.')));
  assert.match(workflow,/test\/live-service-hub\.test\.mjs/);
  assert.match(build,/qr-code-v2\.js/);
  assert.match(site,/['"]\/qr-code-v2\.js['"]/);
});

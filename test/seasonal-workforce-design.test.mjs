import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFileSync} from 'node:fs';
import {PUBLIC_PAGES,SITE_BASE} from '../seasonal-workforce/public-pages.mjs';
import {portalCss,portalClientScript} from '../seasonal-workforce/public-assets.mjs';
import {seasonalPortalResponse} from '../seasonal-workforce/route.mjs';

const ROOT='https://ekodi.kr'+SITE_BASE;
const paths=['/','/demand','/mou','/learning','/housing','/entry','/help','/reports','/office'];
test('real subservice navigation is complete, without duplicate title menus',()=>{
 const home=PUBLIC_PAGES['/'];
 for(const path of paths.slice(1))assert.match(home,new RegExp('href="'+SITE_BASE+path.replace(/\//g,'\\/')+'"'));
 assert.match(home,/국제협력/);
 assert.match(home,/신청이나 근로자 개인정보 접수는 하지 않습니다/);
 assert.doesNotMatch(home,/참여 농가 수.*[1-9][0-9][0-9]|입국 근로자 수.*[1-9][0-9][0-9]/);
});
test('every public route returns Korean HTML, restrictive caching and CSP',async()=>{
 for(const path of paths){
  const response=seasonalPortalResponse(new Request(ROOT+path));
  assert.equal(response.status,200,path);
  const html=await response.text();
  assert.match(html,/<html lang="ko">/,path);
  assert.match(html,/제안용|준비단계/,path);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(html,/theme\.css/,path);
 }
});
test('stylesheet and client script are first-party and current source matches generated Worker asset',async()=>{
 const css=(await seasonalPortalResponse(new Request(ROOT+'/theme.css')).text());
 const js=(await seasonalPortalResponse(new Request(ROOT+'/public.js')).text());
 assert.equal(css,portalCss);
 assert.equal(js,portalClientScript);
 assert.equal(css,readFileSync(new URL('../seasonal-workforce/theme.css',import.meta.url),'utf8'));
 assert.equal(js,readFileSync(new URL('../seasonal-workforce/public.js',import.meta.url),'utf8'));
 assert.doesNotThrow(()=>new Script(js));
 assert.match(css,/--navy/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|WebSocket|indexedDB/);
});
test('demand page collects only anonymous planning numbers and does not submit',()=>{
 const page=PUBLIC_PAGES['/demand'];
 assert.match(page,/swp-demand-form/);
 assert.match(page,/swp-demand-result/);
 assert.match(page,/서버에 전송되거나 저장되지 않습니다/);
 for(const privateTerm of ['name="farmer-name"','name="phone"','name="passport"','name="address"'])
  assert.doesNotMatch(page,new RegExp(privateTerm));
 assert.match(portalClientScript,/addEventListener\('submit'/);
 assert.match(portalClientScript,/preventDefault\(\)/);
});
test('MOU preview and filters are templates, never fabricated signed agreements',()=>{
 const mou=PUBLIC_PAGES['/mou'];
 assert.match(mou,/data-mou-filter/);
 assert.match(mou,/data-mou-row/);
 assert.match(mou,/실제 서명·체결 문서가 아닙니다/);
 assert.match(mou,/공식 협약 자료 확인 전/);
 assert.doesNotMatch(mou,/2024\.10\.16|비엔티안주.*유효/);
});
test('education and housing checklists are client-only, no certification',()=>{
 assert.match(PUBLIC_PAGES['/learning'],/data-check-progress/);
 assert.match(PUBLIC_PAGES['/housing'],/data-housing-check/);
 assert.match(PUBLIC_PAGES['/housing'],/법정 판단은 관계기관/);
 assert.match(portalClientScript,/getAttribute\('data-mou-filter'\)/);
});
test('reports never show fake official operational metrics',()=>{
 const page=PUBLIC_PAGES['/reports'];
 assert.match(page,/운영자료 연결 전/);
 assert.match(page,/가상 인원·국가·비율을 표시하지 않습니다/);
 assert.match(page,/swp-metric-form/);
});
test('legacy anonymous survey remains available and private API stays fail-closed',async()=>{
 assert.equal(seasonalPortalResponse(new Request(ROOT+'/survey-demo')).status,200);
 const r=seasonalPortalResponse(new Request(ROOT+'/api/unapproved', {method:'POST'}));
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{ok:false,error:'applications_not_enabled'});
});
test('only exact canonical routes are served; arbitrary nested URL is rejected',()=>{
 assert.equal(seasonalPortalResponse(new Request(ROOT+'/path-does-not-exist')).status,404);
 assert.equal(seasonalPortalResponse(new Request(ROOT+'/mou',{method:'POST'})).status,405);
 assert.equal(seasonalPortalResponse(new Request('https://another.example'+SITE_BASE+'/mou')).status,403);
});

test('guarded Shared Site release owns all seasonal pages and smoke-verifies real HTML',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
 assert.match(workflow,/'seasonal-workforce\/\*\*'/);
 const nativeRoutes='surface_paths: /,/my/,/admin/,/ekodimall/admin,/control,/ekodibiz/seasonal-workers/,/ekodibiz/seasonal-workers/demand,/ekodibiz/seasonal-workers/mou,/ekodibiz/seasonal-workers/office';
 assert.equal(workflow.split(nativeRoutes).length-1,2,'desktop and mobile must both exercise seasonal portal routes');
 const expected=['/','/demand','/mou','/learning','/housing','/entry','/help','/reports','/office','/theme.css','/public.js'];
 for(const page of expected){
  const path='https://ekodi.kr'+SITE_BASE+page;
  const hits=manifest.worker.requests.filter(r=>r.url===path);
  assert.equal(hits.length,1,'expected exact smoke route: '+path);
  assert.deepEqual(hits[0].statuses,[200]);
  assert.equal(hits[0].rollbackVerify,false);
 }
 assert.equal(manifest.worker.requests.some(r=>r.url==='https://ekodi.kr'+SITE_BASE+'/api/v1/tenants/muan/demands'),false);
});

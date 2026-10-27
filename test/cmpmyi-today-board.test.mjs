import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { storePortfolioAdminPage } from '../store-portfolio-admin-page.js';
import { storePortfolioTodayPage, storePortfolioTodayScript, TODAY_STORES } from '../store-portfolio-today.js';

test('CMPMYI opens on 오늘의 3매장 with a phone bottom tab bar (design A on PC, B on phones)',async()=>{
  const html=await storePortfolioAdminPage().text();
  assert.match(html,/src="\/cmpmyi\/admin\/panel\/today"/);
  assert.match(html,/data-cmpmyi-today-link/);
  for(const go of ['today','orders','pay','promo','menu'])assert.match(html,new RegExp(`data-mobile-go="${go}"`));
  assert.match(html,/@media \(max-width:760px\), \(pointer:coarse\) and \(max-width:1024px\)\{[\s\S]*?\.portfolio-sidebar\{display:none\}/);
  // explicit agent route still starts on the agent view
  assert.match(await storePortfolioAdminPage('agent').text(),/src="\/cmpmyi\/admin\/panel\/agent"/);
});

test('today panel: same-origin frame page, strict CSP, three stores only',async()=>{
  const r=storePortfolioTodayPage();const html=await r.text();
  assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'; connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co; frame-ancestors 'self'/);
  assert.match(html,/src="\/cmpmyi\/admin\/today\.js"/);
  assert.deepEqual(TODAY_STORES.map(s=>s.slug),['jadam','pizzamaru','yogurt']);
  for(const s of TODAY_STORES)assert.match(html,new RegExp(`data-today-filter="${s.slug}"`));
});

test('today client: per-store workspace APIs, approval via store-promo, no invented numbers, keepNames-safe',async()=>{
  const js=await storePortfolioTodayScript().text();
  for(const p of ['/v1/store-sms/orders','/v1/store-terminal/payments','/v1/store-promo/week','/approve'])assert.ok(js.includes(p),p);
  assert.match(js,/subject_key/);
  assert.match(js,/단말기 결제 기록 기준/);
  assert.ok(js.startsWith('(()=>{const __name='),'serialized client carries the private __name prelude');
  new Function(js); // parses
});

test('router serves the today panel and script; store mobile console honours ?tab=',()=>{
  const router=fs.readFileSync('platform-router-entry-worker.js','utf8');
  assert.match(router,/'\/cmpmyi\/admin\/today\.js'\)return storePortfolioTodayScript\(\)/);
  assert.match(router,/'\/cmpmyi\/admin\/panel\/today'.*return storePortfolioTodayPage\(\)/);
  const idxToday=router.indexOf("'/cmpmyi/admin/panel/today'"),idxGeneric=router.indexOf('const cmpmyiPanel=');
  assert.ok(idxToday>0&&idxToday<idxGeneric,'today route precedes the generic panel route');
  assert.match(fs.readFileSync('store-admin-engine.js','utf8'),/get\('tab'\);return\['new','active','done','promo','pay'\]\.includes\(t\)/);
});

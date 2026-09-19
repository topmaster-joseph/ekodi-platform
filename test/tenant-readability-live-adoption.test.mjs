import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('tenant readability injector stays brand-neutral and idempotent',async()=>{
  const [injector,css]=await Promise.all([
    read('ekodi-shell-injector.js'),
    read('shell/user-ui-shell.css'),
  ]);
  assert.match(injector,/export function injectEkodiTenantReadability/);
  assert.match(injector,/x-ekodi-tenant-readability/);
  assert.match(injector,/data-ekodi-tenant-readability/);
  assert.match(injector,/mobile-fixed-header\.js/);
  assert.match(injector,/data-ekodi-fixed-header/);
  assert.match(injector,/x-ekodi-shell/);
  assert.match(injector,/x-ekodi-user-ui/);
  assert.doesNotMatch(injector,/function injectEkodiTenantReadability[\s\S]*fallbackHeader\(/);
  assert.match(css,/Brand-neutral tenant readability v1/);
  assert.match(css,/html\[data-ekodi-tenant-readability="v1"\]/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/text-wrap:balance/);
});

test('live mobile verifier checks canonical apex tenant paths only',async()=>{
  const verifier=await read('scripts/verify-mobile-fixed-headers-live.mjs');
  for(const url of [
    'https://ekodi.kr/jadam',
    'https://ekodi.kr/pizzamaru',
    'https://ekodi.kr/yogurt',
    'https://ekodi.kr/cgma',
    'https://ekodi.kr/cgma/market-ai',
    'https://ekodi.kr/cgma/admin',
  ]) assert.ok(verifier.includes(url),`missing canonical verifier target: ${url}`);
  const origins=[...verifier.matchAll(/https:\/\/[^/'"`]+/g)].map(match=>match[0]);
  assert.ok(origins.length>0);
  assert.ok(origins.every(origin=>origin==='https://ekodi.kr'));
  assert.match(verifier,/tenant-readability-css/);
  assert.match(verifier,/live-readability-not-observed/);
});

test('remaining canonical business, trade and lab surfaces inherit a readability contract',async()=>{
  const [router,canonical,verifier]=await Promise.all([
    read('platform-router-entry-worker.js'),
    read('canonical-surface-router.js'),
    read('scripts/verify-mobile-fixed-headers-live.mjs'),
  ]);
  assert.match(router,/routeEkodiBizPublic[\s\S]*injectEkodiProgressiveHome\(injectEkodiTenantReadability\(rewritten\)\)/);
  assert.match(router,/isTradePartnerPath\(url\.pathname\)\)return injectEkodiTenantReadability\(tradePartnerPage\(\)\)/);
  assert.match(canonical,/executionSurface\.id==='lab'\?injectEkodiTenantReadability\(response\):response/);
  assert.match(verifier,/requireReadability\(cgmaRoot,'cgma-root',errors\)/);
  assert.doesNotMatch(verifier,/need\(cgmaRoot,'cgma-root','data-ekodi-tenant-readability/);
});


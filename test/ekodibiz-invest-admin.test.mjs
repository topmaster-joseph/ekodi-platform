import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODIBIZ_INVEST_ADMIN, ekodiBizInvestAdminPage, isEkodiBizInvestAdminPath } from '../ekodibiz-invest-admin-page.js';

test('EKODIBIZ Invest admin uses nested site-local canonical paths',()=>{
  for(const path of ['/ekodibiz/invest/admin','/ekodibiz/invest/admin/projects','/ekodibiz/invest/admin/ir','/ekodibiz/invest/admin/connect','/ekodibiz/invest/admin/programs']) assert.equal(isEkodiBizInvestAdminPath(path),true,path);
  assert.equal(isEkodiBizInvestAdminPath('/ekodibiz/invest'),false);
  assert.equal(isEkodiBizInvestAdminPath('/ekodibiz/invest/admin/unknown'),false);
  assert.equal(EKODIBIZ_INVEST_ADMIN.canonicalPath,'/ekodibiz/invest/admin');
});

test('local Invest admin is no-store and preserves the regulated transaction boundary',async()=>{
  const response=ekodiBizInvestAdminPage(new Request('https://ekodi.kr/ekodibiz/invest/admin/ir'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-ekodi-route'),'public-ekodibiz-invest-admin');
  const html=await response.text();
  assert.match(html,/data-ekodi-admin-surface="local"/);assert.match(html,/IR · 투자유치/);assert.match(html,/투자금 수취·증권 주문·체결·수탁·수익보장/);
});
test('shared site routes Invest admin before the generic workspace-admin matcher',async()=>{
  const source=await readFile(new URL('../site-worker.js',import.meta.url),'utf8');
  const local=source.indexOf('isEkodiBizInvestAdminPath(url.pathname)');
  const generic=source.indexOf('isWorkspaceAdminPath(url.pathname)');
  assert.ok(local>0);assert.ok(generic>local);
  assert.match(source,/injectEkodiShell\(secured, 'biz', 'admin'\)/);
});

test('common Invest admin keeps the existing central service-admin handoff contract',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/service-admin-entry.worker.json',import.meta.url),'utf8'));
  const probe=manifest.worker.requests.find(item=>item.url==='https://invest.ekodi.kr/admin');
  assert.ok(probe);assert.deepEqual(probe.statuses,[307]);
  assert.ok(probe.headerExpect.some(value=>value.includes('location: https://admin.ekodi.kr/')));
});

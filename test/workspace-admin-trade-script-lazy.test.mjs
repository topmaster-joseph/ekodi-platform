import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceAdminPage} from '../workspace-admin-page.js';

const TRADE_SCRIPT='/workspace-trade-admin.js?v=20260909-admin-ui-v8';
const MAIN_SCRIPT='/workspace-admin.js?v=20261002-common-engine-ui-v1';

test('mall and other workspace admin routes load common shell without trade-only JS',async()=>{
  for(const pathname of ['/ekodimall/admin','/ekodimall/admin/sourcing','/ekodimall/admin/channel-settings',
    '/cgma/admin','/ekodimission/admin/services','/ekodibiz/admin','/ekodilab/admin/services']){
    const response=workspaceAdminPage(pathname);
    const html=await response.text();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.ok(html.includes(MAIN_SCRIPT),pathname+' needs common auth and menus');
    assert.ok(!html.includes(TRADE_SCRIPT),pathname+' must avoid unused trade JS');
    assert.match(html,/data-ekodi-authority-scope="tenant"/);
  }
});
test('trade paths preserve the full trade-only app, including deep routes',async()=>{
  for(const pathname of ['/ekodibiz/trade/admin','/ekodibiz/trade/admin/companies',
    '/ekodibiz/trade/admin/products/detail','/trade/trade/admin']){
    const html=await workspaceAdminPage(pathname).text();
    assert.ok(html.includes(MAIN_SCRIPT),pathname+' common script');
    assert.ok(html.includes(TRADE_SCRIPT),pathname+' trade script');
  }
});
test('unspecified pathname preserves legacy direct API callers',async()=>{
  assert.ok((await workspaceAdminPage().text()).includes(TRADE_SCRIPT));
});
test('both production route owners pass actual requested pathname for targeted loading',()=>{
  const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  const site=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  assert.equal((router.match(/workspaceAdminPage\(url\.pathname\)/g)||[]).length,3);
  assert.equal((site.match(/workspaceAdminPage\(url\.pathname\)/g)||[]).length,1);
  assert.ok(!router.includes("workspaceAdminPage(),'space','admin'"));
  assert.ok(!site.includes("workspaceAdminPage(), 'space', 'admin'"));
});
test('tenant script selection never embeds route data into generated HTML or changes auth',async()=>{
  const html=await workspaceAdminPage('/ekodimall/admin?token=secret').text();
  assert.ok(!html.includes('secret'),'route is tested, never rendered');
  assert.ok(html.includes(MAIN_SCRIPT));
  assert.ok(!html.includes(TRADE_SCRIPT));
  assert.ok((await workspaceAdminPage('/ekodimall/admin').headers).get('content-security-policy')?.includes("frame-ancestors 'none'"));
});

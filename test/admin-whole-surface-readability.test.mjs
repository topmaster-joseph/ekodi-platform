import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workspaceAdminPage } from '../workspace-admin-page.js';
import { storeAdminPage } from '../store-admin-engine.js';
import { churchPastorAdminPage } from '../church-pastor-admin-page.js';
import { organizationAdminPage } from '../organization-admin-page.js';
import { mailAdminPage } from '../mail-admin-page.js';
import { storePortfolioAdminPage } from '../store-portfolio-admin-page.js';
import { tenantLiveAdminPage } from '../tenant-live-admin-page.js';
import { ekodiBizInvestAdminPage } from '../ekodibiz-invest-admin-page.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

async function pageContract(response,name){
  const html=await response.text();
  assert.match(html,/noindex,nofollow/i,`${name} must stay out of search indexes`);
  assert.equal(response.headers.get('cache-control'),'no-store',`${name} must not cache admin HTML`);
  assert.equal(response.headers.get('x-frame-options'),'DENY',`${name} must reject framing`);
  assert.doesNotMatch(html,/tenant-admin-command-home|ekodi-tenant-command-config/i,`${name} must not inherit the super-admin command home`);
  return html;
}

test('shared Admin Shell v3 provides one readability and mobile contract for old and new admin pages',async()=>{
  const shell=await read('shell/admin-ui-shell.js');
  assert.match(shell,/const VERSION=3/);
  assert.match(shell,/data-ekodi-admin-surface-contract/);
  assert.match(shell,/readable-direct-v1/);
  assert.match(shell,/normalizeMainRegions/);
  assert.match(shell,/HEADING_SELECTORS/);
  assert.match(shell,/SUBNAV_SELECTORS/);
  assert.match(shell,/header\.top/);
  assert.match(shell,/\.oa-side/);
  assert.match(shell,/primary-scroll-fallback/);
  assert.match(shell,/data-ekodi-admin-nav-overflow/);
  assert.match(shell,/height:auto!important;min-height:calc\(100dvh - 56px\)!important;overflow:visible!important/);
  assert.match(shell,/min-height:44px/);
  assert.match(shell,/audit:auditState/);
});

test('representative administrator surfaces keep security and no command-home leakage',async()=>{
  const pages=[
    ['workspace',workspaceAdminPage()],
    ['store',storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',mark:'JD'})],
    ['church',churchPastorAdminPage()],
    ['organization',organizationAdminPage('/hammu/admin')],
    ['mail',mailAdminPage()],
    ['store portfolio',storePortfolioAdminPage()],
    ['tenant live',tenantLiveAdminPage({name:'테스트 운영공간',apiTenant:'test',authSite:'space',path:'/test/live',home:'/test'})],
    ['invest',ekodiBizInvestAdminPage(new Request('https://ekodi.kr/ekodibiz/invest/admin'))],
  ];
  for(const [name,response] of pages)await pageContract(response,name);
});

test('all major shared administrator routes receive the Admin Shell, including tenant live managers',async()=>{
  const [router,site]=await Promise.all([read('platform-router-entry-worker.js'),read('site-worker.js')]);
  for(const pattern of [
    /injectEkodiShell\(mailAdminPage\(\),'mail','admin'\)/,
    /injectEkodiShell\(storePortfolioAdminPage\(\),'business','admin'\)/,
    /injectEkodiShell\(storeAdminPage\(\{\.\.\.storeRoute,pathname:url\.pathname\}\),'business','admin'\)/,
    /injectEkodiShell\(organizationAdminPage\(url\.pathname\),'space','admin'\)/,
    /injectEkodiShell\(churchPastorAdminPage\(\),'church','admin'\)/,
    /injectEkodiShell\(workspaceAdminPage\(\),'space','admin'\)/,
    /injectEkodiShell\(tenantLiveAdminPage\(liveAdminTenant\),'live','admin'\)/,
  ]) assert.match(router,pattern);
  assert.match(site,/injectEkodiShell\(secured, 'biz', 'admin'\)/);
});

test('Admin Shell health and live verification publish v3, not stale v2',async()=>{
  const [worker,verify]=await Promise.all([read('ekodi-shell-worker.js'),read('scripts/verify-ekodi-shell-live.mjs')]);
  assert.match(worker,/x-ekodi-admin-ui-shell',adminShell\?'v3':'missing'/);
  assert.match(worker,/adminUIShellVersion:3/);
  assert.match(verify,/adminUIShellVersion\)<3/);
  assert.match(verify,/x-ekodi-admin-ui-shell'\)!=='v3'/);
  assert.match(verify,/adminUI=v3/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tenantAdminCommandHomeCss, tenantAdminCommandHomeScript } from '../tenant-admin-command-home.js';
import { workspaceAdminPage, workspaceAdminScript } from '../workspace-admin-page.js';
import { churchPastorAdminPage, churchPastorAdminScript } from '../church-pastor-admin-page.js';
import { storeAdminPage, storeAdminScript } from '../store-admin-engine.js';
import { workspaceTradeAdminScript } from '../workspace-trade-admin-page.js';

test('tenant command home is command-only and deterministic', async()=>{
  const [css,script]=await Promise.all([tenantAdminCommandHomeCss().text(),tenantAdminCommandHomeScript().text()]);
  assert.match(css,/ekodi-tenant-command-home-active/);
  assert.match(css,/visibility:hidden!important/);
  assert.match(script,/EKODITenantCommandHome/);
  assert.ok(script.startsWith('const __name=(target)=>target;\n'));
  assert.match(script,/targetFor\(text\)/);
  assert.match(script,/ekodi-tenant-command-config/);
  assert.match(script,/queueMicrotask\(boot\)/);
  assert.match(script,/location\.assign\(route\.path\)/);
  assert.doesNotMatch(script,/\beval\s*\(/);
  assert.doesNotMatch(script,/\bfetch\s*\(/);
});

test('workspace, church and store roots reserve overview for the full manager', async()=>{
  const storePage=await storeAdminPage({slug:'jadam',name:'Jadam',mark:'JD'}).text();
  const [workspacePage,workspaceScript,churchPage,churchScript,storeScript]=await Promise.all([
    workspaceAdminPage().text(), workspaceAdminScript().text(), churchPastorAdminPage().text(),
    churchPastorAdminScript().text(), storeAdminScript().text()
  ]);
  for(const page of [workspacePage,churchPage,storePage]){
    assert.match(page,/tenant-admin-command-home\.css/);
    assert.match(page,/tenant-admin-command-home\.js/);
  }
  assert.match(workspaceScript,/mountCommandHome/);
  assert.match(workspaceScript,/adminBase}\/overview/);
  assert.match(churchScript,/mountCommandHome/);
  assert.match(churchScript,/base\+'\/overview'/);
  assert.match(storeScript,/mountCommandHome/);
  assert.match(storeScript,/ADMIN_BASE\+'\/overview'/);
});

test('trade root uses the same command-home contract without widening authority', async()=>{
  const script=await workspaceTradeAdminScript().text();
  assert.match(script,/function mountCommandHome/);
  assert.match(script,/base\+'\/overview'/);
  assert.match(script,/access\?\.can_manage_access/);
  assert.match(script,/if\(mountCommandHome\(\)\)return/);
});

test('shared-site release watches the tenant command-home runtime and contract', async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes("      - 'tenant-admin-command-home.js'"));
  assert.ok(workflow.includes("      - 'test/tenant-admin-command-home.test.mjs'"));
});

test('both production routers serve the shared command-home assets', async()=>{
  const [site,platform]=await Promise.all([
    readFile(new URL('../site-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8')
  ]);
  for(const source of [site,platform]){
    assert.match(source,/tenantAdminCommandHomeScript/);
    assert.match(source,/tenant-admin-command-home\.css/);
    assert.match(source,/tenant-admin-command-home\.js/);
  }
});

test('portfolio and Invest admin roots use declarative command homes with overview dashboards',async()=>{
  const { storePortfolioAdminPage }=await import('../store-portfolio-admin-page.js');
  const { ekodiBizInvestAdminPage }=await import('../ekodibiz-invest-admin-page.js');
  const [portfolioRoot,portfolioOverview,investRoot,investOverview]=await Promise.all([
    storePortfolioAdminPage({commandHome:true}).text(),storePortfolioAdminPage().text(),
    ekodiBizInvestAdminPage(new Request('https://ekodi.kr/ekodibiz/invest/admin')).text(),
    ekodiBizInvestAdminPage(new Request('https://ekodi.kr/ekodibiz/invest/admin/overview')).text()
  ]);
  assert.match(portfolioRoot,/ekodi-tenant-command-config/);assert.match(portfolioRoot,/tenant-admin-command-home\.js/);
  assert.doesNotMatch(portfolioOverview,/ekodi-tenant-command-config/);
  assert.match(investRoot,/ekodi-tenant-command-config/);assert.match(investRoot,/tenant-admin-command-home\.js/);
  assert.doesNotMatch(investOverview,/ekodi-tenant-command-config/);
});

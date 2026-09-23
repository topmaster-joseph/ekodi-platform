import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workspaceAdminPage, workspaceAdminScript } from '../workspace-admin-page.js';
import { churchPastorAdminPage, churchPastorAdminScript } from '../church-pastor-admin-page.js';
import { storeAdminPage, storeAdminScript } from '../store-admin-engine.js';
import { workspaceTradeAdminScript } from '../workspace-trade-admin-page.js';
import { storePortfolioAdminPage } from '../store-portfolio-admin-page.js';
import { mailAdminPage } from '../mail-admin-page.js';
import { ekodiBizInvestAdminPage } from '../ekodibiz-invest-admin-page.js';

const commandAsset=/tenant-admin-command-home\.(?:css|js)/;
const commandRuntime=/EKODITenantCommandHome|mountCommandHome|ekodi-tenant-command-config/;

test('tenant and service admin pages never load a command home',async()=>{
  const pages=await Promise.all([
    workspaceAdminPage().text(),
    churchPastorAdminPage().text(),
    storeAdminPage({slug:'jadam',name:'Jadam',mark:'JD'}).text(),
    storePortfolioAdminPage().text(),
    mailAdminPage().text(),
    ekodiBizInvestAdminPage(new Request('https://ekodi.kr/ekodibiz/invest/admin')).text(),
  ]);
  for(const page of pages){
    assert.doesNotMatch(page,commandAsset);
    assert.doesNotMatch(page,/ekodi-tenant-command-config/);
  }
});

test('tenant admin runtimes open real management screens instead of command homes',async()=>{
  const [workspace,church,store,trade]=await Promise.all([
    workspaceAdminScript().text(),
    churchPastorAdminScript().text(),
    storeAdminScript().text(),
    workspaceTradeAdminScript().text(),
  ]);
  for(const script of [workspace,church,store,trade])assert.doesNotMatch(script,commandRuntime);
  assert.match(workspace,/MISSION_DEFAULT_ACTIVITY='260926-chuseok-open-table'/);
  assert.match(workspace,/const defaultSection='overview'/);
  assert.match(store,/if\(!canSection\(section,role\)\)return permissionPanel\(\)/);
  assert.match(trade,/await loadContext\(\);renderAdminScopeSwitcher\(\);await loadCompanies\(\)/);
});

test('mail, portfolio and Invest roots are direct dashboards',async()=>{
  const [router,portfolio,mail,invest]=await Promise.all([
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../store-portfolio-admin-page.js',import.meta.url),'utf8'),
    readFile(new URL('../mail-admin-page.js',import.meta.url),'utf8'),
    readFile(new URL('../ekodibiz-invest-admin-page.js',import.meta.url),'utf8'),
  ]);
  assert.doesNotMatch(router,/commandHome:true/);
  assert.doesNotMatch(portfolio,/tenantAdminCommandHomeMeta|commandHome=/);
  assert.doesNotMatch(mail,/EKODITenantCommandHome|commandHome=/);
  assert.doesNotMatch(invest,/tenantAdminCommandHomeMeta|ekodi-tenant-command-config/);
});

test('command home remains available on the super-admin surface only',async()=>{
  const [registry,layout,sidebar]=await Promise.all([
    readFile(new URL('../admin-menu-registry.js',import.meta.url),'utf8'),
    readFile(new URL('../admin-menu-layout.js',import.meta.url),'utf8'),
    readFile(new URL('../admin-sidebar.js',import.meta.url),'utf8'),
  ]);
  assert.match(registry,/id: 'command-home'/);
  assert.match(layout,/const COMMAND_HOME='command-home'/);
  assert.match(layout,/function activateCommandHome\(\)/);
  assert.match(sidebar,/dataset\.adminCommandHome = 'true'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin root is a command-only workspace while Campus remains a child route',async()=>{
  const [bootstrap,bootstrapCss,dock,dockCss,menuLayout,menuRegistry,sidebar,e2eWorker,productionE2e]=await Promise.all([
    read('admin-assist-bootstrap.js'),
    read('admin-assist-bootstrap.css'),
    read('admin-assist-dock.js'),
    read('admin-assist-dock.css'),
    read('admin-menu-layout.js'),
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
    read('scripts/admin-authenticated-e2e-menu-worker.mjs'),
    read('scripts/verify-admin-production-ui-e2e.mjs'),
  ]);
  const parsed=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../admin-assist-bootstrap.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);

  assert.match(bootstrap,/admin-command-active/);
  assert.match(bootstrap,/ekodi-admin-section-changed',S/);
  assert.match(bootstrap,/addEventListener\('popstate',H\)/);
  assert.match(bootstrap,/addEventListener\('hashchange',H\)/);
  assert.match(bootstrap,/section==='command-home'/);
  assert.match(bootstrap,/p==='\/admin'\|\|p==='\/admin\/home'/);
  assert.doesNotMatch(bootstrap,/section==='campus'/);  assert.match(bootstrap,/ekodiAssistClose/);
  assert.match(bootstrap,/ekodi-admin-assist-request/);
  assert.match(bootstrap,/d\.loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(bootstrap,/d\.loadScript\('admin-lazy-features\.js'\)/);
  assert.match(bootstrap,/import\('\.\/admin-lazy-features\.js'\)/);

  assert.match(bootstrapCss,/html body\.admin-command-home \.ekodi-assist-bootstrap\{display:none!important\}/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.content\{[^}]*visibility:hidden!important/);
  assert.doesNotMatch(bootstrapCss,/\.ekodi-assist-panel/);

  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist\{[^}]*left:var\(--ekodi-assist-left,260px\)!important/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist\{[^}]*width:auto!important/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist-rail\{display:flex!important\}/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist-composer-wrap\{display:block!important\}/);
  assert.match(dockCss,/@media\(max-width:760px\)/);
  assert.match(dockCss,/\.admin-command-home \.ekodi-assist-bootstrap\{display:none!important\}/);

  assert.match(dock,/id=\"ekodiAssistHistory\"/);
  assert.match(dock,/id=\"ekodiAssistChat\"/);
  assert.match(dock,/api\('\/api\/control\/ai\/assist'/);
  assert.match(dock,/addSessionMessage\('assistant',reply/);
  assert.match(bootstrap,/aria-label="에코디와 대화하기"/);
  assert.match(bootstrap,/aria-label="새 대화"/);
  assert.match(bootstrap,/placeholder="에코디에게 이야기해보세요"/);
  assert.match(dock,/aria-label="에코디와 대화하기"/);
  assert.match(dock,/data-ekodi-main-conversation="true"/);
  assert.match(dock,/aria-live="polite"/);
  assert.match(dock,/최근 대화/);
  assert.match(dock,/에코디와 대화/);
  assert.match(dock,/공통 대화 이력/);
  assert.match(dock,/전체 대화 검색/);
  assert.match(dock,/function beginConversationTurn\(text\)/);
  assert.match(dock,/addSessionMessage\('user',value,\{kind:'message',status:'active'\}\);renderAi\(\);scrollChat\(\);return history/);
  const optimisticTurn=dock.indexOf('const history=beginConversationTurn(value)');
  const remoteAssist=dock.indexOf("await api('/api/control/ai/assist'");
  assert.ok(optimisticTurn>=0&&remoteAssist>optimisticTurn,'submitted text must render in the main conversation before the remote AI call');

  assert.match(menuRegistry,/defaultSection: 'command-home'/);
  assert.match(menuRegistry,/id: 'command-home'[\s\S]*ko: '에코디와 대화하기'[\s\S]*en: 'Talk with EKODI'/);
  assert.match(menuLayout,/function activateCommandHome\(\)/);
  assert.match(menuLayout,/requestedSection=COMMAND_HOME/);
  assert.match(menuLayout,/section===COMMAND_HOME\)return activateCommandHome\(\)/);
  assert.match(menuLayout,/if\(initialSection===COMMAND_HOME\)activateCommandHome\(\)/);
  assert.doesNotMatch(menuLayout,/else\{requestedSection = 'campus';dc=true;requestDemand\('campus'\);\}/);
  assert.match(sidebar,/panelSection === 'command-home'/);

  assert.match(e2eWorker,/menuId === 'command-home'/);
  assert.match(e2eWorker,/stage\('command-workbench'\)/);
  assert.match(e2eWorker,/#ekodiAssistDock/);
  assert.match(e2eWorker,/#ekodiAssistPanel/);
  assert.match(e2eWorker,/admin-command-home/);
  assert.match(e2eWorker,/pathname !== '\/admin\/'/);

  assert.match(productionE2e,/id === 'command-home'/);
  assert.match(productionE2e,/#ekodiAssistDock/);
  assert.match(productionE2e,/#ekodiAssistPanel/);
  assert.match(productionE2e,/kind:'command-workbench'/);
  assert.match(productionE2e,/command\.pathname !== '\/admin\/'/);
});

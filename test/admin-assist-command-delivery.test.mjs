import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('bootstrap never silently drops a command while Assist is lazy-loading',async()=>{
  const js=await read('admin-assist-bootstrap.js');
  const parsed=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../admin-assist-bootstrap.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);
  assert.match(js,/#ekodiAssistDock/);
  assert.match(js,/AI 오류/);
  assert.match(js,/b\.disabled=1/);
  assert.match(js,/setCustomValidity\(''\)/);
  assert.match(js,/setCustomValidity/);
  assert.match(js,/reportValidity/);
  assert.match(js,/ekodi-admin-assist-request/);
  assert.match(js,/finally\{b\.disabled=0\}/);
  assert.doesNotMatch(js,/if\(!d\?\.loadStyle\|\|!d\?\.loadScript\)return/);
  assert.ok(js.indexOf('await L')<js.indexOf("new CustomEvent('ekodi-admin-assist-request'"),'Assist runtime must resolve before command dispatch');
});

test('bootstrap explicitly awaits the dock listener runtime on demand and direct fallback paths',async()=>{
  const js=await read('admin-assist-bootstrap.js');
  assert.match(js,/window\.EKODIAdminDemand/);
  assert.match(js,/d\?\.loadStyle&&d\?\.loadScript/);
  assert.match(js,/d\.loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(js,/d\.loadStyle\('admin-assist-dock\.css'\)/);
  assert.match(js,/d\.loadScript\('admin-lazy-features\.js'\)/);
  assert.match(js,/d\.loadScript\('admin-assist-dock\.js'\)/);
  assert.match(js,/d\.loadScript\('admin-ai-control-plane\.js'\)/);
  assert.match(js,/import\('\.\/admin-lazy-features\.js'\)/);
  assert.match(js,/import\('\.\/admin-assist-dock\.js'\)/);
  assert.match(js,/import\('\.\/admin-ai-control-plane\.js'\)/);
});

test('shared-site build publishes every lazy asset required by the fixed Admin command dock',async()=>{
  const postbuild=await read('scripts/admin-readable-command-postbuild.mjs');
  for(const asset of ['admin-assist-bootstrap.js','admin-assist-bootstrap.css','admin-assist-dock.js','admin-assist-dock.css','admin-ai-control-plane.js']){
    assert.match(postbuild,new RegExp(`['\"]${asset.replaceAll('.','\\.')}['\"]`));
  }
  assert.match(postbuild,/copyFile\(`\$\{root\}\$\{asset\}`, `\$\{output\}\$\{asset\}`\)/);
});

test('production verification submits the real bottom command on canonical ekodi.kr Admin',async()=>{
  const probePath=new URL('../scripts/admin-assist-canonical-e2e.mjs',import.meta.url);
  const retryPath=new URL('../scripts/admin-authenticated-e2e-retry.mjs',import.meta.url);
  const [probe,retry]=await Promise.all([read('scripts/admin-assist-canonical-e2e.mjs'),read('scripts/admin-authenticated-e2e-retry.mjs')]);
  for(const path of [probePath,retryPath]){
    const parsed=spawnSync(process.execPath,['--check',fileURLToPath(path)],{encoding:'utf8'});
    assert.equal(parsed.status,0,parsed.stderr);
  }
  assert.match(probe,/https:\/\/ekodi\.kr\/admin\//);
  assert.match(probe,/https:\/\/ekodi\.kr\/admin\/home\/campus/);
  assert.match(probe,/https:\/\/api\.ekodi\.kr\/api\/control\/ai\/assist/);
  assert.match(probe,/#ekodiAssistBootstrap input/);
  assert.match(probe,/postDataJSON/);
  assert.match(probe,/ekodi-admin-command-history-v1/);
  assert.match(probe,/#ekodiAssistPanel:not\(\[hidden\]\)/);
  assert.match(probe,/ekodi-assist-turn\.assistant/);
  assert.doesNotMatch(probe,/admin\.ekodi\.kr/);
  assert.match(retry,/scripts\/admin-assist-canonical-e2e\.mjs/);
  assert.match(retry,/baseUrl: 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.match(retry,/canonicalCampusUrl: 'https:\/\/ekodi\.kr\/admin\/home\/campus'/);
  assert.match(retry,/aggregate\.assistProbe\?\.passed === true/);
});
test('Admin Assist treats AI_ADMIN_TIMEOUT_MS as a bounded total multi-provider budget',async()=>{
  const [handler,gateway,resilience]=await Promise.all([read('ai-agent-control.js'),read('core-ai-gateway.js'),read('ai-resilience-runtime.js')]);
  assert.match(handler,/DEFAULT_ADMIN_ASSIST_TOTAL_TIMEOUT_MS = 15_000/);
  assert.match(handler,/MAX_ADMIN_ASSIST_TOTAL_TIMEOUT_MS = 20_000/);
  assert.match(handler,/totalTimeoutMs,/);
  assert.match(gateway,/totalTimeoutMs/);
  assert.match(resilience,/remainingBudgetMs/);
  assert.match(resilience,/fairShareMs/);
});

test('Shared Site production owner watches and verifies every Assist delivery asset',async()=>{
  const workflow=await read('.github/workflows/deploy-site-core.yml');
  for(const path of [
    'admin-assist-bootstrap.js','admin-assist-bootstrap.css',
    'admin-assist-dock.js','admin-assist-dock.css',
    'admin-readable-command.js','admin-readable-command.css',
    'scripts/admin-assist-canonical-e2e.mjs',
    'scripts/admin-readable-command-postbuild.mjs',
    'test/admin-assist-command-delivery.test.mjs',
  ]) assert.match(workflow,new RegExp(path.replaceAll('.','\\.')));
  for(const asset of ['admin-assist-bootstrap.js','admin-assist-bootstrap.css','admin-assist-dock.js','admin-assist-dock.css'])
    assert.match(workflow,new RegExp(`dist/${asset.replaceAll('.','\\.')}`));
});

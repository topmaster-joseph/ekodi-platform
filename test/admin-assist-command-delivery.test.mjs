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
  assert.match(js,/AI 준비 실패/);
  assert.match(js,/b\.disabled=1/);
  assert.match(js,/setCustomValidity/);
  assert.match(js,/reportValidity/);
  assert.match(js,/ekodi-admin-assist-request/);
  assert.match(js,/finally\{b\.disabled=0\}/);
  assert.doesNotMatch(js,/if\(!d\?\.loadStyle\|\|!d\?\.loadScript\)return/);
});

test('bootstrap keeps the secured demand-loader path and a direct lazy-runtime fallback',async()=>{
  const js=await read('admin-assist-bootstrap.js');
  assert.match(js,/window\.EKODIAdminDemand/);
  assert.match(js,/d\?\.loadStyle&&d\?\.loadScript/);
  assert.match(js,/d\.loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(js,/d\.loadScript\('admin-lazy-features\.js'\)/);
  assert.match(js,/import\('\.\/admin-lazy-features\.js'\)/);
});
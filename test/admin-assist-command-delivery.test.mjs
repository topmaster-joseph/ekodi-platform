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
  assert.match(js,/script\[src=/);
  assert.match(js,/AI 모듈 로드 실패/);
  assert.match(js,/AI 명령 모듈이 준비되지 않았습니다/);
  assert.match(js,/#ekodiAssistDock/);
  assert.match(js,/b\.disabled=true/);
  assert.match(js,/b\.textContent='…'/);
  assert.match(js,/setCustomValidity/);
  assert.match(js,/reportValidity/);
  assert.match(js,/i\.value=text/);
  assert.match(js,/ekodi-admin-assist-request/);
  assert.doesNotMatch(js,/if\(!d\?\.loadStyle\|\|!d\?\.loadScript\)return/);
});

test('bootstrap retains the secured demand-loader path and direct-load fallback',async()=>{
  const js=await read('admin-assist-bootstrap.js');
  assert.match(js,/window\.EKODIAdminDemand/);
  assert.match(js,/d\?\.loadStyle\?\.bind\(d\)\|\|Y/);
  assert.match(js,/d\?\.loadScript\?\.bind\(d\)\|\|J/);
  assert.match(js,/style\('ai-ops-admin\.css'\)/);
  assert.match(js,/script\('admin-lazy-features\.js'\)/);
  assert.match(js,/script\('admin-ai-control-plane\.js'\)/);
});

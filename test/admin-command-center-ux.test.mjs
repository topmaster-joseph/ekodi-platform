import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Admin AI command center preserves contextual page and task status',async()=>{
  const js=await read('admin-assist-dock.js');
  const parsed=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../admin-assist-dock.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);
  assert.match(js,/id="ekodiAssistContextbar"|class="ekodi-assist-contextbar"/);
  assert.match(js,/id="ekodiAssistActivePage"/);
  assert.match(js,/activePage\.textContent=c\.title/);
  assert.match(js,/id="ekodiAssistRouteStatus"/);
  assert.match(js,/routeStatus\.dataset\.state=current/);
  assert.match(js,/실행 검증 필요/);
});

test('Admin non-home pages use a contextual drawer and only one active composer',async()=>{
  const [css,js]=await Promise.all([read('admin-assist-dock.css'),read('admin-assist-dock.js')]);
  assert.match(css,/COMMAND-CENTER-UX-20261023/);
  assert.match(css,/not\(\.admin-command-home\)[\s\S]*?\.ekodi-assist-panel\{[\s\S]*?width:min\(518px/);
  assert.match(css,/\.admin-command-active \.ekodi-assist-bootstrap\{[\s\S]*?display:none!important/);
  assert.match(css,/\.ekodi-assist\.rail-open \.ekodi-assist-rail\{[\s\S]*?display:flex!important/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?max-height:none!important/);
  assert.match(js,/document\.body\.classList\.toggle\('admin-command-active',state\.open\)/);
  assert.match(js,/aria-controls="ekodiAssistRail" aria-expanded="false"/);
  assert.match(js,/setAttribute\('aria-expanded',String\(railOpen\)\)/);
});

test('Assist retains server-side protected control-plane paths and explicit provider choice',async()=>{
  const js=await read('admin-assist-dock.js');
  for(const route of ['/api/control/ai/assist','/api/control/ai/v8/pulse','/api/control/ai/v8/orchestrator/human-gates']){
    assert.ok(js.includes(route));
  }
  assert.match(js,/id="ekodiAssistExecutionTarget"/);
  assert.match(js,/value="ekodi">EKODI/);
  assert.match(js,/EXTERNAL_SECRET_RE/);
});

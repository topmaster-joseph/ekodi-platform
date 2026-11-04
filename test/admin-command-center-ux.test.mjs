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
  assert.match(css,/not\(\.admin-command-home\)[\s\S]*?\.ekodi-assist-panel\{[\s\S]*?inset:72px auto 18px clamp\(14px,2vw,28px\)/);
  assert.match(css,/width:min\(850px,calc\(100% - clamp\(28px,4vw,56px\)\)\)/);
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

test('Non-home composer is left aligned, fluid and mobile safe at five reference widths',async()=>{
  const [workbench,dock,bootstrap]=await Promise.all([
    read('admin-conversation-workbench.css'),
    read('admin-assist-dock.css'),
    read('admin-assist-bootstrap.css'),
  ]);
  const marker=workbench.indexOf('ADMIN-ASSIST-LEFT-FLUID-20261104');
  assert.ok(marker>0,'shared Design Engine left alignment rule exists');
  const rule=workbench.slice(marker);
  assert.match(rule,/@media\(min-width:761px\)/);
  assert.match(rule,/admin-compact\.ekodi-admin-design-engine:not\(\.admin-command-home\) \.ekodi-assist-bootstrap\{/);
  assert.match(rule,/justify-content:flex-start!important/);
  assert.match(rule,/left:var\(--ekodi-assist-left,var\(--ekodi-admin-sidebar-width,228px\)\)!important/);
  assert.match(rule,/width:min\(850px,100%\)!important/);
  assert.match(rule,/margin-left:0!important/);
  assert.match(rule,/margin-right:0!important/);
  assert.match(rule,/min-width:0!important/);
  assert.match(rule,/\.ekodi-assist-bootstrap-actions\{\s*justify-content:flex-start!important/);
  assert.match(rule,/\.ekodi-assist-bootstrap-send\{\s*margin-left:auto!important/);
  assert.match(dock,/inset:72px auto 18px clamp\(14px,2vw,28px\)!important/);
  assert.match(dock,/width:min\(850px,calc\(100% - clamp\(28px,4vw,56px\)\)\)!important/);
  assert.match(dock,/@media\(max-width:760px\)\{[\s\S]*?\.ekodi-assist-panel\{[\s\S]*?width:100%!important/);
  assert.match(bootstrap,/@media\(max-width:760px\)/);
  for(const viewport of [320,390,768,1366,1440]){
    if(viewport<=760){assert.ok(viewport===320||viewport===390);continue;}
    const sidebar=228, pad=Math.min(28,Math.max(14,0.02*viewport));
    const available=viewport-sidebar-2*pad;
    const formWidth=Math.min(850,available);
    assert.ok(formWidth>0&&formWidth+sidebar+2*pad<=viewport, 'no horizontal clipping at '+viewport);
  }
});

test('Tablet expanded Assist panel shares non-home input left canvas baseline',async()=>{
  const css=await read('admin-assist-dock.css');
  const marker=css.indexOf('ADMIN-ASSIST-TABLET-LEFT-20261104');
  assert.ok(marker>0);
  const contract=css.slice(marker);
  assert.match(contract,/@media\(min-width:761px\) and \(max-width:960px\)/);
  assert.match(contract,/\.ekodi-assist:not\(\.history-only\)\{/);
  assert.match(contract,/left:var\(--ekodi-assist-left,var\(--ekodi-admin-sidebar-width,228px\)\)!important/);
  assert.match(contract,/right:0!important/);
  assert.match(contract,/width:auto!important/);
  assert.doesNotMatch(contract,/max-width:760px|admin-command-home\.admin-command-active/);
});

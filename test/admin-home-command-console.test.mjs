import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin keeps one bottom command dock and pins the command window on Campus',async()=>{
  const [bootstrap,bootstrapCss,dock,dockCss]=await Promise.all([
    read('admin-assist-bootstrap.js'),
    read('admin-assist-bootstrap.css'),
    read('admin-assist-dock.js'),
    read('admin-assist-dock.css'),
  ]);
  const parsed=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../admin-assist-bootstrap.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);

  assert.match(bootstrap,/admin-command-active/);
  assert.match(bootstrap,/ekodi-admin-section-changed',S/);
  assert.doesNotMatch(bootstrap,/ekodi-admin-ready/);
  assert.match(bootstrap,/ekodiAssistClose/);
  assert.match(bootstrap,/ekodi-admin-assist-request/);
  assert.match(bootstrap,/i\.value=''/);
  assert.match(bootstrap,/d\.loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(bootstrap,/d\.loadScript\('admin-lazy-features\.js'\)/);
  assert.match(bootstrap,/import\('\.\/admin-lazy-features\.js'\)/);
  assert.doesNotMatch(bootstrap,/admin-home-command-only/);
  assert.doesNotMatch(bootstrap,/ekodiAssistBootstrap'\)\?\.remove/);
  assert.match(bootstrap,/admin-command-home/);
  assert.match(bootstrap,/==='campus'/);

  assert.match(bootstrapCss,/\.ekodi-assist-bootstrap\{[^}]*bottom:0/);
  assert.match(bootstrapCss,/\.content\{padding-bottom:calc\(120px/);
  assert.match(bootstrapCss,/\.ekodi-assist\{top:88px!important;bottom:var\(--ekodi-command-dock\)!important\}/);
  assert.match(bootstrapCss,/\.ekodi-assist-launcher,\.ekodi-assist-composer-wrap\{display:none!important\}/);
  assert.match(bootstrapCss,/body\.admin-command-active \.ekodi-assist-rail\{display:flex!important\}/);
  assert.match(bootstrapCss,/body\.admin-command-active \.ekodi-assist-close\{display:none!important\}/);
  assert.match(bootstrapCss,/@media\(max-width:760px\)/);

  assert.match(dockCss,/\.admin-command-home \.ekodi-assist-bootstrap\{display:none!important\}/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.content\{[^}]*padding-right:calc\(min\(46vw,720px\) \+ 24px\)/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist\{[^}]*width:min\(46vw,720px\)!important/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist-rail\{display:none!important\}/);
  assert.match(dockCss,/body\.admin-command-home\.admin-command-active \.ekodi-assist-composer-wrap\{display:block!important/);

  assert.match(dock,/id=\"ekodiAssistHistory\"/);
  assert.match(dock,/id=\"ekodiAssistChat\"/);
  assert.match(dock,/api\('\/api\/control\/ai\/assist'/);
  assert.match(dock,/addSessionMessage\('assistant',reply/);
});

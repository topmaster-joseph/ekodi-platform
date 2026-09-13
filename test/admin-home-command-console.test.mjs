import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin root is a command-only workspace while Campus remains a child route',async()=>{
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
  assert.match(bootstrap,/addEventListener\('popstate',H\)/);
  assert.match(bootstrap,/addEventListener\('hashchange',H\)/);
  assert.match(bootstrap,/section==='command-home'/);
  assert.match(bootstrap,/p==='\/admin'\|\|p==='\/admin\/home'/);
  assert.doesNotMatch(bootstrap,/section==='campus'/);
  assert.match(bootstrap,/ekodiAssistClose/);
  assert.match(bootstrap,/ekodi-admin-assist-request/);
  assert.match(bootstrap,/d\.loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(bootstrap,/d\.loadScript\('admin-lazy-features\.js'\)/);
  assert.match(bootstrap,/import\('\.\/admin-lazy-features\.js'\)/);

  assert.match(bootstrapCss,/html body\.admin-command-home \.ekodi-assist-bootstrap\{display:none!important\}/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.content\{[^}]*visibility:hidden!important/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.ekodi-assist\{[^}]*left:var\(--ekodi-assist-left,260px\)!important/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.ekodi-assist\{[^}]*width:auto!important/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.ekodi-assist-rail\{display:flex!important\}/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.ekodi-assist-composer-wrap\{display:block!important\}/);
  assert.match(bootstrapCss,/@media\(max-width:760px\)/);

  assert.match(dockCss,/\.admin-command-home \.ekodi-assist-bootstrap\{display:none!important\}/);
  assert.match(dock,/id=\"ekodiAssistHistory\"/);
  assert.match(dock,/id=\"ekodiAssistChat\"/);
  assert.match(dock,/api\('\/api\/control\/ai\/assist'/);
  assert.match(dock,/addSessionMessage\('assistant',reply/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin keeps one bottom command dock and swaps AI conversation with menu content',async()=>{
  const [bootstrap,css,dock]=await Promise.all([
    read('admin-assist-bootstrap.js'),
    read('admin-assist-bootstrap.css'),
    read('admin-assist-dock.js'),
  ]);
  const parsed=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../admin-assist-bootstrap.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);

  assert.match(bootstrap,/admin-command-active/);
  assert.match(bootstrap,/ekodi-admin-section-changed',C/);
  assert.match(bootstrap,/ekodi-admin-ready',C/);
  assert.match(bootstrap,/ekodiAssistClose/);
  assert.match(bootstrap,/ekodi-admin-assist-request/);
  assert.match(bootstrap,/i\.value=''/);
  assert.match(bootstrap,/loadStyle\?\.bind\(d\)\|\|Y/);
  assert.match(bootstrap,/loadScript\?\.bind\(d\)\|\|J/);
  assert.match(bootstrap,/style\('ai-ops-admin\.css'\)/);
  assert.match(bootstrap,/script\('admin-lazy-features\.js'\)/);
  assert.doesNotMatch(bootstrap,/admin-home-command-only/);
  assert.doesNotMatch(bootstrap,/ekodiAssistBootstrap'\)\?\.remove/);

  assert.match(css,/\.ekodi-assist-bootstrap\{[^}]*bottom:0/);
  assert.match(css,/\.content\{padding-bottom:calc\(120px/);
  assert.match(css,/\.ekodi-assist\{top:88px!important;bottom:var\(--ekodi-command-dock\)!important\}/);
  assert.match(css,/\.ekodi-assist-launcher,\.ekodi-assist-composer-wrap\{display:none!important\}/);
  assert.match(css,/body\.admin-command-active \.ekodi-assist-rail\{display:flex!important\}/);
  assert.match(css,/body\.admin-command-active \.ekodi-assist-close\{display:none!important\}/);
  assert.match(css,/@media\(max-width:760px\)/);

  assert.match(dock,/id=\"ekodiAssistHistory\"/);
  assert.match(dock,/id=\"ekodiAssistChat\"/);
  assert.match(dock,/api\('\/api\/control\/ai\/assist'/);
  assert.match(dock,/addSessionMessage\('assistant',reply/);
});
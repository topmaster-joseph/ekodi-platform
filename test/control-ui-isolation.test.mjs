import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,css,js,worker,router]=await Promise.all([
  read('control.html'),read('control.css'),read('control.js'),
  read('site-worker.js'),read('platform-router-entry-worker.js'),
]);

test('EKODI Control has an explicit private operations-surface identity',()=>{
  assert.match(html,/<html[^>]*data-ekodi-control="v2"/);
  assert.match(html,/data-ekodi-character="off"/);
  assert.match(html,/data-ekodi-user-ai-entry="off"/);
  assert.match(html,/data-ekodi-user-surface="admin"/);
  assert.match(html,/data-ekodi-shell-surface="admin"/);
  assert.match(html,/\/control\.css\?v=20261017-control-v2/);
  assert.match(css,/html\[data-ekodi-control="v2"\] \:is\(\.ekodi-main-ekodian/);
  assert.match(css,/\.ekodi-user-ui-footer/);
});

test('operations canvas explicitly preserves white background and dark text independently of shared Shell',()=>{
  assert.match(css,/html\[data-ekodi-control="v2"\] body\{[^}]*color:#101820!important;background:#fff!important/);
  assert.match(css,/html\[data-ekodi-control="v2"\] \.control-main\{[^}]*width:auto!important;max-width:none!important/);
  assert.match(css,/html\[data-ekodi-control="v2"\] \.conversation\{[^}]*background:#fff!important;color:#101820!important/);
  assert.match(css,/html\[data-ekodi-control="v2"\] \.composer textarea\{[^}]*color:#101820!important;background:#fff!important/);
  assert.match(css,/html\[data-ekodi-control="v2"\] \.composer textarea::placeholder\{color:#596574!important/);
  assert.match(css,/html\[data-ekodi-control="v2"\] \.topbar\{[^}]*position:sticky!important/);
});

test('command controls, deployment confirmation and mobile layout remain accessible',()=>{
  assert.match(html,/id="orchestratorRelease"/);
  assert.match(html,/id="commandInput"/);
  assert.match(html,/id="sendButton"/);
  assert.match(js,/idempotencyKey/);
  assert.match(css,/@media\(max-width:760px\)\{\s*html\[data-ekodi-control="v2"\]/);
  assert.match(css,/\.composer-row \.toggle\{display:flex!important\}/);
  assert.match(css,/\.control-rail\.open\{transform:none\}/);
  assert.match(css,/\.control-main\{margin-left:0!important\}/);
  assert.match(worker,/url\.pathname === '\/control'/);
  assert.match(router,/x-ekodi-canonical-surface','control/);
});

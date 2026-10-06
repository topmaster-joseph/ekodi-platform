import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('EKODI Control is an independent conversation-first command surface',async()=>{
  const [html,css,js,worker,wrangler,build]=await Promise.all([
    read('control.html'),read('control.css'),read('control.js'),read('site-worker.js'),read('wrangler.site.toml'),read('scripts/build.mjs')
  ]);
  assert.match(html,/EKODI Control/);
  assert.match(html,/무엇을 수행할까요/);
  assert.match(html,/data-view="tasks"/);
  assert.match(html,/data-view="agents"/);
  assert.match(html,/data-view="workers"/);
  assert.match(html,/data-view="results"/);
  assert.match(html,/href="\/admin\/"/);
  assert.match(html,/value="genspark"/);
  assert.match(html,/value="multi"/);
  assert.match(css,/\.control-rail/);
  assert.match(css,/\.composer-wrap/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(js,/TOKEN_KEY='ekodi-auth-token'/);
  assert.match(js,/HISTORY_KEY='ekodi-admin-command-history-v1'/);
  assert.match(js,/\/api\/control\/ai\/v8\/pulse/);
  assert.match(js,/\/api\/control\/ai\/assist/);
  assert.match(js,/source:'control-surface'/);
  assert.match(js,/providerHint:target/);
  assert.match(worker,/url\.pathname === '\/control'/);
  assert.match(worker,/CONTROL_ASSETS/);
  assert.match(wrangler,/"\/control", "\/control\/", "\/control\/\*"/);
  assert.match(build,/'control\.html','control\.css','control\.js'/);
});

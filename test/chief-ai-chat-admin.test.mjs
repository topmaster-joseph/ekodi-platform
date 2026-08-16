import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Chief AI chat stays guarded, contextual and grounded in Control API', async () => {
  const source = await read('admin-lazy-features.js');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /CHIEF AI CONVERSATION/);
  assert.match(source, /ekodi-chief-ai-chat-v1/);
  assert.match(source, /\/api\/control\/overview/);
  assert.match(source, /\/api\/control\/check/);
  assert.match(source, /DECISION_RULES/);
  assert.match(source, /SECRET_RE/);
  assert.match(source, /Decision Gate/);
  assert.match(source, /Council Review/);
  assert.match(source, /Marketing AI/);
  assert.match(source, /sessionStorage\.setItem\(CHAT_STATE_KEY/);
  assert.doesNotMatch(source, /localStorage\.setItem\(CHAT_STATE_KEY/);
  assert.match(source, /staging → CI → guarded release/);
});

test('Chief AI chat is syntax checked, shipped, and deferred until authenticated admin app', async () => {
  const [pkg, build, shell] = await Promise.all([read('package.json'), read('scripts/build.mjs'), read('admin-authenticated-shell.js')]);
  assert.match(pkg, /node --check admin-lazy-features\.js/);
  assert.match(build, /'admin-lazy-features\.js'/);
  assert.match(build, /minimal pre-auth Control Center/);
  assert.match(shell, /'admin-lazy-features\.js'/);
  assert.match(shell, /return Boolean\(token\(\) && app && !app\.hidden\)/);
});

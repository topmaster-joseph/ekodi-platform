import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin command surface is light, readable and keeps question next to answer', async () => {
  const css = await read('admin-readable-command.css');
  assert.match(css, /governance-command-bar\{display:none!important\}/);
  assert.match(css, /\.ai-chat-form\{order:2/);
  assert.match(css, /\.ai-chat-messages\{order:4/);
  assert.match(css, /\.ai-chat-text\{font-size:15px/);
  assert.match(css, /\.ai-chat-input\{[\s\S]*font-size:15px!important/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.ai-chat-input\{[\s\S]*font-size:16px!important/);
});

test('safe fix requests use audited mission-control execution before replying', async () => {
  const js = await read('admin-readable-command.js');
  new Function(js);
  assert.match(js, /\/api\/control\/ai\/actions/);
  assert.match(js, /actionType:'service\.health_check'/);
  assert.match(js, /agentId:'chief'/);
  assert.match(js, /HUMAN_GATE_RE/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /form\.requestSubmit\(\)/);
  assert.match(js, /EKODI 자동 오케스트레이션/);
  assert.match(js, /가능한 안전조치는 먼저 실행합니다/);
});

test('readable command layer is bundled without a new runtime asset request', async () => {
  const [pkg, postbuild] = await Promise.all([
    read('package.json'),
    read('scripts/admin-readable-command-postbuild.mjs'),
  ]);
  const parsed = JSON.parse(pkg);
  assert.match(parsed.scripts.build, /admin-readable-command-postbuild\.mjs$/);
  assert.match(postbuild, /appendFile\(`\$\{output\}compact-control-center\.css`/);
  assert.match(postbuild, /appendFile\(`\$\{output\}admin-lazy-features\.js`/);
  assert.doesNotMatch(postbuild, /control-center\.html/);
});

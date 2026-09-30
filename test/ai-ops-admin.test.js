import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI Ops exposes site fleet, Chief AI context and human decision gate', async () => {
  const source = await read('ai-ops-admin.js');
  assert.match(source, /SITE_AGENTS/);
  assert.match(source, /SITE FLEET/);
  assert.match(source, /사이트 상태/);
  assert.match(source, /SELECTED SITE DETAIL/);
  assert.match(source, /Decision Gate/);
  assert.match(source, /\/api\/control\/overview/);
  assert.match(source, /\/api\/control\/check/);
  assert.match(source, /DECISION_RULES/);
  assert.match(source, /가격·요금제·결제정책 변경/);
  assert.match(source, /데이터 삭제·대량 변경·파괴적 DB 변경/);
  assert.match(source, /syncChatScope/);
});

test('AI Ops keeps status list scrollable and Chief AI conversation docked at the bottom', async () => {
  const css = await read('ai-ops-admin.css');
  assert.match(css, /\.ai-ops-panel\{[^}]*overflow:hidden/);
  assert.match(css, /\.ai-ops-main\{[^}]*flex-direction:column/);
  assert.match(css, /\.ai-fleet-scroll\{[^}]*overflow:auto/);
  assert.match(css, /#aiOpsPanel \.ai-chief-chat\{[^}]*order:20/);
  assert.match(css, /#aiOpsPanel \.ai-chief-chat\{[^}]*position:sticky/);
  assert.match(css, /#aiOpsPanel \.ai-chat-messages\{[^}]*height:auto!important/);
  assert.match(css, /\.ai-ops-side\{display:none!important\}/);
});

test('AI Ops is shipped and protected as an admin asset', async () => {
  const [build, worker, css] = await Promise.all([
    read('scripts/build.mjs'),
    read('site-worker.js'),
    read('ai-ops-admin.css'),
  ]);
  assert.match(build, /ai-ops-admin\.js/);
  assert.match(build, /ai-ops-admin\.css/);
  assert.match(worker, /'\/ai-ops-admin\.js'/);
  assert.match(worker, /'\/ai-ops-admin\.css'/);
  assert.match(css, /\.ai-fleet-table/);
  assert.match(css, /\.ai-selected-detail/);
});

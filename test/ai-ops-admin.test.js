import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI Ops exposes Chief AI, Site AI council and human decision gate', async () => {
  const source = await read('ai-ops-admin.js');
  assert.match(source, /EKODI Chief AI Control/);
  assert.match(source, /SITE_AGENTS/);
  assert.match(source, /Site AI/);
  assert.match(source, /Decision Gate/);
  assert.match(source, /Guarded Auto/);
  assert.match(source, /\/api\/control\/overview/);
  assert.match(source, /\/api\/control\/check/);
  assert.match(source, /DECISION_RULES/);
  assert.match(source, /가격·요금제·결제정책 변경/);
  assert.match(source, /데이터 삭제·대량 변경·파괴적 DB 변경/);
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
  assert.match(css, /\.ai-ops-columns/);
  assert.match(css, /\.ai-site-grid/);
});

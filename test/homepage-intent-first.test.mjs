import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage is intent-first and defaults to one visible language', async () => {
  const source = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
  assert.match(source, /무엇을 하시나요\?/);
  assert.match(source, /공동체 · 사역/);
  assert.match(source, /사업 · 성장/);
  assert.match(source, /글 · 콘텐츠/);
  assert.match(source, /연구 · 배움/);
  assert.match(source, /일 · 프로젝트/);
  assert.match(source, /내 활동/);
  assert.match(source, /enTitle\)enTitle\.hidden=true/);
  assert.match(source, /statusSub\)statusSub\.hidden=true/);
  assert.match(source, /syncVisibleStatusCounts/);
  assert.match(source, /renderRecommendations\(results,cards,query/);
});

test('homepage intent controls remain compact and responsive', async () => {
  const css = await readFile(new URL('../homepage-ambient.css', import.meta.url), 'utf8');
  assert.match(css, /EKODI homepage intent-first v8/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /dynamic-start-search/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
